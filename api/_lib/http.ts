import type { VercelResponse } from "@vercel/node";

/** 统一 JSON 响应，避免每个 handler 重复设置头 */
export function json(res: VercelResponse, status: number, body: unknown): void {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(JSON.stringify(body));
}

/** 统一错误响应。对外只给可读信息，不吐内部细节与堆栈 */
export function fail(
  res: VercelResponse,
  status: number,
  error: string,
  extra?: Record<string, unknown>,
): void {
  json(res, status, { ok: false, error, ...extra });
}

/** 把未知异常转成一句人话，细节只写进服务端日志 */
export function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "未知错误";
}
