import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * 服务端专用客户端，使用 service_role key。
 *
 * service_role 会绕过 RLS，因此：
 *   1. 只能出现在服务端函数里，绝不能进前端 bundle；
 *   2. 调用前必须先通过 requireUser() 校验身份，不要直接暴露写能力。
 */
export function admin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("服务端缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
