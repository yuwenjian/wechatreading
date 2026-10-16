import { useMemo, useState } from 'react'
import StatNumber from '../components/StatNumber'
import type { BookRow, HighlightRow, ReviewRow } from '../lib/types'
import {
  formatHoursCN,
  formatRating,
  groupCategory,
  groupNumber,
} from '../lib/format'
import { IconClock, IconIdea, IconQuote, IconStar } from '../components/icons'

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

/** 卡片强调色：轮换分配，保证网格里不单调 */
const ACCENTS = [
  { css: '#6fa9fa', tw: 'text-brand-blue', soft: 'bg-brand-blue/[0.12]' },
  { css: '#2dd4bf', tw: 'text-brand-teal', soft: 'bg-brand-teal/[0.12]' },
  { css: '#f0b45f', tw: 'text-brand-amber', soft: 'bg-brand-amber/[0.12]' },
  { css: '#b69bff', tw: 'text-brand-purple', soft: 'bg-brand-purple/[0.12]' },
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
    <div className="space-y-5 sm:space-y-6">
      {/* 顶部四格统计 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="stat-card">
            <StatNumber text={s.value} className={s.tw} />
            <div className="mt-2 text-[12.5px] text-ink-muted sm:text-[13px]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* 分类筛选：移动端横向滑动，PC 自动换行 */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
        {GROUPS.map((g) => {
          const n = g === '全部' ? items.length : (counts.get(g) ?? 0)
          const isOn = active === g
          return (
            <button
              key={g}
              type="button"
              onClick={() => setActive(g)}
              aria-pressed={isOn}
              className={`${isOn ? 'chip chip-on' : 'chip chip-off'} shrink-0`}
            >
              {g}
              <span className={`tabular-nums text-[11.5px] ${isOn ? 'opacity-80' : 'text-ink-faint'}`}>
                {n}
              </span>
            </button>
          )
        })}
      </div>

      {/* 书籍卡片 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
        {list.map((it, idx) => (
          <BookCard
            key={it.book.book_id}
            item={it}
            accent={ACCENTS[idx % ACCENTS.length]}
          />
        ))}
      </div>

      {list.length === 0 && <div className="empty">这个分类下还没有带笔记的书</div>}
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
    <article
      role="link"
      tabIndex={0}
      onClick={goDetail}
      onKeyDown={(e) => e.key === 'Enter' && goDetail()}
      className="group flex cursor-pointer gap-3.5 rounded-card border border-ink-line bg-ink-surface p-3.5 shadow-card transition-[transform,border-color,box-shadow] duration-200 ease-app active:scale-[.985] hover:border-ink-line2 hover:shadow-pop sm:p-4"
    >
      {/* 封面 */}
      <div className="relative shrink-0">
        {book.cover_url ? (
          <img
            src={book.cover_url}
            alt=""
            loading="lazy"
            className="h-[92px] w-[68px] rounded-[10px] border border-ink-line object-cover"
          />
        ) : (
          <div className="flex h-[92px] w-[68px] items-center justify-center rounded-[10px] border border-ink-line bg-ink-surface2 text-[11px] text-ink-faint">
            无封面
          </div>
        )}
        {pct >= 100 && (
          <span className="absolute -right-1.5 -top-1.5 rounded-full bg-brand-teal px-1.5 py-[2px] text-[10px] font-medium text-[#06231d]">
            读完
          </span>
        )}
      </div>

      {/* 信息 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug">{book.title}</h3>
        <p className="mt-0.5 truncate text-[12.5px] text-ink-muted">
          {[book.author, book.translator].filter(Boolean).join(' · ') || '—'}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
          <span className="inline-flex items-center gap-1 text-ink-muted">
            <IconQuote className={`h-3.5 w-3.5 ${accent.tw}`} />
            <span className={`font-medium tabular-nums ${accent.tw}`}>{marks.length}</span>
            划线
          </span>
          <span className="inline-flex items-center gap-1 text-ink-muted">
            <IconIdea className="h-3.5 w-3.5 text-brand-purple" />
            <span className="font-medium tabular-nums text-brand-purple">{thoughts.length}</span>
            想法
          </span>
          <span className="inline-flex items-center gap-1 text-ink-muted">
            <IconClock className="h-3.5 w-3.5 text-brand-teal" />
            <span className="tabular-nums">{formatHoursCN(book.reading_time)}</span>
          </span>
          {rating && (
            <span className="inline-flex items-center gap-1 text-ink-muted">
              <IconStar className="h-3.5 w-3.5 text-brand-amber" />
              <span className="tabular-nums">{rating}</span>
            </span>
          )}
        </div>

        {/* 进度 */}
        <div className="mt-auto pt-3">
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-surface2">
              <div
                className="h-full rounded-full transition-[width] duration-300 ease-app"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${accent.css}99, ${accent.css})`,
                }}
              />
            </div>
            <span className="shrink-0 text-[11.5px] tabular-nums text-ink-faint">{pct}%</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11.5px]">
            <span className={`rounded-md px-1.5 py-0.5 ${accent.soft} ${accent.tw}`}>{group}</span>
            {(marks.length > 0 || thoughts.length > 0) && (
              <span className="text-ink-faint transition-colors group-hover:text-brand-blue">
                {marks.length + thoughts.length} 条笔记 →
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
