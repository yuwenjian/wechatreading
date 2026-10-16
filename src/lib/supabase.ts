import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * 前端只用 anon key —— 它受 RLS 约束，读不到白名单之外的数据。
 * service_role key 绝不能出现在这里。
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null

/** 环境变量是否配齐。没配齐时 App 会给出明确提示，而不是白屏 */
export const supabaseReady = Boolean(url && anonKey)

/** 取出当前 access token，供调用服务端接口时附带 */
export async function accessToken(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
