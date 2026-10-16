type Tone = 'muted' | 'risk' | 'ok'

/** 统一提示条：空状态、错误、成功都用它，避免各处样式各写一套 */
export default function Hint({ text, tone = 'muted' }: { text: string; tone?: Tone }) {
  const styles: Record<Tone, string> = {
    muted: 'border-ink-line bg-ink-panel text-ink-muted',
    risk: 'border-[#5a2626] bg-[#1f1618] text-[#e08a8a]',
    ok: 'border-[#2c5245] bg-[#13211c] text-[#8fd6bd]',
  }

  return (
    <div className={`rounded-xl border p-5 text-[13.5px] leading-relaxed ${styles[tone]}`}>{text}</div>
  )
}
