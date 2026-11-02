import type { BookRow, StatsPayload } from '../lib/types'
import { formatHoursCN } from '../lib/format'
import StatNumber from '../components/StatNumber'
import EmptyState from '../components/EmptyState'
import { IllustEmptyChart } from '../components/icons'

interface Props {
  books: BookRow[]
  stats: StatsPayload | null
}

/** 阅读统计：官方统计快照 + 纯 CSS 条形图（移动端上下堆叠，PC 左右并排） */
export default function Stats({ books, stats }: Props) {
  if (!stats) {
    return (
      <EmptyState
        icon={<IllustEmptyChart className="h-8 w-8" />}
        title={books.length === 0 ? '还没有阅读数据' : '还没有统计快照'}
        desc={
          books.length === 0
            ? '先到「同步」页拉一次数据，这里就会显示累计时长、阅读偏好与每年的阅读曲线。'
            : '到「同步」页再同步一次即可生成统计快照。'
        }
      />
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
    <div className="space-y-4 sm:space-y-5">
      {/* 顶部四格统计 */}
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((s) => (
          <div key={s.l} className="stat-card">
            <StatNumber text={s.n} className={s.c} />
            <div className="mt-2 text-2xs text-ink-muted">{s.l}</div>
          </div>
        ))}
      </div>

      {/* 官方概览标签 */}
      {(stats.readStat?.length || stats.preferTimeWord || stats.preferCategoryWord) && (
        <div className="flex flex-wrap gap-2">
          {(stats.readStat ?? []).map((s, i) => (
            <span key={i} className="chip chip-off !min-h-[34px] !text-2xs">
              {s.stat} <span className="tnum">{s.counts}</span>
            </span>
          ))}
          {stats.preferTimeWord && (
            <span className="chip !min-h-[34px] border-brand-amber/[0.45] bg-brand-amber/[0.14] !text-2xs text-brand-amber">
              {stats.preferTimeWord}
            </span>
          )}
          {stats.preferCategoryWord && (
            <span className="chip !min-h-[34px] border-brand-purple/[0.45] bg-brand-purple/[0.14] !text-2xs text-brand-purple">
              {stats.preferCategoryWord}
            </span>
          )}
        </div>
      )}

      {/* 时间维度：PC 双栏并排 */}
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        {yearly.length > 0 && (
          <Panel title="每年阅读时长" sub="单位：小时">
            <div className="flex h-[180px] items-end gap-2 pt-3 sm:h-[210px] sm:gap-2.5">
              {yearly.map((y) => (
                <div key={y.year} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                  <div className="tnum mb-1.5 whitespace-nowrap text-2xs text-ink-muted">
                    {Math.round((y.seconds / 3600) * 10) / 10}
                  </div>
                  <div
                    className="w-full max-w-12 rounded-t-[6px] bg-gradient-to-t from-brand-500/[0.45] to-brand-400"
                    style={{ height: `${Math.max(2, (y.seconds / yearMax) * 100)}%` }}
                  />
                  <div className="tnum mt-2 text-2xs text-ink-faint">{y.year}</div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {pt.length > 0 && (
          <Panel
            title="一天中的阅读时段"
            sub={`早6点至次日5点${stats.preferTimeWord ? ` · ${stats.preferTimeWord}` : ''}`}
          >
            <div className="flex h-[120px] items-end gap-[2px] pt-3 sm:h-[130px] sm:gap-1">
              {Array.from({ length: 24 }, (_, i) => {
                const hour = (6 + i) % 24
                return (
                  <div key={i} className="flex h-full flex-1 flex-col justify-end">
                    <div
                      className="w-full rounded-t-[3px] bg-gradient-to-t from-brand-amber/[0.4] to-brand-amber"
                      style={{ height: `${Math.max(1, ((pt[i] ?? 0) / ptMax) * 100)}%`, minHeight: 2 }}
                    />
                    <div className="tnum mt-1.5 text-center text-[10px] text-ink-faint">
                      {hour % 3 === 0 ? hour : ''}
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>
        )}
      </div>

      {/* 书目 / 分类维度 */}
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        {longest.length > 0 && (
          <Panel title="读得最久的书" sub="Top 10 · 按累计耗时">
            <div className="space-y-3 sm:space-y-2.5">
              {longest.map((r) => {
                const tags = (r.tags ?? []) as string[]
                return (
                  <div key={r.bookId || r.title} className="group">
                    <div className="mb-1 flex items-baseline justify-between gap-2 sm:hidden">
                      <span className="truncate text-2xs">
                        {r.title}
                        {tags.length > 0 && <span className="text-brand-amber"> ·{tags[0]}</span>}
                      </span>
                      <span className="tnum shrink-0 text-2xs text-ink-muted">
                        {Math.round((r.seconds / 3600) * 10) / 10}h
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="hidden w-40 shrink-0 truncate text-right text-2xs group-hover:text-brand-blue sm:block">
                        {r.title}
                        {tags.length > 0 && <span className="text-brand-amber"> ·{tags[0]}</span>}
                      </div>
                      <div className="h-[22px] flex-1 overflow-hidden rounded-[6px] bg-ink-surface2">
                        <div
                          className="h-full rounded-[6px] bg-gradient-to-r from-brand-teal/[0.5] to-brand-teal"
                          style={{ width: `${Math.max(3, (r.seconds / longMax) * 100)}%` }}
                        />
                      </div>
                      <div className="tnum hidden w-[52px] shrink-0 text-2xs text-ink-muted sm:block">
                        {Math.round((r.seconds / 3600) * 10) / 10}h
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>
        )}

        {cats.length > 0 && (
          <Panel title="分类偏好" sub="按累计阅读时长">
            <div className="space-y-3 sm:space-y-2">
              {cats.map((c) => {
                const label =
                  c.parent && c.parent !== c.title ? `${c.parent}/${c.title}` : c.title
                return (
                  <div key={label}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 sm:hidden">
                      <span className="truncate text-2xs">{label}</span>
                      <span className="tnum shrink-0 text-2xs text-ink-muted">
                        {formatHoursCN(c.seconds)} · {c.count}本
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="hidden w-[120px] shrink-0 truncate text-right text-2xs sm:block">
                        {label}
                      </div>
                      <div className="h-5 flex-1 overflow-hidden rounded-[6px] bg-ink-surface2">
                        <div
                          className="h-full rounded-[6px] bg-gradient-to-r from-brand-purple/[0.5] to-brand-purple"
                          style={{ width: `${Math.max(2, (c.seconds / catMax) * 100)}%` }}
                        />
                      </div>
                      <div className="tnum hidden w-[84px] shrink-0 text-2xs text-ink-muted sm:block">
                        {formatHoursCN(c.seconds)} · {c.count}本
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>
        )}
      </div>

      {/* 常读出版社 */}
      {stats.preferPublisher?.length > 0 && (
        <Panel title="常读出版社">
          <div className="flex flex-wrap gap-2">
            {stats.preferPublisher.map((p) => (
              <span key={p.name} className="chip chip-off !min-h-[36px] !text-2xs">
                {p.name}
                <span className="tnum text-ink-faint">{p.count}本</span>
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
    <section className="card card-pad">
      <h3 className="section-title mb-4">
        {title}
        {sub && <span className="section-sub">{sub}</span>}
      </h3>
      {children}
    </section>
  )
}
