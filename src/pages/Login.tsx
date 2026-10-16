import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { IconLogo } from '../components/icons'

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
    <div className="flex min-h-dvh items-center justify-center px-5 py-10 pt-safe pb-safe">
      <div className="w-full max-w-[400px]">
        {/* 品牌区 */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-[18px] bg-brand-500/[0.15] text-brand-blue shadow-glow">
            <IconLogo className="h-8 w-8" />
          </div>
          <h1 className="mt-4 text-[20px] font-semibold">我的阅读工作台</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
            私人数据空间，登录后查看你的划线与想法
          </p>
        </div>

        <form onSubmit={submit} className="card card-pad space-y-3.5">
          {FIXED_EMAIL ? (
            <div className="flex items-center justify-between rounded-tile border border-ink-line bg-ink-surface2 px-3.5 py-2.5">
              <span className="text-[12.5px] text-ink-muted">账号</span>
              <span className="truncate pl-3 text-[13.5px]">{FIXED_EMAIL}</span>
            </div>
          ) : (
            <div>
              <label htmlFor="email" className="mb-1.5 block text-[12.5px] text-ink-muted">
                账号邮箱
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="username"
                autoFocus
                className="field"
              />
            </div>
          )}

          <div>
            <label htmlFor="password" className="mb-1.5 block text-[12.5px] text-ink-muted">
              密码
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入密码"
              autoComplete="current-password"
              autoFocus={Boolean(FIXED_EMAIL)}
              className="field"
            />
          </div>

          <button type="submit" disabled={busy} className="btn btn-primary w-full">
            {busy ? '登录中…' : '登录'}
          </button>

          {error && (
            <p
              role="alert"
              className="hint border-brand-coral/40 bg-brand-coral/10 !py-2.5 text-[#ffb3b8]"
            >
              {error}
            </p>
          )}
        </form>

        <p className="mt-4 text-center text-[11.5px] leading-relaxed text-ink-faint">
          数据存放在你自己的 Supabase 项目里，通过行级安全策略限制为仅白名单账号可读。
          <br />
          忘记密码时在项目目录执行{' '}
          <span className="text-ink-muted">npm run set-password</span> 重设。
        </p>
      </div>
    </div>
  )
}
