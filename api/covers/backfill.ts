import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser } from "../_lib/auth";
import { admin } from "../_lib/supabaseAdmin";
import { describeError, fail, json } from "../_lib/http";
import { isMirrored, mirrorCover } from "../_lib/covers";

/**
 * POST /api/covers/backfill
 *
 * 把「还挂在微信读书 CDN 上」的封面补齐到自己的 Storage。
 *
 * 为什么需要这个独立入口而不是只靠同步顺带做：
 *   同步只处理「笔记计数有变化」的书。一旦某本书的封面在同步时下载失败
 *   （退化为 CDN 原址），它的计数没有变化，下次同步就不会再碰它 ——
 *   封面也就永远补不上。所以封面必须有独立的补齐通道。
 *
 * 请求体（可选）：{ limit?: number, force?: boolean }
 *   limit  本次最多处理几本，默认 10，上限 25（避免一次请求打满函数时限）
 *   force  连已镜像过的也重新下载（源图换了、或想统一刷新时才用）
 *
 * 幂等：对象名固定为 <book_id>.<ext>，重复执行只会覆盖同名对象。
 */

export const config = { maxDuration: 60 };

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

type BookRow = {
  book_id: string;
  title: string | null;
  cover_url: string | null;
  cover_source_url: string | null;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    fail(res, 405, "只支持 POST");
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  try {
    const body =
      typeof req.body === "string"
        ? (JSON.parse(req.body || "{}") as Record<string, unknown>)
        : ((req.body ?? {}) as Record<string, unknown>);

    const limit = clamp(Number(body.limit) || DEFAULT_LIMIT, 1, MAX_LIMIT);
    const force = body.force === true;

    const db = admin();
    const { data, error } = await db
      .from("wr_books")
      .select("book_id, title, cover_url, cover_source_url")
      .order("title", { ascending: true });
    if (error) throw new Error(`读取书目失败：${error.message}`);

    const rows = (data ?? []) as BookRow[];

    // 找源图：优先用记下的原址；没有原址时，只要当前地址不是自己的 Storage
    // 就把它当作源图（兼容早期写入的行）。
    const resolveSource = (r: BookRow): string | null =>
      r.cover_source_url ?? (isMirrored(r.cover_url) ? null : r.cover_url);

    const pending = rows.filter((r) => {
      const src = resolveSource(r);
      if (!src) return false;
      return force ? true : !isMirrored(r.cover_url);
    });

    const slice = pending.slice(0, limit);
    const mirrored: string[] = [];
    const failed: Array<{ bookId: string; title: string; error: string }> = [];

    for (const r of slice) {
      const src = resolveSource(r);
      if (!src) continue;

      try {
        const url = await mirrorCover(String(r.book_id), src, {
          force,
          currentUrl: r.cover_url,
        });

        const { error: upErr } = await db
          .from("wr_books")
          .update({
            cover_url: url,
            cover_source_url: src,
            cover_mirrored_at: new Date().toISOString(),
          })
          .eq("book_id", r.book_id);
        if (upErr) throw new Error(upErr.message);

        mirrored.push(String(r.book_id));
      } catch (e) {
        // 单本失败不影响整批：记下来，下次还会被选中（因为它仍未镜像）
        failed.push({
          bookId: String(r.book_id),
          title: r.title ?? "",
          error: describeError(e),
        });
      }
    }

    const remaining = pending.length - slice.length;

    json(res, 200, {
      ok: true,
      total: rows.length,
      pending: pending.length,
      processed: slice.length,
      mirroredCount: mirrored.length,
      mirrored,
      failed,
      remaining,
      done: remaining === 0,
      message:
        pending.length === 0
          ? "所有书籍封面都已在 Supabase Storage 上，无需补齐。"
          : `本次镜像 ${mirrored.length} 本，剩余 ${remaining} 本。`,
    });
  } catch (e) {
    console.error("[covers/backfill]", describeError(e));
    fail(res, 500, describeError(e));
  }
}
