import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser } from "../_lib/auth.js";
import { admin } from "../_lib/supabaseAdmin.js";
import { describeError, fail, json } from "../_lib/http.js";

/**
 * GET /api/sync/status
 *
 * 不传 task_id → 返回最近 10 次任务（同步页的历史记录）
 * 传 task_id   → 返回该任务的实时进度（前端轮询用）
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    fail(res, 405, "只支持 GET");
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const taskId = typeof req.query.task_id === "string" ? req.query.task_id : "";

  try {
    const db = admin();
    const base = db.from("wr_sync_log").select("*");

    const { data, error } = taskId
      ? await base.eq("task_id", taskId)
      : await base.order("started_at", { ascending: false }).limit(10);

    if (error) throw new Error(error.message);

    json(res, 200, { ok: true, tasks: data ?? [] });
  } catch (e) {
    console.error("[sync/status]", describeError(e));
    fail(res, 500, describeError(e));
  }
}
