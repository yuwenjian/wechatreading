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

interface Props {
  book: BookRow
  highlights: HighlightRow[]
  reviews: ReviewRow[]
  analysis: AnalysisRow | undefined
  onBack: () => void
}

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, '')

/** 与 WorkBuddy 参考工作台「书籍详情」视图一致 */
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

  // 阅读数据条（teal 大数字）
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

  const metaPairs: [string, string][] = [
    ['出版社', book.publisher ?? ''],
    ['ISBN', book.isbn ?? ''],
    ['出版时间', book.publish_time ? book.publish_time.slice(0, 10) : ''],
    ['总字数', formatWords(book.word_count)],
    ['分类', book.category ?? ''],
  ]

  const hasAnalysis = analysis && (analysis.harvest || analysis.remember?.length || analysis.preference)

  return (
    <div>
      {/* 返回 */}
      <button
        type="button"
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-ink-muted transition-colors hover:text-ink-txt"
      >
        ← 返回书架
      </button>

      {/* 头部：封面 + 标题 + 标签 */}
      <div className="mb-5 flex flex-wrap gap-[22px]">
        {book.cover_url ? (
          <img
            src={book.cover_url}
            alt=""
            className="h-[150px] w-[108px] rounded-[10px] border border-ink-line bg-ink-panel2 object-cover"
          />
        ) : (
          <div className="flex h-[150px] w-[108px] items-center justify-center rounded-[10px] border border-ink-line bg-ink-panel2 text-xs text-ink-faint">
            无封面
          </div>
        )}
        <div className="min-w-[260px] flex-1">
          <h2 className="text-2xl font-semibold leading-snug">{book.title}</h2>
          <div className="mt-1.5 text-[13.5px] text-ink-muted">
            {book.author}
            {book.translator ? ` · 译者 ${book.translator}` : ''}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Tag>{groupCategory(book.category)}</Tag>
            {rating && (
              <span className="rounded-md border border-ink-line bg-ink-panel2 px-2.5 py-[3px] text-[11.5px] text-brand-amber">
                ★ {rating} 分{book.rating_count ? ` · ${groupNumber(book.rating_count)}人评价` : ''}
              </span>
            )}
            <Tag>划线 {highlights.length} 条</Tag>
            <Tag>想法 {reviews.length} 条</Tag>
          </div>
          {book.reader_link && (
            <div className="mt-3.5 text-[13px]">
              <a
                href={book.reader_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-blue hover:underline"
              >
                在微信读书中打开 ↗
              </a>
            </div>
          )}
        </div>
      </div>

      {/* 阅读数据条 */}
      <div className="mb-7 flex flex-wrap gap-8 rounded-xl border border-ink-line bg-ink-panel px-5 py-4">
        {readInfo.map((r) => (
          <div key={r.k}>
            <div className="text-[19px] font-semibold text-brand-teal">{r.v}</div>
            <div className="mt-0.5 text-[11.5px] text-ink-muted">{r.k}</div>
          </div>
        ))}
      </div>

      {/* 元信息 */}
      {metaPairs.some(([, v]) => v) && (
        <div className="mb-5 grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
          {metaPairs.map(([k, v]) =>
            v ? (
              <div key={k} className="rounded-[10px] border border-ink-line bg-ink-panel px-3.5 py-[11px]">
                <div className="text-[11px] text-ink-faint">{k}</div>
                <div className="mt-0.5 text-[13px] font-medium">{v}</div>
              </div>
            ) : null,
          )}
        </div>
      )}

      {/* 书籍简介 */}
      {book.intro && (
        <section className="mb-5 rounded-[14px] border border-ink-line bg-ink-panel px-[22px] py-5">
          <h3 className="mb-3 text-[15px] font-semibold">书籍简介</h3>
          <div className="text-[13px] leading-relaxed text-ink-muted">{book.intro}</div>
        </section>
      )}

      {/* AI 阅读分析 */}
      {hasAnalysis ? (
        <section className="mb-7 rounded-xl border border-ink-line border-l-[3px] border-l-brand-amber bg-ink-panel px-[22px] py-5">
          <h3 className="mb-4 text-[15px] font-semibold">🧠 阅读分析</h3>
          {analysis!.harvest && (
            <ASec k="我收获了什么" v={analysis!.harvest} />
          )}
          {analysis!.remember && analysis!.remember.length > 0 && (
            <ASec k="我想记住什么" v={analysis!.remember.map((s) => `「${s}」`).join(' ')} />
          )}
          {analysis!.preference && (
            <ASec k="我的笔记偏好" v={analysis!.preference} />
          )}
          {analysis!.keywords && analysis!.keywords.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold text-brand-amber">关键词</div>
              <div className="mt-1 flex flex-wrap gap-[7px]">
                {analysis!.keywords.map((k) => (
                  <span
                    key={k}
                    className="rounded-full bg-brand-amber/10 px-2.5 py-[3px] text-[11.5px] text-brand-amber"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="mb-7 rounded-xl border border-dashed border-ink-line bg-ink-panel px-[22px] py-4 text-[13px] text-ink-faint">
          还没有这本书的阅读分析，到「同步」页运行 AI 分析即可生成（收获 / 想记住的句子 / 笔记偏好 / 关键词）。
        </section>
      )}

      {/* 按章节分组的划线 */}
      {chapters.map((c) => (
        <section key={c.title + c.uid} className="mb-6">
          <h4 className="mb-3 border-b border-ink-line pb-2 text-[14.5px] font-semibold text-brand-teal">
            {c.title}
            <small className="ml-1.5 text-xs font-normal text-ink-faint">
              {c.marks.length} 条划线
            </small>
          </h4>
          {c.marks.map((m) => (
            <div
              key={m.bookmark_id}
              className="mb-3 rounded-xl border border-ink-line bg-ink-panel px-[17px] py-[15px]"
            >
              <div className="border-l-[2.5px] border-brand-blue pl-3 text-sm leading-[1.7]">
                {m.mark_text}
              </div>
              <div className="mt-2.5 text-[11.5px] text-ink-faint">
                划线于 {formatDate(m.create_time)}
              </div>
              {attached.get(m.bookmark_id)?.map((r) => (
                <div key={r.review_id} className="mt-3 rounded-lg bg-ink-panel2 px-[13px] py-[11px]">
                  <div className="mb-0.5 text-[11px] font-semibold text-brand-teal">
                    💡 我的想法
                  </div>
                  <div className="text-[13.5px] leading-relaxed">{r.content}</div>
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}

      {/* 未关联原文的想法 */}
      {loose.length > 0 && (
        <section className="mt-2 rounded-xl border border-dashed border-ink-line bg-ink-panel px-[18px] py-4">
          <h5 className="mb-2.5 text-[13px] font-semibold text-ink-muted">
            未关联原文的想法（{loose.length}）
          </h5>
          {loose.map((r) => (
            <div key={r.review_id} className="border-b border-ink-line py-2 text-[13.5px] leading-relaxed last:border-none">
              {r.content}
              {r.chapter_title && (
                <small className="mt-0.5 block text-[11.5px] text-ink-faint">
                  {r.chapter_title}
                </small>
              )}
            </div>
          ))}
        </section>
      )}

      {highlights.length === 0 && reviews.length === 0 && (
        <div className="rounded-xl border border-dashed border-ink-line bg-ink-panel p-10 text-center text-ink-muted">
          这本书还没有同步到划线或想法
        </div>
      )}
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-ink-line bg-ink-panel2 px-2.5 py-[3px] text-[11.5px] text-ink-muted">
      {children}
    </span>
  )
}

function ASec({ k, v }: { k: string; v: string }) {
  return (
    <div className="mb-[15px] last:mb-0">
      <div className="mb-[3px] text-xs font-semibold text-brand-amber">{k}</div>
      <div className="text-[13.5px] leading-relaxed">{v}</div>
    </div>
  )
}
