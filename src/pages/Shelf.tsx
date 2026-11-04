import { useMemo, useState } from 'react'
import StatNumber from '../components/StatNumber'
import EmptyState from '../components/EmptyState'
import ProgressRing from '../components/ProgressRing'
import type { BookRow, HighlightRow, ReviewRow } from '../lib/types'
import {
  daysAgo,
  formatHoursCN,
  formatRating,
  groupCategory,
  groupNumber,
} from '../lib/format'
import { IconClock, IconIdea, IconNext, IconQuote, IconStar, IllustEmptyBooks } from '../components/icons'

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

/**
 * 卡片强调色：轮换分配，让网格不至于呆板。
 * 颜色统一取自 design token，避免硬编码色值。
 */
const ACCENTS = [
  {
    grad: 'linear-gradient(90deg, oklch(var(--brand-400) / .45), oklch(var(--brand-400)))',
    tw: 'text-brand-blue',
    soft: 'bg-brand-blue/[0.14]',
  },
  {
    grad: 'linear-gradient(90deg, oklch(var(--brand-teal) / .45), oklch(var(--brand-teal)))',
    tw: 'text-brand-teal',
    soft: 'bg-brand-teal/[0.14]',
  },
  {
    grad: 'linear-gradient(90deg, oklch(var(--brand-amber) / .45), oklch(var(--brand-amber)))',
    tw: 'text-brand-amber',
    soft: 'bg-brand-amber/[0.14]',
  },
  {
    grad: 'linear-gradient(90deg, oklch(var(--brand-purple) / .45), oklch(var(--brand-purple)))',
    tw: 'text-brand-purple',
    soft: 'bg-brand-purple/[0.14]',
  },
]

export default function Shelf({ books, highlights, reviews }: Props) {
  const [active, setActive] = useState<string>('全部')

  // 按 bookId 索引划线/想法。
  // 展示 wr_books 全量：最近在读、但还没划线/想法的书（比如《缠论》）
  // 同步后同样是书架的一部分，不该因为「零笔记」被藏起来 —— 只是卡片上没有笔记数。
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
      .sort((a, b) => {
        // 最近阅读优先：updated_at 是每次同步确认到「这本书有阅读/笔记动静」的时间，
        // 同步发生在阅读之后，拿它当排序键足够准（无笔记的书也覆盖到）。
        const ta = Date.parse(a.book.updated_at ?? '') || 0
        const tb = Date.parse(b.book.updated_at ?? '') || 0
        if (tb !== ta) return tb - ta
        // 同一批同步进来的书再按笔记数排，有内容的更靠前
        const na = a.marks.length + a.thoughts.length
        const nb = b.marks.length + b.thoughts.length
        return nb - na
      })
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
    { value: String(items.length), label: '书架上的书', tw: 'text-brand-blue' },
    { value: formatHoursCN(totalHours), label: '这批书累计耗时', tw: 'text-brand-teal' },
    { value: groupNumber(totalMarks), label: '划线总数', tw: 'text-brand-amber' },
    { value: groupNumber(totalThoughts), label: '想法总数', tw: 'text-brand-purple' },
  ]

  // 「在读」卡片：优先取没读完、且最近一次同步确认有阅读动静的一本
  // （口径与列表排序一致，见 items 里的注释），用它打破均质网格
  const focus = useMemo(() => {
    const reading = list.filter((i) => Number(i.book.reading_progress ?? 0) < 100)
    const pool = reading.length ? reading : list
    return [...pool].sort((a, b) => {
      const ta = Date.parse(a.book.updated_at ?? '') || 0
      const tb = Date.parse(b.book.updated_at ?? '') || 0
      return tb - ta
    })[0]
  }, [list])

  const rest = useMemo(
    () => (focus ? list.filter((i) => i.book.book_id !== focus.book.book_id) : list),
    [list, focus],
  )

  function goDetail(id: string) {
    window.location.hash = `#/book/${encodeURIComponent(id)}`
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 顶部四格统计 */}
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="stat-card">
            <StatNumber text={s.value} className={s.tw} />
            <div className="mt-2 text-2xs text-ink-muted">{s.label}</div>
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
              <span className={`tnum text-2xs ${isOn ? 'opacity-80' : 'text-ink-faint'}`}>{n}</span>
            </button>
          )
        })}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<IllustEmptyBooks className="h-8 w-8" />}
          title="这个分类下还没有书"
          desc="换个分类看看，或者到「同步」页拉一次最新数据。"
        />
      ) : (
        <>
          {/* 焦点卡：在读的那本，形状与下方网格区分开 */}
          {focus && <FocusCard item={focus} onOpen={() => goDetail(focus.book.book_id)} />}

          {/* 书籍卡片 */}
          <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {rest.map((it, idx) => (
              <BookCard
                key={it.book.book_id}
                item={it}
                accent={ACCENTS[idx % ACCENTS.length]}
                onOpen={() => goDetail(it.book.book_id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function FocusCard({ item, onOpen }: { item: ShelfItem; onOpen: () => void }) {
  const { book, marks, thoughts } = item
  const pct = Math.min(100, Number(book.reading_progress ?? 0))
  const lastNote = Number(book.last_note_time ?? 0)

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="group relative cursor-pointer overflow-hidden rounded-card border border-ink-line bg-ink-surface shadow-card transition-[transform,border-color] duration-200 ease-app hover:border-ink-line2 active:scale-[0.995]"
    >
      {/* 右上角光晕：给焦点卡一点纵深，不使用渐变文字或条纹 */}
      <div
        className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full opacity-70 blur-2xl"
        style={{ background: 'radial-gradient(circle, oklch(var(--brand-500) / .22), transparent 70%)' }}
      />

      <div className="relative flex gap-4 p-4 sm:gap-5 sm:p-5">
        {book.cover_url ? (
          <img
            src={book.cover_url}
            alt=""
            loading="lazy"
            className="h-[128px] w-[92px] shrink-0 rounded-tile border border-ink-line object-cover"
          />
        ) : (
          <div className="flex h-[128px] w-[92px] shrink-0 items-center justify-center rounded-tile border border-ink-line bg-ink-surface2 text-2xs text-ink-faint">
            无封面
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-full bg-brand-blue/[0.14] px-2.5 py-[3px] text-2xs font-medium text-brand-blue">
              {pct >= 100 ? '最近读完' : '正在读'}
            </span>
            {lastNote > 0 && (
              <span className="text-2xs text-ink-faint">最近笔记 {daysAgo(lastNote)}</span>
            )}
          </div>

          <h3 className="line-clamp-2 text-xl font-semibold leading-snug">{book.title}</h3>
          <p className="mt-1 truncate text-sm text-ink-muted">
            {[book.author, book.translator].filter(Boolean).join(' · ') || '—'}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs text-ink-muted">
            {marks.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <IconQuote className="h-4 w-4 text-brand-amber" />
                <span className="tnum font-medium">{marks.length}</span> 划线
              </span>
            )}
            {thoughts.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <IconIdea className="h-4 w-4 text-brand-purple" />
                <span className="tnum font-medium">{thoughts.length}</span> 想法
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <IconClock className="h-4 w-4 text-brand-teal" />
              <span className="tnum">{formatHoursCN(book.reading_time)}</span>
            </span>
            {marks.length + thoughts.length === 0 && <span>还没有笔记</span>}
          </div>

          <div className="mt-auto flex items-center justify-between gap-4 pt-4">
            <span className="inline-flex items-center gap-1 text-sm text-ink-muted transition-colors group-hover:text-brand-blue">
              {marks.length + thoughts.length > 0
                ? `查看 ${marks.length + thoughts.length} 条笔记`
                : '查看详情'}
              <IconNext className="h-4 w-4" />
            </span>
            <ProgressRing value={pct} size={64} stroke={5} />
          </div>
        </div>
      </div>
    </article>
  )
}

function BookCard({
  item,
  accent,
  onOpen,
}: {
  item: ShelfItem
  accent: (typeof ACCENTS)[number]
  onOpen: () => void
}) {
  const { book, marks, thoughts, group } = item
  const pct = Math.min(100, Number(book.reading_progress ?? 0))
  const rating = formatRating(book.rating)

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="group row-tap flex cursor-pointer gap-3.5 rounded-card border border-ink-line bg-ink-surface p-3.5 shadow-card hover:shadow-pop sm:p-4"
    >
      {/* 封面 */}
      <div className="relative shrink-0">
        {book.cover_url ? (
          <img
            src={book.cover_url}
            alt=""
            loading="lazy"
            className="h-[96px] w-[70px] rounded-tile border border-ink-line object-cover"
          />
        ) : (
          <div className="flex h-[96px] w-[70px] items-center justify-center rounded-tile border border-ink-line bg-ink-surface2 text-2xs text-ink-faint">
            无封面
          </div>
        )}
        {pct >= 100 && (
          <span className="absolute -right-1.5 -top-1.5 rounded-full bg-brand-teal px-1.5 py-[2px] text-2xs font-medium text-ink-white">
            读完
          </span>
        )}
      </div>

      {/* 信息 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="line-clamp-2 text-base font-semibold leading-snug">{book.title}</h3>
        <p className="mt-0.5 truncate text-2xs text-ink-muted">
          {[book.author, book.translator].filter(Boolean).join(' · ') || '—'}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs">
          {marks.length > 0 && (
            <span className="inline-flex items-center gap-1 text-ink-muted">
              <IconQuote className={`h-3.5 w-3.5 ${accent.tw}`} />
              <span className={`tnum font-medium ${accent.tw}`}>{marks.length}</span>
            </span>
          )}
          {thoughts.length > 0 && (
            <span className="inline-flex items-center gap-1 text-ink-muted">
              <IconIdea className="h-3.5 w-3.5 text-brand-purple" />
              <span className="tnum font-medium text-brand-purple">{thoughts.length}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-ink-muted">
            <IconClock className="h-3.5 w-3.5 text-brand-teal" />
            <span className="tnum">{formatHoursCN(book.reading_time)}</span>
          </span>
          {rating && (
            <span className="inline-flex items-center gap-1 text-ink-muted">
              <IconStar className="h-3.5 w-3.5 text-brand-amber" />
              <span className="tnum">{rating}</span>
            </span>
          )}
        </div>

        {/* 进度 */}
        <div className="mt-auto pt-3">
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-surface2">
              <div
                className="h-full rounded-full transition-[width] duration-300 ease-app"
                style={{ width: `${pct}%`, background: accent.grad }}
              />
            </div>
            <span className="tnum shrink-0 text-2xs text-ink-faint">
              {pct > 0 ? `${pct}%` : '—'}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-2xs">
            <span className={`rounded-md px-1.5 py-0.5 ${accent.soft} ${accent.tw}`}>{group}</span>
            <span className="shrink-0 text-ink-faint transition-colors group-hover:text-brand-blue">
              {marks.length + thoughts.length > 0
                ? `${marks.length + thoughts.length} 条笔记`
                : '暂无笔记'}
            </span>
          </div>
        </div>
      </div>
    </article>
  )
}
