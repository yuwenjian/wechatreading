import type { VercelRequest, VercelResponse } from "@vercel/node";
import { admin } from "./supabaseAdmin";
import { describeError, fail } from "./http";

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

  // admin() 在缺环境变量时会抛错。它若在 try 之外崩溃，Vercel 只会给
  // FUNCTION_INVOCATION_FAILED（完全看不出原因），所以这里必须兜住
  type GetUserResult = {
    data: { user: { id: string; email?: string } | null };
    error: { message: string } | null;
  };

  let result: GetUserResult;
  try {
    result = (await admin().auth.getUser(token)) as GetUserResult;
  } catch (e) {
    console.error("[auth] 身份校验异常", describeError(e));
    fail(res, 500, `身份校验失败：${describeError(e)}`);
    return null;
  }

  if (result.error || !result.data?.user) {
    fail(res, 401, "登录状态已失效，请重新登录");
    return null;
  }

  const user = result.data.user;

  const allowed = (process.env.ALLOWED_USER_ID ?? "").trim();
  if (allowed && user.id !== allowed) {
    fail(res, 403, "当前账号无权访问该数据");
    return null;
  }

  return { id: user.id, email: user.email ?? undefined };
}
