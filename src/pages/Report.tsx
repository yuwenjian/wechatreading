import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { apiPost } from '../lib/api'
import type {
  BookRow,
  HighlightRow,
  ReportContent,
  ReportGenerateResult,
  ReportRow,
  ReviewRow,
} from '../lib/types'
import { formatDate, formatDateTime, formatHoursCN } from '../lib/format'
import StatNumber from '../components/StatNumber'

/**
 * 阅读报告页：按周/月复盘「读了哪些书、留了哪些笔记」，并可生成 AI 报告。
 *
 * 周期边界全部按浏览器本地时区计算（周一为一周起点）；
 * AI 报告读写 wr_reports 缓存，水位线是「生成时的周期笔记数」。
 */

interface Props {
  books: BookRow[]
  highlights: HighlightRow[]
  reviews: ReviewRow[]
}

type Mode = 'week' | 'month' | 'year'

/** 周期中文单位：周 / 月 / 年 */
const unitCN = (m: Mode) => (m === 'week' ? '周' : m === 'month' ? '月' : '年')

type NoteEntry = {
  id: string
  kind: 'mark' | 'thought'
  book_id: string
  chapter_title: string | null
  text: string
  abstract?: string
  create_time: number
}

// ── 周期计算 ────────────────────────────────────────────────────────────────

const p2 = (n: number) => String(n).padStart(2, '0')

function periodRange(mode: Mode, offset: number): { start: Date; end: Date } {
  const now = new Date()
  if (mode === 'week') {
    // 周一为起点：getDay() 周日=0，换算成周一=0
    const dow = (now.getDay() + 6) % 7
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow + offset * 7)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    return { start, end }
  }
  if (mode === 'year') {
    return {
      start: new Date(now.getFullYear() + offset, 0, 1),
      end: new Date(now.getFullYear() + offset + 1, 0, 1),
    }
  }
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1)
  return { start, end }
}

function periodLabel(mode: Mode, start: Date, end: Date): string {
  if (mode === 'year') return `${start.getFullYear()}年`
  if (mode === 'month') return `${start.getFullYear()}年${start.getMonth() + 1}月`
  const last = new Date(end.getTime() - 86400000)
  const sameYear = start.getFullYear() === last.getFullYear()
  const a = `${start.getMonth() + 1}月${start.getDate()}日`
  const b = `${last.getMonth() + 1}月${last.getDate()}日`
  return sameYear ? `${start.getFullYear()}年${a} – ${b}` : `${start.getFullYear()}年${a} – ${last.getFullYear()}年${b}`
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

// ── 组件 ────────────────────────────────────────────────────────────────────

export default function Report({ books, highlights, reviews }: Props) {
  const [mode, setMode] = useState<Mode>('week')
  // offset 0 = 当前周期，-1 = 上一周期，以此类推
  const [offset, setOffset] = useState(0)

  const { start, end } = useMemo(() => periodRange(mode, offset), [mode, offset])
  const startTs = Math.floor(start.getTime() / 1000)
  const endTs = Math.floor(end.getTime() / 1000)
  const dayCount = Math.round((end.getTime() - start.getTime()) / 86400000)
  const startDate = `${start.getFullYear()}-${p2(start.getMonth() + 1)}-${p2(start.getDate())}`
  const label = periodLabel(mode, start, end)

  // ── 周期内笔记 ──────────────────────────────────────────────────────────
  const notes = useMemo<NoteEntry[]>(() => {
    const inRange = (t: number | null) => Number(t ?? 0) >= startTs && Number(t ?? 0) < endTs
    const marks: NoteEntry[] = highlights
      .filter((h) => inRange(h.create_time))
      .map((h) => ({
        id: h.bookmark_id,
        kind: 'mark',
        book_id: h.book_id,
        chapter_title: h.chapter_title,
        text: h.mark_text ?? '',
        create_time: Number(h.create_time ?? 0),
      }))
    const thoughts: NoteEntry[] = reviews
      .filter((r) => inRange(r.create_time))
      .map((r) => ({
        id: r.review_id,
        kind: 'thought',
        book_id: r.book_id,
        chapter_title: r.chapter_title,
        text: r.content ?? '',
        abstract: r.abstract ?? '',
        create_time: Number(r.create_time ?? 0),
      }))
    return [...marks, ...thoughts].sort((a, b) => a.create_time - b.create_time)
  }, [highlights, reviews, startTs, endTs])

  const marks = notes.filter((n) => n.kind === 'mark')
  const thoughts = notes.filter((n) => n.kind === 'thought')

  const bookById = useMemo(() => new Map(books.map((b) => [b.book_id, b])), [books])

  // 周期内涉及的书：按笔记数降序
  const activeBooks = useMemo(() => {
    const count = new Map<string, number>()
    for (const n of notes) count.set(n.book_id, (count.get(n.book_id) ?? 0) + 1)
    return [...count.entries()]
      .map(([id, c]) => ({ book: bookById.get(id), count: c }))
      .filter((x): x is { book: BookRow; count: number } => Boolean(x.book))
      .sort((a, b) => b.count - a.count)
  }, [notes, bookById])

  // 每日活跃
  const daily = useMemo(() => {
    const arr = new Array<number>(dayCount).fill(0)
    for (const n of notes) {
      const idx = Math.floor((n.create_time - startTs) / 86400)
      if (idx >= 0 && idx < dayCount) arr[idx] += 1
    }
    return arr
  }, [notes, dayCount, startTs])
  const activeDays = daily.filter((v) => v > 0).length

  // 图表数据：周/月按天，年按 12 个月聚合（365 根柱子没法看）
  const chartData = useMemo(() => {
    if (mode !== 'year') return daily
    const arr = new Array<number>(12).fill(0)
    for (const n of notes) arr[new Date(n.create_time * 1000).getMonth()] += 1
    return arr
  }, [mode, daily, notes])
  const chartMax = Math.max(1, ...chartData)

  // ── AI 报告 ─────────────────────────────────────────────────────────────
  const [report, setReport] = useState<ReportRow | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  // 切换周期时读缓存
  useEffect(() => {
    setReport(null)
    setGenError(null)
    if (!supabase) return
    let alive = true
    setReportLoading(true)
    supabase
      .from('wr_reports')
      .select('*')
      .eq('period_type', mode)
      .eq('period_start', startDate)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return
        if (!error && data) setReport(data as ReportRow)
        setReportLoading(false)
      })
    return () => {
      alive = false
    }
  }, [mode, startDate])

  async function generate(force: boolean) {
    setGenerating(true)
    setGenError(null)
    try {
      const r = await apiPost<ReportGenerateResult>('/api/report/generate', {
        type: mode,
        startDate,
        label,
        startTs,
        endTs,
        dayCount,
        force,
      })
      setReport({
        period_type: mode,
        period_start: startDate,
        content: r.report,
        model: r.model ?? null,
        note_count: r.noteCount,
        generated_at: r.generatedAt,
      })
    } catch (e) {
      setGenError(e instanceof Error ? e.message : '生成失败')
    } finally {
      setGenerating(false)
    }
  }

  const stale = report !== null && report.note_count !== notes.length

  // ── 渲染 ────────────────────────────────────────────────────────────────

  const kpis = [
    { value: String(marks.length), label: '新增划线', tw: 'text-brand-amber' },
    { value: String(thoughts.length), label: '新增想法', tw: 'text-brand-purple' },
    { value: String(activeDays), label: '活跃天数', tw: 'text-brand-teal' },
    { value: String(activeBooks.length), label: '涉及书籍', tw: 'text-brand-blue' },
  ]

  return (
    <div className="space-y-6">
      {/* 周期控制条 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-ink-line bg-ink-panel p-1">
          {(['week', 'month', 'year'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m)
                setOffset(0)
              }}
              className={`rounded-lg px-5 py-1.5 text-sm transition-colors ${
                mode === m ? 'bg-ink-panel2 text-ink-txt' : 'text-ink-muted hover:text-ink-txt'
              }`}
            >
              {unitCN(m)}报
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOffset((o) => o - 1)}
            className="rounded-lg border border-ink-line bg-ink-panel px-3 py-1.5 text-sm text-ink-muted transition-colors hover:border-ink-faint hover:text-ink-txt"
          >
            ‹ 上一{unitCN(mode)}
          </button>
          <span className="min-w-40 text-center text-sm font-medium text-ink-txt">{label}</span>
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset((o) => o + 1)}
            className="rounded-lg border border-ink-line bg-ink-panel px-3 py-1.5 text-sm text-ink-muted transition-colors hover:border-ink-faint hover:text-ink-txt disabled:cursor-not-allowed disabled:opacity-40"
          >
            下一{unitCN(mode)} ›
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((s) => (
          <div key={s.label} className="rounded-xl border border-ink-line bg-ink-panel px-4 py-3.5 sm:px-5 sm:py-4">
            <StatNumber text={s.value} className={s.tw} />
            <div className="mt-1.5 text-[13px] text-ink-muted sm:text-sm">{s.label}</div>
          </div>
        ))}
      </div>

      {notes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-line bg-ink-panel p-10 text-center text-ink-muted">
          这个周期没有任何划线或想法 —— 换个周期看看，或者去读会儿书 📖
        </div>
      ) : (
        <>
          {/* 活跃分布：周/月按天，年按月 */}
          <section className="rounded-xl border border-ink-line bg-ink-panel p-5">
            <h3 className="mb-4 text-sm font-semibold text-ink-txt">
              {mode === 'year' ? '每月笔记活跃' : '每日笔记活跃'}
            </h3>
            <div className="flex items-end gap-1 md:gap-1.5">
              {chartData.map((v, i) => {
                const barLabel =
                  mode === 'year'
                    ? `${i + 1}月`
                    : mode === 'week'
                      ? WEEKDAYS[i]
                      : i === 0 || (i + 1) % 5 === 0 || i === dayCount - 1
                        ? String(i + 1)
                        : ''
                return (
                  <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                    <span className="text-[10px] leading-none text-ink-faint">{v > 0 ? v : ''}</span>
                    <div
                      className={`w-full rounded-t ${v > 0 ? 'bg-brand-blue/80' : 'bg-ink-line/50'}`}
                      style={{ height: `${Math.max(3, Math.round((v / chartMax) * 96))}px` }}
                      title={`${v} 条`}
                    />
                    <span className="text-[10px] leading-none text-ink-muted">{barLabel}</span>
                  </div>
                )
              })}
            </div>
          </section>

          {/* 这段时间读的书 */}
          <section className="rounded-xl border border-ink-line bg-ink-panel p-5">
            <h3 className="mb-4 text-sm font-semibold text-ink-txt">
              这段时间读的书 <span className="ml-1 font-normal text-ink-faint">按笔记数排序</span>
            </h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {activeBooks.map(({ book, count }) => (
                <button
                  key={book.book_id}
                  type="button"
                  onClick={() => {
                    window.location.hash = `#/book/${encodeURIComponent(book.book_id)}`
                  }}
                  className="flex items-center gap-3 rounded-lg border border-ink-line bg-ink-panel2/50 p-3 text-left transition-colors hover:border-ink-faint"
                >
                  {book.cover_url ? (
                    <img
                      src={book.cover_url}
                      alt=""
                      loading="lazy"
                      className="h-16 w-12 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded bg-ink-panel2 text-[10px] text-ink-faint">
                      无封面
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink-txt">{book.title}</div>
                    <div className="mt-0.5 truncate text-xs text-ink-muted">{book.author}</div>
                    <div className="mt-1.5 text-xs text-ink-muted">
                      本{unitCN(mode)}
                      <span className="text-brand-amber"> {count} </span>条笔记 · 累计
                      {' ' + formatHoursCN(book.reading_time)} · 读了
                      {Math.min(100, Number(book.reading_progress ?? 0))}%
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {/* AI 报告 */}
      <section className="rounded-xl border border-ink-line bg-ink-panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink-txt">
            AI 阅读报告
            {report && !stale && (
              <span className="ml-2 text-xs font-normal text-ink-faint">
                生成于 {formatDateTime(report.generated_at)}
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            {stale && (
              <span className="text-xs text-brand-amber">期间笔记有更新，建议重新生成</span>
            )}
            {notes.length > 0 && (
              <button
                type="button"
                disabled={generating}
                onClick={() => void generate(report !== null)}
                className="rounded-lg bg-brand-blue px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generating ? '生成中…' : report ? '重新生成' : '生成 AI 报告'}
              </button>
            )}
          </div>
        </div>

        {genError && (
          <div className="mb-4 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {genError}
          </div>
        )}

        {generating ? (
          <div className="py-8 text-center text-sm text-ink-muted">
            AI 正在阅读你{mode === 'year' ? '今年' : `这${unitCN(mode)}`}的 {notes.length} 条笔记并撰写报告，大约需要 10~30 秒…
          </div>
        ) : report ? (
          <ReportBody content={report.content} />
        ) : reportLoading ? (
          <div className="py-6 text-center text-sm text-ink-muted">读取缓存中…</div>
        ) : (
          <div className="py-6 text-center text-sm text-ink-muted">
            {notes.length === 0
              ? '这个周期没有笔记，无米下锅。'
              : '还没有生成过这个周期的报告，点右上角按钮让 AI 基于上面的数据写一份。'}
          </div>
        )}
      </section>

      {/* 笔记回顾 */}
      {notes.length > 0 && (
        <section className="rounded-xl border border-ink-line bg-ink-panel p-5">
          <h3 className="mb-4 text-sm font-semibold text-ink-txt">
            笔记回顾 <span className="ml-1 font-normal text-ink-faint">{notes.length} 条</span>
          </h3>
          <div className="space-y-5">
            {activeBooks.map(({ book }) => (
              <div key={book.book_id}>
                <div className="mb-2 flex items-baseline gap-2">
                  <span className="text-sm font-medium text-ink-txt">{book.title}</span>
                  <span className="text-xs text-ink-faint">
                    {notes.filter((n) => n.book_id === book.book_id).length} 条
                  </span>
                </div>
                <div className="space-y-2">
                  {notes
                    .filter((n) => n.book_id === book.book_id)
                    .map((n) => (
                      <div
                        key={n.id}
                        className="rounded-lg border border-ink-line bg-ink-panel2/50 px-4 py-3"
                      >
                        <div className="mb-1 flex items-center gap-2 text-[11px] text-ink-faint">
                          <span
                            className={`rounded px-1.5 py-0.5 ${
                              n.kind === 'mark'
                                ? 'bg-brand-amber/15 text-brand-amber'
                                : 'bg-brand-purple/15 text-brand-purple'
                            }`}
                          >
                            {n.kind === 'mark' ? '划线' : '想法'}
                          </span>
                          {n.chapter_title && <span className="truncate">{n.chapter_title}</span>}
                          <span className="ml-auto shrink-0">{formatDate(n.create_time)}</span>
                        </div>
                        {n.kind === 'thought' && n.abstract && (
                          <div className="mb-1.5 border-l-2 border-ink-line pl-2.5 text-xs text-ink-faint">
                            {n.abstract}
                          </div>
                        )}
                        <div
                          className={`text-sm leading-relaxed ${
                            n.kind === 'mark' ? 'text-ink-muted' : 'text-ink-txt'
                          }`}
                        >
                          {n.text}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/** AI 报告正文 */
function ReportBody({ content }: { content: ReportContent }) {
  // 模型有时自带书名号，剥掉再统一包裹，避免《《书名》》
  const stripBook = (s: string) => s.trim().replace(/^《+|》+$/g, '')
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-ink-txt">{content.overview}</p>

      {content.rhythm && (
        <div>
          <div className="mb-1.5 text-xs font-semibold tracking-wide text-brand-teal">节奏观察</div>
          <p className="text-sm leading-relaxed text-ink-muted">{content.rhythm}</p>
        </div>
      )}

      {content.themes?.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold tracking-wide text-brand-blue">本期主题</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {content.themes.map((t, i) => (
              <div key={i} className="rounded-lg border border-ink-line bg-ink-panel2/50 px-3.5 py-2.5">
                <div className="text-sm font-medium text-ink-txt">{t.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-ink-muted">{t.note}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {content.picks?.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold tracking-wide text-brand-amber">精选笔记</div>
          <div className="space-y-2">
            {content.picks.map((p, i) => (
              <div key={i} className="rounded-lg border border-ink-line bg-ink-panel2/50 px-4 py-3">
                <div className="border-l-2 border-brand-amber/60 pl-3 text-sm leading-relaxed text-ink-txt">
                  {p.excerpt}
                </div>
                <div className="mt-2 flex items-baseline gap-2 text-xs">
                  <span className="shrink-0 font-medium text-ink-muted">《{stripBook(p.book)}》</span>
                  <span className="text-ink-faint">{p.why}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {content.suggestion && (
        <div className="rounded-lg border border-brand-purple/30 bg-brand-purple/10 px-4 py-3">
          <div className="mb-1 text-xs font-semibold tracking-wide text-brand-purple">下期建议</div>
          <p className="text-sm leading-relaxed text-ink-txt">{content.suggestion}</p>
        </div>
      )}
    </div>
  )
}
