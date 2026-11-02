/**
 * 环形进度：给详情页的「阅读进度」用。
 * 用 SVG 圆环而不是进度条，是为了在众多条形元素里做出形状差异。
 * 尺寸与描边全部可传，默认 72px。
 */
export default function ProgressRing({
  value,
  size = 72,
  stroke = 6,
  label,
}: {
  /** 0–100 */
  value: number
  size?: number
  stroke?: number
  label?: string
}) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = (pct / 100) * c

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="oklch(var(--ink-surface2))"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="oklch(var(--brand-500))"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: 'stroke-dasharray .5s cubic-bezier(.16,1,.3,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tnum text-base font-semibold leading-none">{pct}%</span>
        {label && <span className="mt-1 text-2xs leading-none text-ink-faint">{label}</span>}
      </div>
    </div>
  )
}
