import { useMemo } from 'react'
import type { AnalysisRow, BookRow, HighlightRow, ReviewRow } from '../lib/types'
import {
  formatDate,
  formatHoursCN,
  formatRating,
  formatWords,
  groupCategory,
  groupNumber,
} from '../lib/format'
import ProgressRing from '../components/ProgressRing'
import {
  IconBack,
  IconClock,
  IconExternal,
  IconIdea,
  IconQuote,
  IconSpark,
  IconStar,
} from '../components/icons'

interface Props {
  book: BookRow
  highlights: HighlightRow[]
  reviews: ReviewRow[]
  analysis: AnalysisRow | undefined
  onBack: () => void
}

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, '')

/** 书籍详情：Hero + 阅读数据 + AI 分析 + 按章节的划线与想法（PC 双栏，移动端单列） */
export default function BookDetail({ book, highlights, reviews, analysis, onBack }: Props) {
  const rating = formatRating(book.rating)
  const pct = Math.min(100, Number(book.reading_progress ?? 0))

  // 想法 → 挂到对应划线上（abstract 即被点评的原文）；挂不上的进「未关联」
  const { attached, loose } = useMemo(() => {
    const attached = new Map<string, ReviewRow[]>()
    const loose: ReviewRow[] = []
    const marks = highlights.map((h) => ({ h, n: norm(h.mark_text) }))
    for (const r of reviews) {
      const a = norm(r.abstract)
      if (a && r.content) {
        const hit =
          marks.find((m) => m.n === a) ??
          (a.length > 10 ? marks.find((m) => m.n.includes(a) || a.includes(m.n)) : undefined)
        if (hit) {
          const arr = attached.get(hit.h.bookmark_id) ?? []
          arr.push(r)
          attached.set(hit.h.bookmark_id, arr)
          continue
        }
      }
      if (r.content) loose.push(r)
    }
    return { attached, loose }
  }, [highlights, reviews])

  // 划线按章节分组、按 chapter_uid 排序；章内按划线时间
  const chapters = useMemo(() => {
    const map = new Map<string, { uid: number; title: string; marks: HighlightRow[] }>()
    for (const h of highlights) {
      const key = h.chapter_uid != null ? String(h.chapter_uid) : 'none'
      if (!map.has(key)) {
        map.set(key, {
          uid: h.chapter_uid ?? Number.MAX_SAFE_INTEGER,
          title: h.chapter_title || '未分章',
          marks: [],
        })
      }
      map.get(key)!.marks.push(h)
    }
    return [...map.values()]
      .sort((a, b) => a.uid - b.uid)
      .map((c) => ({
        ...c,
        marks: [...c.marks].sort((a, b) => (a.create_time ?? 0) - (b.create_time ?? 0)),
      }))
  }, [highlights])

  // 阅读数据条
  const readInfo: { v: string; k: string }[] = [
    { v: formatHoursCN(book.reading_time), k: '累计阅读' },
  ]
  if (Number(book.tts_time) > 0) {
    readInfo.push({ v: formatHoursCN(book.tts_time), k: '其中听书' })
  }
  readInfo.push({ v: `${pct}%`, k: '阅读进度' })
  if (book.start_reading_time) {
    readInfo.push({ v: formatDate(book.start_reading_time), k: '开始阅读' })
  }
  if (Number(book.finish_time) > 0) {
    readInfo.push({ v: formatDate(book.finish_time), k: '读完时间' })
  } else if (book.last_note_time) {
    readInfo.push({ v: formatDate(book.last_note_time), k: '最近笔记' })
  }

  const metaPairs: [string, string][] = [
    ['出版社', book.publisher ?? ''],
    ['ISBN', book.isbn ?? ''],
    ['出版时间', book.publish_time ? book.publish_time.slice(0, 10) : ''],
    ['总字数', formatWords(book.word_count)],
    ['分类', book.category ?? ''],
  ]

  const hasAnalysis = analysis && (analysis.harvest || analysis.remember?.length || analysis.preference)

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* 返回（移动端用顶栏返回，这里只在 PC 显示） */}
      <button
        type="button"
        onClick={onBack}
        className="hidden items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink-txt lg:inline-flex"
      >
        <IconBack className="h-4 w-4" />
        返回书架
      </button>

      {/* Hero */}
      <section className="card relative overflow-hidden">
        {/* 右上角品牌光晕：制造纵深，不用条纹或渐变文字 */}
        <div
          className="pointer-events-none absolute -right-20 -top-28 h-64 w-64 rounded-full opacity-70 blur-2xl"
          style={{ background: 'radial-gradient(circle, oklch(var(--brand-500) / .18), transparent 70%)' }}
        />
        <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:gap-6 sm:p-6">
          {book.cover_url ? (
            <img
              src={book.cover_url}
              alt=""
              className="h-[170px] w-[122px] shrink-0 self-center rounded-tile border border-ink-line bg-ink-surface2 object-cover sm:self-start"
            />
          ) : (
            <div className="flex h-[170px] w-[122px] shrink-0 items-center justify-center self-center rounded-tile border border-ink-line bg-ink-surface2 text-2xs text-ink-faint sm:self-start">
              无封面
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="text-2xl font-semibold leading-snug sm:text-3xl">{book.title}</h2>
            <div className="mt-1.5 text-sm text-ink-muted">
              {book.author}
              {book.translator ? ` · 译者 ${book.translator}` : ''}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="chip chip-off !min-h-[32px] !text-2xs">
                {groupCategory(book.category)}
              </span>
              {rating && (
                <span className="chip !min-h-[32px] border-brand-amber/[0.45] bg-brand-amber/[0.14] !text-2xs text-brand-amber">
                  <IconStar className="h-3.5 w-3.5" />
                  {rating} 分
                  {book.rating_count ? ` · ${groupNumber(book.rating_count)}人评价` : ''}
                </span>
              )}
              <span className="chip chip-off !min-h-[32px] !text-2xs">
                划线 <span className="tnum font-medium text-brand-blue">{highlights.length}</span>
              </span>
              <span className="chip chip-off !min-h-[32px] !text-2xs">
                想法 <span className="tnum font-medium text-brand-purple">{reviews.length}</span>
              </span>
            </div>

            <div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-5">
              {book.reader_link ? (
                <a
                  href={book.reader_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-soft !min-h-[42px] !text-sm"
                >
                  <IconExternal className="h-4 w-4" />
                  在微信读书中打开
                </a>
              ) : (
                <span />
              )}
              <ProgressRing value={pct} size={76} stroke={6} label="进度" />
            </div>
          </div>
        </div>
      </section>

      {/* 阅读数据条 */}
      <section className="card grid grid-cols-2 gap-x-4 gap-y-5 px-4 py-5 sm:grid-cols-3 sm:px-6 lg:grid-cols-5">
        {readInfo.map((r) => (
          <div key={r.k}>
            <div className="tnum text-xl font-semibold leading-none text-brand-teal">{r.v}</div>
            <div className="mt-2 text-2xs text-ink-muted">{r.k}</div>
          </div>
        ))}
      </section>

      {/* 双栏：PC 右侧 sticky 档案；移动端档案在最前 */}
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        {/* 档案（元信息） */}
        {metaPairs.some(([, v]) => v) && (
          <aside className="order-first space-y-2.5 lg:order-none lg:sticky lg:top-8">
            <h3 className="section-title px-1">档案</h3>
            {metaPairs.map(([k, v]) =>
              v ? (
                <div key={k} className="card flex items-baseline justify-between gap-3 px-4 py-3">
                  <span className="shrink-0 text-2xs text-ink-faint">{k}</span>
                  <span className="tnum min-w-0 truncate text-sm font-medium">{v}</span>
                </div>
              ) : null,
            )}
          </aside>
        )}

        {/* 主内容 */}
        <div className="order-2 min-w-0 space-y-4 sm:space-y-5 lg:order-none">
          {/* 书籍简介 */}
          {book.intro && (
            <section className="card card-pad">
              <h3 className="section-title mb-3">书籍简介</h3>
              <p className="prose-narrow text-sm leading-relaxed text-ink-muted">{book.intro}</p>
            </section>
          )}

          {/* AI 阅读分析 */}
          {hasAnalysis ? (
            <section className="card card-pad">
              <h3 className="section-title mb-4">
                <IconSpark className="h-[18px] w-[18px] text-brand-amber" />
                阅读分析
                <span className="section-sub">由 AI 基于笔记生成</span>
              </h3>
              {analysis!.harvest && <ASec k="我收获了什么" v={analysis!.harvest} />}
              {analysis!.remember && analysis!.remember.length > 0 && (
                <ASec k="我想记住什么" v={analysis!.remember.map((s) => `「${s}」`).join(' ')} />
              )}
              {analysis!.preference && <ASec k="我的笔记偏好" v={analysis!.preference} />}
              {analysis!.keywords && analysis!.keywords.length > 0 && (
                <div>
                  <div className="mb-2 text-2xs font-semibold tracking-wide text-brand-amber">
                    关键词
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {analysis!.keywords.map((k) => (
                      <span
                        key={k}
                        className="rounded-full bg-brand-amber/[0.14] px-2.5 py-[3px] text-2xs text-brand-amber"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          ) : (
            <section className="card card-pad">
              <h3 className="section-title mb-3">
                <IconSpark className="h-[18px] w-[18px] text-ink-faint" />
                阅读分析
              </h3>
              <p className="prose-narrow text-sm leading-relaxed text-ink-muted">
                还没有这本书的阅读分析。到「同步」页运行 AI 分析即可生成：收获、想记住的句子、笔记偏好与关键词。
              </p>
            </section>
          )}

          {/* 按章节分组的划线 */}
          {chapters.map((c) => (
            <section key={c.title + c.uid} className="pt-1">
              <h4 className="section-title mb-3 pb-2.5">
                <IconQuote className="h-[18px] w-[18px] text-brand-teal" />
                <span className="min-w-0 truncate">{c.title}</span>
                <span className="tnum shrink-0 rounded-full bg-ink-surface2 px-2 py-0.5 text-2xs font-normal text-ink-faint">
                  {c.marks.length} 条划线
                </span>
              </h4>
              {c.marks.map((m) => (
                <article key={m.bookmark_id} className="card mb-3 px-4 py-3.5 sm:px-5">
                  <div className="flex gap-3">
                    <IconQuote className="mt-1 h-4 w-4 shrink-0 text-brand-blue/70" />
                    <p className="min-w-0 text-base leading-[1.75] text-ink-txt/95">{m.mark_text}</p>
                  </div>
                  <div className="mt-2.5 flex items-center gap-1.5 text-2xs text-ink-faint">
                    <IconClock className="h-3.5 w-3.5" />
                    划线于 <span className="tnum">{formatDate(m.create_time)}</span>
                  </div>
                  {attached.get(m.bookmark_id)?.map((r) => (
                    <div key={r.review_id} className="mt-3 rounded-tile bg-brand-teal/[0.08] px-4 py-3">
                      <div className="mb-1 flex items-center gap-1.5 text-2xs font-semibold text-brand-teal">
                        <IconIdea className="h-3.5 w-3.5" />
                        我的想法
                      </div>
                      <div className="prose-narrow text-sm leading-relaxed">{r.content}</div>
                    </div>
                  ))}
                </article>
              ))}
            </section>
          ))}

          {/* 未关联原文的想法 */}
          {loose.length > 0 && (
            <section className="card border-dashed px-4 py-4 sm:px-5">
              <h5 className="mb-3 text-sm font-semibold text-ink-muted">
                未关联原文的想法（{loose.length}）
              </h5>
              {loose.map((r) => (
                <div
                  key={r.review_id}
                  className="border-b border-ink-line py-2.5 text-sm leading-relaxed last:border-none"
                >
                  {r.content}
                  {r.chapter_title && (
                    <small className="mt-0.5 block text-2xs text-ink-faint">{r.chapter_title}</small>
                  )}
                </div>
              ))}
            </section>
          )}

          {highlights.length === 0 && reviews.length === 0 && (
            <p className="py-6 text-center text-sm text-ink-muted">
              这本书还没有同步到划线或想法
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function ASec({ k, v }: { k: string; v: string }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1 text-2xs font-semibold tracking-wide text-brand-amber">{k}</div>
      <div className="prose-narrow text-sm leading-relaxed text-ink-txt/90">{v}</div>
    </div>
  )
}
