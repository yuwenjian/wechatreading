import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser } from "../_lib/auth";
import { admin } from "../_lib/supabaseAdmin";
import { describeError, fail, json } from "../_lib/http";
import { listNotebooks } from "../_lib/weread";
import { syncOneBook } from "../_lib/sync";

/**
 * POST /api/sync/batch
 *
 * 处理一批书：逐本拉明细 → 幂等入库 → 推进队列。
 *
 * 为什么分批：微信读书没有批量导出接口，15 本书要 60+ 次请求，
 * 一个长请求必然撞上函数执行时限。拆成小批后，单次请求稳定在时限内，
 * 且任务队列（pending_book_ids）持久化在库里，中断后重跑不会丢进度、
 * 也不会产生重复数据。
 *
 * body:
 *   task_id  必填
 *   limit    每批本数，默认 4，范围 1-8
 *   book_ids 可选。给了就走"重试模式"：只处理这些书，不推进队列。
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    fail(res, 405, "只支持 POST");
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const body = (req.body ?? {}) as Record<string, any>;
  const taskId = String(body.task_id ?? "");
  const limit = Math.min(Math.max(Number(body.limit ?? 4), 1), 8);
  const explicit: string[] | null = Array.isArray(body.book_ids)
    ? body.book_ids.map((x: unknown) => String(x))
    : null;

  if (!taskId) {
    fail(res, 400, "缺少 task_id");
    return;
  }

  try {
    const db = admin();

    const { data: task, error: taskErr } = await db
      .from("wr_sync_log")
      .select("*")
      .eq("task_id", taskId)
      .maybeSingle();

    if (taskErr) throw new Error(taskErr.message);
    if (!task) {
      fail(res, 404, "同步任务不存在");
      return;
    }

    const pending: string[] = Array.isArray(task.pending_book_ids) ? task.pending_book_ids : [];
    const source = explicit ?? pending;

    if (source.length === 0) {
      if (task.status !== "done") {
        await db
          .from("wr_sync_log")
          .update({ status: "done", finished_at: new Date().toISOString() })
          .eq("task_id", taskId);
      }
      json(res, 200, { ok: true, done: true, processed: 0, remaining: 0, failed: [], notes: 0, progress: 100 });
      return;
    }

    const batch = source.slice(0, limit);
    // 重试模式不动队列，正常模式推进队列
    const rest = explicit ? pending : pending.slice(limit);

    // 取一次计数表：成功入库后要用它写回 note_count 等判据
    const notebooks = await listNotebooks();
    const countersById = new Map<string, (typeof notebooks.books)[number]>();
    for (const b of notebooks.books) countersById.set(b.bookId, b);

    const failedNow: string[] = [];
    let notes = 0;

    for (const bookId of batch) {
      try {
        const r = await syncOneBook(bookId, countersById.get(bookId));
        notes += r.highlights + r.reviews;
      } catch (e) {
        // 单本失败不拖垮整批：计数不写回，下次同步会自动重新判定为"有变化"
        failedNow.push(bookId);
        console.error(`[sync/batch] ${bookId} 失败:`, describeError(e));
      }
    }

    const prevFailed: string[] = Array.isArray(task.failed_book_ids) ? task.failed_book_ids : [];
    const allFailed = Array.from(new Set([...prevFailed, ...failedNow]));

    const done = explicit ? true : rest.length === 0;
    await db
      .from("wr_sync_log")
      .update({
        pending_book_ids: rest,
        failed_book_ids: allFailed,
        status: done ? "done" : "running",
        finished_at: done ? new Date().toISOString() : null,
        notes_total: Number(task.notes_total ?? 0) + notes,
      })
      .eq("task_id", taskId);

    const total = Number(task.books_changed ?? 0) || batch.length + rest.length;
    const remaining = rest.length;

    json(res, 200, {
      ok: true,
      done,
      processed: batch.length,
      remaining,
      failed: failedNow,
      failedIds: allFailed,
      notes,
      progress: total > 0 ? Math.round(((total - remaining) / total) * 100) : 100,
    });
  } catch (e) {
    console.error("[sync/batch]", describeError(e));
    fail(res, 500, describeError(e));
  }
}
