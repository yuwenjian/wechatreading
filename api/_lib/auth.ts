import type { VercelRequest, VercelResponse } from "@vercel/node";
import { admin } from "./supabaseAdmin";
import { fail } from "./http";

export type AuthedUser = { id: string; email?: string };

/**
 * 校验调用者身份，未通过时直接写出错误响应并返回 null。
 *
 * 双重校验：
 *   1. Supabase Auth 签发的 access token 必须有效；
 *   2. 若配置了 ALLOWED_USER_ID，则只放行该用户 —— 这样即使有人
 *      在某处注册了账号，也拿不到数据。
 */
export async function requireUser(
  req: VercelRequest,
  res: VercelResponse,
): Promise<AuthedUser | null> {
  const header = String(req.headers.authorization ?? "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) {
    fail(res, 401, "未登录，请先登录后再操作");
    return null;
  }

  const { data, error } = await admin().auth.getUser(token);
  if (error || !data?.user) {
    fail(res, 401, "登录状态已失效，请重新登录");
    return null;
  }

  const allowed = (process.env.ALLOWED_USER_ID ?? "").trim();
  if (allowed && data.user.id !== allowed) {
    fail(res, 403, "当前账号无权访问该数据");
    return null;
  }

  return { id: data.user.id, email: data.user.email ?? undefined };
}
