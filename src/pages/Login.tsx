import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

/**
 * 固定账号：配了这个值，页面只要求输入密码。
 * 它会打包进前端，但账号邮箱本来就不是秘密 —— 真正的防线是密码 + RLS + ALLOWED_USER_ID。
 */
const FIXED_EMAIL = (import.meta.env.VITE_LOGIN_EMAIL ?? '').trim()

function friendlyError(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login credentials')) return '账号或密码不正确'
  if (m.includes('email not confirmed')) return '该账号尚未完成邮箱确认'
  if (m.includes('too many') || m.includes('rate')) return '尝试过于频繁，请稍后再试'
  return msg
}

export default function Login() {
  const [email, setEmail] = useState(FIXED_EMAIL)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return

    const target = email.trim()
    if (!target) {
      setError('请填写账号邮箱')
      return
    }
    if (!password) {
      setError('请填写密码')
      return
    }

    setBusy(true)
    setError('')

    const { error: err } = await supabase.auth.signInWithPassword({
      email: target,
      password,
    })

    // 成功时会话由 useAuth 接管，本页会被 App 换掉，无需再置 busy；失败则清空密码重填
    setBusy(false)
    if (err) {
      setError(friendlyError(err.message))
      setPassword('')
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-5 py-12">
      <div className="rounded-2xl border border-ink-line bg-ink-panel p-7">
        <h1 className="text-[18px] font-medium">我的阅读工作台</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
          这是私人数据空间，需要登录后查看。
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          {FIXED_EMAIL ? (
            <div className="flex items-center justify-between rounded-lg border border-ink-line bg-ink-panel2 px-3.5 py-2.5">
              <span className="text-[12.5px] text-ink-muted">账号</span>
              <span className="text-[13.5px]">{FIXED_EMAIL}</span>
            </div>
          ) : (
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="账号邮箱"
              autoComplete="username"
              autoFocus
              className="w-full rounded-lg border border-ink-line bg-ink-panel2 px-3.5 py-2.5 text-[13.5px] outline-none placeholder:text-ink-faint focus:border-[#3b5a86]"
            />
          )}

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            autoComplete="current-password"
            autoFocus={Boolean(FIXED_EMAIL)}
            className="w-full rounded-lg border border-ink-line bg-ink-panel2 px-3.5 py-2.5 text-[13.5px] outline-none placeholder:text-ink-faint focus:border-[#3b5a86]"
          />

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-[#3b5a86] py-2.5 text-[13.5px] font-medium text-white transition-colors hover:bg-[#46689a] disabled:opacity-50"
          >
            {busy ? '登录中…' : '登录'}
          </button>

          {error && <p className="text-[12.5px] text-[#e08a8a]">{error}</p>}
        </form>
      </div>

      <p className="mt-4 text-center text-[11.5px] leading-relaxed text-ink-faint">
        数据存放在你自己的 Supabase 项目里，通过行级安全策略限制为仅白名单账号可读。
        忘记密码时在项目目录执行 <span className="text-ink-muted">npm run set-password</span> 重设。
      </p>
    </div>
  )
}
