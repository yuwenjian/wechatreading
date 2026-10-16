import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseReady } from '../lib/supabase'

/**
 * 会话管理。未登录时返回 session=null，由 App 决定渲染登录页。
 * 这里不做任何"跳过登录"的兜底 —— 数据在库里受 RLS 保护，
 * 前端跳过登录也读不到东西，反而会得到一堆难懂的报错。
 */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(supabaseReady)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let alive = true

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session ?? null)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!alive) return
      setSession(s)
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  async function signOut() {
    await supabase?.auth.signOut()
  }

  return { session, loading, signOut }
}
