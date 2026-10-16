type Tone = 'muted' | 'risk' | 'ok'

/** 统一提示条：空状态、错误、成功都用它，避免各处样式各写一套 */
export default function Hint({ text, tone = 'muted' }: { text: string; tone?: Tone }) {
  const styles: Record<Tone, string> = {
    muted: 'border-ink-line bg-ink-surface2/60 text-ink-muted',
    risk: 'border-brand-coral/40 bg-brand-coral/10 text-[#ffb3b8]',
    ok: 'border-brand-teal/[0.35] bg-brand-teal/10 text-brand-teal',
  }

  return <div className={`hint ${styles[tone]}`}>{text}</div>
}
