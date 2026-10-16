import { useMemo, useState } from 'react'
import StatNumber from '../components/StatNumber'
import type { BookRow, HighlightRow, ReviewRow } from '../lib/types'
import {
  formatHoursCN,
  formatRating,
  groupCategory,
  groupNumber,
} from '../lib/format'

interface Props {
  books: BookRow[]
  highlights: HighlightRow[]
  reviews: ReviewRow[]
}

interface ShelfItem {
  book: BookRow
  marks: HighlightRow[]
  thoughts: ReviewRow[]
  group: string
}

const GROUPS = ['全部', '其他', '文学小说', '认知成长与管理', '金融理财'] as const

// 卡片主色，跟参考页一致
const ACCENTS = [
  { css: '#6aa6e8', tw: 'text-brand-blue' },
  { css: '#4fc4a0', tw: 'text-brand-teal' },
  { css: '#e0a64e', tw: 'text-brand-amber' },
  { css: '#a78be0', tw: 'text-brand-purple' },
]

export default function Shelf({ books, highlights, reviews }: Props) {
  const [active, setActive] = useState<string>('全部')

  // 按 bookId 索引划线/想法；只保留有笔记的书
  // 注意：note_count 是「划线数」、review_count 是「想法数」，
  // 只写想法、零划线的书（如《三体》）也必须有笔记，两个计数任一 >0 即保留
  const items = useMemo<ShelfItem[]>(() => {
    const markMap = new Map<string, HighlightRow[]>()
    for (const h of highlights) {
      const arr = markMap.get(h.book_id) ?? []
      arr.push(h)
      markMap.set(h.book_id, arr)
    }
    const reviewMap = new Map<string, ReviewRow[]>()
    for (const r of reviews) {
      const arr = reviewMap.get(r.book_id) ?? []
      arr.push(r)
      reviewMap.set(r.book_id, arr)
    }
    return books
      .filter((b) => Number(b.note_count) > 0 || Number(b.review_count) > 0)
      .map((book) => ({
        book,
        marks: (markMap.get(book.book_id) ?? []).sort(
          (a, b) => (a.create_time ?? 0) - (b.create_time ?? 0),
        ),
        thoughts: (reviewMap.get(book.book_id) ?? []).sort(
          (a, b) => (a.create_time ?? 0) - (b.create_time ?? 0),
        ),
        group: groupCategory(book.category),
      }))
      .sort((a, b) => b.marks.length - a.marks.length)
  }, [books, highlights, reviews])

  // 分组计数
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) m.set(it.group, (m.get(it.group) ?? 0) + 1)
    return m
  }, [items])

  const list = useMemo(
    () => (active === '全部' ? items : items.filter((i) => i.group === active)),
    [items, active],
  )

  const totalHours = useMemo(
    () => items.reduce((s, i) => s + Number(i.book.reading_time ?? 0), 0),
    [items],
  )
  const totalMarks = items.reduce((s, i) => s + i.marks.length, 0)
  const totalThoughts = items.reduce((s, i) => s + i.thoughts.length, 0)

  const stats = [
    { value: String(items.length), label: '有笔记的书', tw: 'text-brand-blue' },
    { value: formatHoursCN(totalHours), label: '这批书累计耗时', tw: 'text-brand-teal' },
    { value: groupNumber(totalMarks), label: '划线总数', tw: 'text-brand-amber' },
    { value: groupNumber(totalThoughts), label: '想法总数', tw: 'text-brand-purple' },
  ]

  return (
    <div className="space-y-6">
      {/* 顶部四格统计 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-ink-line bg-ink-panel px-4 py-3.5 sm:px-5 sm:py-4"
          >
            <StatNumber text={s.value} className={s.tw} />
            <div className="mt-1.5 text-[13px] text-ink-muted sm:text-sm">{s.label}</div>
          </div>
        ))}
      </div>

      {/* 分类筛选 */}
      <div className="flex flex-wrap gap-2.5">
        {GROUPS.map((g) => {
          const n = g === '全部' ? items.length : (counts.get(g) ?? 0)
          const isOn = active === g
          return (
            <button
              key={g}
              type="button"
              onClick={() => setActive(g)}
              className={`h-9 rounded-full border px-4 text-sm transition-colors ${
                isOn
                  ? 'border-brand-blue bg-brand-blue/15 text-brand-blue'
                  : 'border-ink-line bg-ink-panel text-ink-muted hover:border-ink-faint hover:text-ink-txt'
              }`}
            >
              {g} {n}
            </button>
          )
        })}
      </div>

      {/* 书籍卡片 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {list.map((it, idx) => (
          <BookCard
            key={it.book.book_id}
            item={it}
            accent={ACCENTS[idx % ACCENTS.length]}
          />
        ))}
      </div>

      {list.length === 0 && (
        <div className="rounded-xl border border-dashed border-ink-line bg-ink-panel p-10 text-center text-ink-muted">
          这个分类下还没有带笔记的书
        </div>
      )}
    </div>
  )
}

function BookCard({
  item,
  accent,
}: {
  item: ShelfItem
  accent: (typeof ACCENTS)[number]
}) {
  const { book, marks, thoughts, group } = item
  const pct = Math.min(100, Number(book.reading_progress ?? 0))
  const rating = formatRating(book.rating)

  function goDetail() {
    window.location.hash = `#/book/${encodeURIComponent(book.book_id)}`
  }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={goDetail}
      onKeyDown={(e) => e.key === 'Enter' && goDetail()}
      className="group flex cursor-pointer flex-col rounded-xl border border-ink-line bg-ink-panel p-4 transition-colors hover:border-ink-faint"
      style={{ borderTop: `3px solid ${accent.css}` }}
    >
      <div className="flex gap-3.5">
        {book.cover_url ? (
          <img
            src={book.cover_url}
            alt=""
            loading="lazy"
            className="h-24 w-[72px] shrink-0 rounded-md object-cover"
          />
        ) : (
          <div className="flex h-24 w-[72px] shrink-0 items-center justify-center rounded-md bg-ink-panel2 text-xs text-ink-faint">
            无封面
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-ink-txt">
            {book.title}
          </div>
          <div className="mt-0.5 truncate text-xs text-ink-muted">
            {[book.author, book.translator].filter(Boolean).join(' · ')}
          </div>
          <div className="mt-2 text-xs text-ink-muted">
            划线 <span className={accent.tw}>{marks.length}</span>{' '}
            <span className="mx-1 text-ink-faint">想法</span>{' '}
            <span className={accent.tw}>{thoughts.length}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
            <svg
              className="h-3.5 w-3.5 text-brand-amber"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8L12 2z" />
            </svg>
            {formatHoursCN(book.reading_time)}
          </div>
          {rating && (
            <div className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
              <svg
                className="h-3.5 w-3.5 text-brand-amber"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8L12 2z" />
              </svg>
              <span className={accent.tw}>{rating}</span> 分
            </div>
          )}
        </div>
      </div>

      {/* 阅读进度条 */}
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-ink-line">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: accent.css }}
        />
      </div>

      <div className="mt-2.5 text-xs text-ink-faint">
        {group} · 读了{pct}%
      </div>

      {/* 进入详情页 */}
      {(marks.length > 0 || thoughts.length > 0) && (
        <span className="mt-2 text-xs text-ink-muted transition-colors group-hover:text-brand-blue">
          查看 {marks.length + thoughts.length} 条笔记 →
        </span>
      )}
    </div>
  )
}
