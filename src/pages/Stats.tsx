import type { BookRow, StatsPayload } from '../lib/types'
import { formatHoursCN } from '../lib/format'

interface Props {
  books: BookRow[]
  stats: StatsPayload | null
}

/** 与 WorkBuddy 参考工作台「阅读统计」视图一致：官方统计快照 + 纯 CSS 条形图 */
export default function Stats({ books, stats }: Props) {
  if (!stats) {
    return (
      <div className="rounded-xl border border-dashed border-ink-line bg-ink-panel p-10 text-center text-ink-muted">
        {books.length === 0
          ? '还没有阅读数据，先到「同步」页拉一次数据吧'
          : '还没有统计快照，到「同步」页再同步一次即可生成'}
      </div>
    )
  }

  const total = stats.totalReadTime || 0
  const daily = stats.readDays ? Math.round(total / stats.readDays / 60) : 0
  const registYear = stats.registTime
    ? String(new Date(stats.registTime * 1000).getFullYear())
    : '-'

  const cards = [
    { n: formatHoursCN(total), l: '累计阅读（含听书）', c: 'text-brand-blue' },
    { n: `${stats.readDays || 0}天`, l: '有效阅读天数', c: 'text-brand-teal' },
    { n: `${daily}分`, l: '每个阅读日均', c: 'text-brand-amber' },
    { n: registYear, l: '注册年份', c: 'text-brand-coral' },
  ]

  const yearly = (stats.yearly ?? []).filter((y) => y.seconds > 60)
  const yearMax = yearly.length ? Math.max(...yearly.map((y) => y.seconds)) : 1

  const longest = stats.readLongest ?? []
  const longMax = longest.length ? longest[0].seconds : 1

  const cats = (stats.preferCategory ?? [])
    .filter((c) => c.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds)
  const catMax = cats.length ? cats[0].seconds : 1

  const pt = stats.preferTime ?? []
  const ptMax = pt.length ? Math.max(...pt) : 1

  return (
    <div className="space-y-5">
      {/* 顶部四格统计 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((s) => (
          <div
            key={s.l}
            className="rounded-xl border border-ink-line bg-ink-panel px-[18px] py-4"
          >
            <div className={`text-[26px] font-semibold leading-snug ${s.c}`}>
              {s.n}
            </div>
            <div className="mt-0.5 text-xs text-ink-muted">{s.l}</div>
          </div>
        ))}
      </div>

      {/* 官方概览标签 */}
      {(stats.readStat?.length || stats.preferTimeWord || stats.preferCategoryWord) && (
        <div className="flex flex-wrap gap-2">
          {(stats.readStat ?? []).map((s, i) => (
            <Tag key={i}>
              {s.stat} {s.counts}
            </Tag>
          ))}
          {stats.preferTimeWord && (
            <span className="rounded-md border border-ink-line bg-ink-panel2 px-2.5 py-[3px] text-[11.5px] text-brand-amber">
              {stats.preferTimeWord}
            </span>
          )}
          {stats.preferCategoryWord && (
            <span className="rounded-md border border-ink-line bg-ink-panel2 px-2.5 py-[3px] text-[11.5px] text-brand-purple">
              {stats.preferCategoryWord}
            </span>
          )}
        </div>
      )}

      {/* 每年阅读时长 */}
      {yearly.length > 0 && (
        <Panel title="每年阅读时长" sub="单位：小时">
          <div className="flex h-[210px] items-end gap-2.5 pt-2.5">
            {yearly.map((y) => (
              <div
                key={y.year}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
              >
                <div className="mb-[5px] whitespace-nowrap text-[10.5px] text-ink-muted">
                  {Math.round((y.seconds / 3600) * 10) / 10}
                </div>
                <div
                  className="w-full max-w-12 rounded-t-[5px] bg-brand-blue"
                  style={{ height: `${Math.max(2, (y.seconds / yearMax) * 100)}%` }}
                />
                <div className="mt-[7px] text-[11px] text-ink-faint">{y.year}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* 读得最久的书 Top 10 */}
      {longest.length > 0 && (
        <Panel title="读得最久的书" sub="Top 10 · 按累计耗时">
          <div className="space-y-2.5">
            {longest.map((r) => {
              const tags = (r.tags ?? []) as string[]
              return (
                <div key={r.bookId || r.title} className="group flex items-center gap-3">
                  <div className="w-40 shrink-0 truncate text-right text-[12.5px] group-hover:text-brand-blue">
                    {r.title}
                    {tags.length > 0 && (
                      <span className="text-brand-amber"> ·{tags[0]}</span>
                    )}
                  </div>
                  <div className="h-[22px] flex-1 overflow-hidden rounded-[5px] bg-ink-panel2">
                    <div
                      className="h-full rounded-[5px] bg-brand-teal"
                      style={{
                        width: `${Math.max(3, (r.seconds / longMax) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="w-[52px] shrink-0 text-[11px] text-ink-muted">
                    {Math.round((r.seconds / 3600) * 10) / 10}h
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      {/* 分类偏好 */}
      {cats.length > 0 && (
        <Panel title="分类偏好" sub="按累计阅读时长">
          <div className="space-y-[9px]">
            {cats.map((c) => {
              const label =
                c.parent && c.parent !== c.title ? `${c.parent}/${c.title}` : c.title
              return (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-[130px] shrink-0 truncate text-right text-[12.5px]">
                    {label}
                  </div>
                  <div className="h-5 flex-1 overflow-hidden rounded-[5px] bg-ink-panel2">
                    <div
                      className="h-full rounded-[5px] bg-brand-purple"
                      style={{
                        width: `${Math.max(2, (c.seconds / catMax) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="w-[84px] shrink-0 text-[11px] text-ink-muted">
                    {formatHoursCN(c.seconds)} · {c.count}本
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      {/* 一天中的阅读时段 */}
      {pt.length > 0 && (
        <Panel
          title="一天中的阅读时段"
          sub={`早6点至次日5点${stats.preferTimeWord ? ` · ${stats.preferTimeWord}` : ''}`}
        >
          <div className="flex h-[130px] items-end gap-[2px] pt-2">
            {Array.from({ length: 24 }, (_, i) => {
              const hour = (6 + i) % 24
              return (
                <div key={i} className="flex h-full flex-1 flex-col justify-end">
                  <div
                    className="w-full rounded-[2px] bg-brand-amber"
                    style={{
                      height: `${Math.max(1, ((pt[i] ?? 0) / ptMax) * 100)}%`,
                      minHeight: 1,
                    }}
                  />
                  <div className="mt-[5px] text-center text-[9px] text-ink-faint">
                    {hour}
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      {/* 常读出版社 */}
      {stats.preferPublisher?.length > 0 && (
        <Panel title="常读出版社">
          <div className="flex flex-wrap gap-2">
            {stats.preferPublisher.map((p) => (
              <span
                key={p.name}
                className="rounded-lg border border-ink-line bg-ink-panel2 px-3 py-[5px] text-xs text-ink-muted"
              >
                {p.name} · {p.count}本
              </span>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}

function Panel({
  title,
  sub,
  children,
}: {
  title: string
  sub?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[14px] border border-ink-line bg-ink-panel px-[22px] py-5">
      <h3 className="mb-[18px] text-[15px] font-semibold">
        {title}
        {sub && (
          <small className="ml-2 text-xs font-normal text-ink-faint">{sub}</small>
        )}
      </h3>
      {children}
    </section>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-ink-line bg-ink-panel2 px-2.5 py-[3px] text-[11.5px] text-ink-muted">
      {children}
    </span>
  )
}
