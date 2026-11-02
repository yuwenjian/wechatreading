import type { ReactNode } from 'react'

/**
 * 统一空状态：插图 + 标题 + 说明 + 可选操作。
 * 空状态是产品里最容易被忽略、也最能体现完成度的地方，所以单独收口成组件，
 * 保证所有页面的空状态长得一样，并且都给用户一条下一步的路。
 */
export default function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon: ReactNode
  title: string
  desc?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-ink-line bg-ink-surface/[0.55] px-6 py-12 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-ink-surface2 text-ink-faint">
        {icon}
      </div>
      <p className="text-base font-medium text-ink-txt">{title}</p>
      {desc && <p className="prose-narrow mt-1.5 text-sm leading-relaxed text-ink-muted">{desc}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
