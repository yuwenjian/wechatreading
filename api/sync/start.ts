import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser } from "../_lib/auth";
import { admin } from "../_lib/supabaseAdmin";
import { describeError, fail, json } from "../_lib/http";
import { prepareSync, syncStats } from "../_lib/sync";

/**
 * POST /api/sync/start
 *
 * 建任务：拉书目 → 算变化集 → 落库 → 返回 task_id。
 * 这一步只花 2 次外部请求（notebooks + overall），必然在函数时限内完成。
 * 真正的逐本详拉交给 /api/sync/batch 分批处理，前端轮询进度。
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    fail(res, 405, "只支持 POST");
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  try {
    const { booksTotal, notesTotal, changed } = await prepareSync();

    // 统计快照顺手更新，避免再多开一个接口。
    // 失败不阻断同步：书目与笔记才是主线，统计下次再补。
    try {
      await syncStats();
    } catch (statsErr) {
      console.error("[sync/start] 统计快照更新失败:", describeError(statsErr));
    }

    const done = changed.length === 0;
    const { data: task, error } = await admin()
      .from("wr_sync_log")
      .insert({
        trigger_source: (req.body as any)?.trigger === "cron" ? "cron" : "manual",
        status: done ? "done" : "running",
        books_total: booksTotal,
        books_changed: changed.length,
        pending_book_ids: changed,
        notes_total: notesTotal,
        finished_at: done ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    json(res, 200, { ok: true, task });
  } catch (e) {
    console.error("[sync/start]", describeError(e));
    fail(res, 500, describeError(e));
  }
}
