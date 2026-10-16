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
import { IconBack, IconClock, IconExternal, IconIdea, IconSpark, IconStar } from '../components/icons'

interface Props {
  book: BookRow
  highlights: HighlightRow[]
  reviews: ReviewRow[]
  analysis: AnalysisRow | undefined
  onBack: () => void
}

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, '')

/** 书籍详情：Hero + 阅读数据 + AI 分析 + 按章节的划线与想法 */
export default function BookDetail({ book, highlights, reviews, analysis, onBack }: Props) {
  const rating = formatRating(book.rating)

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
  readInfo.push({ v: `${Math.min(100, Number(book.reading_progress ?? 0))}%`, k: '阅读进度' })
  if (book.start_reading_time) {
    readInfo.push({ v: formatDate(book.start_reading_time), k: '开始阅读' })
  }
  if (Number(book.finish_time) > 0) {
    readInfo.push({ v: formatDate(book.finish_time), k: '读完时间' })
  } else if (book.last_note_time) {
    readInfo.push({ v: formatDate(book.last_note_time), k: '最近笔记' })
  }

  const pct = Math.min(100, Number(book.reading_progress ?? 0))

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
        className="hidden items-center gap-1.5 text-[13px] text-ink-muted transition-colors hover:text-ink-txt lg:inline-flex"
      >
        <IconBack className="h-4 w-4" />
        返回书架
      </button>

      {/* Hero */}
      <section className="card card-pad">
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
          {book.cover_url ? (
            <img
              src={book.cover_url}
              alt=""
              className="h-[168px] w-[120px] shrink-0 self-center rounded-[12px] border border-ink-line bg-ink-surface2 object-cover sm:self-start"
            />
          ) : (
            <div className="flex h-[168px] w-[120px] shrink-0 items-center justify-center self-center rounded-[12px] border border-ink-line bg-ink-surface2 text-xs text-ink-faint sm:self-start">
              无封面
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h2 className="text-[19px] font-semibold leading-snug sm:text-[22px]">{book.title}</h2>
            <div className="mt-1.5 text-[13px] text-ink-muted">
              {book.author}
              {book.translator ? ` · 译者 ${book.translator}` : ''}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="chip !min-h-[30px] chip-off !text-[12px]">
                {groupCategory(book.category)}
              </span>
              {rating && (
                <span className="chip !min-h-[30px] border-brand-amber/[0.45] bg-brand-amber/[0.12] !text-[12px] text-brand-amber">
                  <IconStar className="h-3.5 w-3.5" />
                  {rating} 分
                  {book.rating_count ? ` · ${groupNumber(book.rating_count)}人评价` : ''}
                </span>
              )}
              <span className="chip !min-h-[30px] chip-off !text-[12px]">
                划线 <span className="tabular-nums text-brand-blue">{highlights.length}</span> 条
              </span>
              <span className="chip !min-h-[30px] chip-off !text-[12px]">
                想法 <span className="tabular-nums text-brand-purple">{reviews.length}</span> 条
              </span>
            </div>

            {/* 进度 */}
            <div className="mt-4 max-w-[420px]">
              <div className="mb-1.5 flex items-center justify-between text-[11.5px] text-ink-faint">
                <span>阅读进度</span>
                <span className="tabular-nums">{pct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ink-surface2">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500/50 to-brand-400 transition-[width] duration-300 ease-app"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {book.reader_link && (
              <a
                href={book.reader_link}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-soft mt-4 !min-h-[40px] !text-[13px]"
              >
                <IconExternal className="h-4 w-4" />
                在微信读书中打开
              </a>
            )}
          </div>
        </div>
      </section>

      {/* 阅读数据条 */}
      <section className="card grid grid-cols-2 gap-4 px-4 py-4 sm:grid-cols-3 sm:px-5 lg:grid-cols-5">
        {readInfo.map((r) => (
          <div key={r.k}>
            <div className="text-[18px] font-semibold leading-none text-brand-teal sm:text-[19px]">
              {r.v}
            </div>
            <div className="mt-1.5 text-[11.5px] text-ink-muted">{r.k}</div>
          </div>
        ))}
      </section>

      {/* 元信息 */}
      {metaPairs.some(([, v]) => v) && (
        <section className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
          {metaPairs.map(([k, v]) =>
            v ? (
              <div key={k} className="rounded-tile border border-ink-line bg-ink-surface px-3.5 py-2.5">
                <div className="text-[11px] text-ink-faint">{k}</div>
                <div className="mt-0.5 text-[13px] font-medium">{v}</div>
              </div>
            ) : null,
          )}
        </section>
      )}

      {/* 书籍简介 */}
      {book.intro && (
        <section className="card card-pad">
          <h3 className="section-title mb-3">书籍简介</h3>
          <p className="text-[13px] leading-relaxed text-ink-muted">{book.intro}</p>
        </section>
      )}

      {/* AI 阅读分析 */}
      {hasAnalysis ? (
        <section className="card card-pad border-l-2 border-l-brand-amber">
          <h3 className="section-title mb-4">
            <IconSpark className="mr-1.5 h-4 w-4 text-brand-amber" />
            阅读分析
          </h3>
          {analysis!.harvest && <ASec k="我收获了什么" v={analysis!.harvest} />}
          {analysis!.remember && analysis!.remember.length > 0 && (
            <ASec k="我想记住什么" v={analysis!.remember.map((s) => `「${s}」`).join(' ')} />
          )}
          {analysis!.preference && <ASec k="我的笔记偏好" v={analysis!.preference} />}
          {analysis!.keywords && analysis!.keywords.length > 0 && (
            <div>
              <div className="mb-2 text-[12px] font-semibold text-brand-amber">关键词</div>
              <div className="flex flex-wrap gap-2">
                {analysis!.keywords.map((k) => (
                  <span
                    key={k}
                    className="rounded-full bg-brand-amber/[0.12] px-2.5 py-[3px] text-[11.5px] text-brand-amber"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      ) : (
        <div className="empty">
          还没有这本书的阅读分析，到「同步」页运行 AI 分析即可生成（收获 / 想记住的句子 / 笔记偏好 /
          关键词）。
        </div>
      )}

      {/* 按章节分组的划线 */}
      {chapters.map((c) => (
        <section key={c.title + c.uid} className="pt-1">
          <h4 className="mb-3 flex items-baseline gap-2 border-b border-ink-line pb-2 text-[14.5px] font-semibold text-brand-teal">
            <span className="min-w-0 truncate">{c.title}</span>
            <span className="shrink-0 text-xs font-normal tabular-nums text-ink-faint">
              {c.marks.length} 条划线
            </span>
          </h4>
          {c.marks.map((m) => (
            <article key={m.bookmark_id} className="card mb-3 px-4 py-3.5 sm:px-[17px]">
              <div className="border-l-[2.5px] border-brand-blue/70 pl-3 text-[14px] leading-[1.75]">
                {m.mark_text}
              </div>
              <div className="mt-2.5 flex items-center gap-1.5 text-[11.5px] text-ink-faint">
                <IconClock className="h-3.5 w-3.5" />
                划线于 {formatDate(m.create_time)}
              </div>
              {attached.get(m.bookmark_id)?.map((r) => (
                <div
                  key={r.review_id}
                  className="mt-3 rounded-tile bg-brand-teal/[.07] px-3.5 py-3"
                >
                  <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-brand-teal">
                    <IconIdea className="h-3.5 w-3.5" />
                    我的想法
                  </div>
                  <div className="text-[13.5px] leading-relaxed">{r.content}</div>
                </div>
              ))}
            </article>
          ))}
        </section>
      ))}

      {/* 未关联原文的想法 */}
      {loose.length > 0 && (
        <section className="card border-dashed px-4 py-4">
          <h5 className="mb-3 text-[13px] font-semibold text-ink-muted">
            未关联原文的想法（{loose.length}）
          </h5>
          {loose.map((r) => (
            <div
              key={r.review_id}
              className="border-b border-ink-line py-2.5 text-[13.5px] leading-relaxed last:border-none"
            >
              {r.content}
              {r.chapter_title && (
                <small className="mt-0.5 block text-[11.5px] text-ink-faint">{r.chapter_title}</small>
              )}
            </div>
          ))}
        </section>
      )}

      {highlights.length === 0 && reviews.length === 0 && (
        <div className="empty">这本书还没有同步到划线或想法</div>
      )}
    </div>
  )
}

function ASec({ k, v }: { k: string; v: string }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1 text-[12px] font-semibold text-brand-amber">{k}</div>
      <div className="text-[13.5px] leading-relaxed text-ink-txt/90">{v}</div>
    </div>
  )
}
