/**
 * KPI 大数字：数字用大字、单位（小时/分/天…）用小字并排，
 * 避免「292小时30分」这类长值在窄卡片里逐字折行。
 * 颜色 class（text-brand-*）由调用方通过 className 传进来，子元素自动继承。
 */
export default function StatNumber({
  text,
  className = '',
}: {
  text: string
  className?: string
}) {
  const parts = text.match(/\d[\d,]*|\D+/g) ?? [text]
  return (
    <div className={`flex flex-wrap items-baseline gap-x-0.5 ${className}`}>
      {parts.map((p, i) =>
        /^\d/.test(p) ? (
          <span
            key={i}
            className="text-[22px] font-semibold leading-none tracking-tight sm:text-3xl"
          >
            {p}
          </span>
        ) : (
          <span key={i} className="text-[13px] font-medium leading-none sm:text-base">
            {p}
          </span>
        ),
      )}
    </div>
  )
}
