import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import type {
  AnalysisRow,
  BookRow,
  HighlightRow,
  ReviewRow,
  StatsPayload,
  StatsRow,
} from './lib/types'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Shelf from './pages/Shelf'
import Stats from './pages/Stats'
import SyncPanel from './pages/SyncPanel'
import BookDetail from './pages/BookDetail'
import Report from './pages/Report'
import { formatDateTime } from './lib/format'
import {
  IconBack,
  IconLogo,
  IconLogout,
  IconReport,
  IconShelf,
  IconStats,
  IconSync,
} from './components/icons'

type Tab = 'shelf' | 'report' | 'stats' | 'sync'

type Route = { name: Tab } | { name: 'book'; id: string }

// 与参考工作台一致的 hash 路由：''=书架、#/report、#/stats、#/sync、#/book/<id>
function parseRoute(): Route {
  const h = window.location.hash
  if (h === '#/report') return { name: 'report' }
  if (h === '#/stats') return { name: 'stats' }
  if (h === '#/sync') return { name: 'sync' }
  const m = h.match(/^#\/book\/(.+)$/)
  if (m) return { name: 'book', id: decodeURIComponent(m[1]) }
  return { name: 'shelf' }
}

const TABS: { key: Tab; label: string; short: string; Icon: typeof IconShelf }[] = [
  { key: 'shelf', label: '书架', short: '书架', Icon: IconShelf },
  { key: 'report', label: '阅读报告', short: '报告', Icon: IconReport },
  { key: 'stats', label: '阅读统计', short: '统计', Icon: IconStats },
  { key: 'sync', label: '同步', short: '同步', Icon: IconSync },
]

const PAGE_TITLE: Record<Tab, { title: string; sub: string }> = {
  shelf: { title: '书架', sub: '划线与想法 · 来自微信读书' },
  report: { title: '阅读报告', sub: '周期复盘 · 来自微信读书' },
  stats: { title: '阅读统计', sub: '阅读时长 · 偏好分析 · 来自微信读书' },
  sync: { title: '同步', sub: '数据同步 · 来自微信读书' },
}

export default function App() {
  const { session } = useAuth()
  const [route, setRoute] = useState<Route>(parseRoute)

  const [books, setBooks] = useState<BookRow[]>([])
  const [highlights, setHighlights] = useState<HighlightRow[]>([])
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [analyses, setAnalyses] = useState<AnalysisRow[]>([])
  const [stats, setStats] = useState<StatsPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // 详情页属于「书架」语境，tab 高亮保持书架
  const tab: Tab = route.name === 'book' ? 'shelf' : route.name

  function gotoTab(t: Tab) {
    window.location.hash = t === 'shelf' ? '' : `#/${t}`
  }

  // 同步成功后重新拉全量本地数据
  async function loadAll() {
    if (!session) return
    setLoading(true)
    setError(null)
    const client = supabase
    if (!client) {
      setError('前端 Supabase 环境变量未配齐')
      setLoading(false)
      return
    }
    try {
      const [b, h, r, s, a] = await Promise.all([
        client.from('wr_books').select('*').order('updated_at', { ascending: false }),
        client.from('wr_highlights').select('*'),
        client.from('wr_reviews').select('*'),
        client.from('wr_stats').select('*').eq('mode', 'overall').order('synced_at', { ascending: false }).limit(1),
        client.from('wr_analysis').select('*'),
      ])
      if (b.error) throw b.error
      if (h.error) throw h.error
      if (r.error) throw r.error
      if (s.error) throw s.error
      if (a.error) throw a.error
      setBooks((b.data as BookRow[]) ?? [])
      setHighlights((h.data as HighlightRow[]) ?? [])
      setReviews((r.data as ReviewRow[]) ?? [])
      setAnalyses((a.data as AnalysisRow[]) ?? [])
      const rows = (s.data as StatsRow[]) ?? []
      setStats(rows[0]?.payload ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '数据加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (session) loadAll()
    else {
      setBooks([])
      setHighlights([])
      setReviews([])
      setAnalyses([])
      setStats(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  const exportedAt = useMemo(() => {
    const latest = books.reduce<string | null>(
      (m, b) => (b.last_synced_at && (!m || b.last_synced_at > m) ? b.last_synced_at : m),
      null,
    )
    return formatDateTime(latest) === '—' ? null : formatDateTime(latest)
  }, [books])

  if (!session) return <Login />
  if (!supabase) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6 text-center text-sm text-ink-muted">
        前端 Supabase 环境变量未配齐，请检查 .env.local
      </div>
    )
  }

  const page = PAGE_TITLE[tab]
  const isDetail = route.name === 'book'

  return (
    <div className="min-h-dvh bg-ink-bg text-ink-txt">
      {/* ── PC：左侧固定导航（≥1024px） ───────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-ink-line bg-ink-surface lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-tile bg-brand-500/[0.15] text-brand-blue">
            <IconLogo className="h-[22px] w-[22px]" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold leading-tight">阅读工作台</div>
            <div className="mt-0.5 truncate text-[11.5px] text-ink-faint">WeChat Reading</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {TABS.map(({ key, label, Icon }) => {
            const on = tab === key && !isDetail
            return (
              <button
                key={key}
                type="button"
                onClick={() => gotoTab(key)}
                aria-current={on ? 'page' : undefined}
                className={`flex w-full items-center gap-3 rounded-tile px-3 py-2.5 text-sm transition-colors duration-200 ease-app ${
                  on
                    ? 'bg-brand-500/[0.15] font-medium text-brand-blue'
                    : 'text-ink-muted hover:bg-white/[.04] hover:text-ink-txt'
                }`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate">{label}</span>
                {on && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-500" />}
              </button>
            )
          })}
        </nav>

        <div className="border-t border-ink-line p-3">
          <div className="mb-2 truncate px-2 text-[12px] text-ink-faint">{session.user.email}</div>
          <button
            type="button"
            onClick={() => void supabase?.auth.signOut()}
            className="flex w-full items-center gap-3 rounded-tile px-3 py-2.5 text-sm text-ink-muted transition-colors duration-200 ease-app hover:bg-white/[.04] hover:text-ink-txt"
          >
            <IconLogout className="h-[18px] w-[18px] shrink-0" />
            退出登录
          </button>
        </div>
      </aside>

      {/* ── 移动端：顶部 AppBar（<1024px） ──────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-ink-line bg-ink-bg/[0.85] pt-safe backdrop-blur-lg lg:hidden">
        <div className="flex h-[54px] items-center gap-2 px-2">
          {isDetail ? (
            <button
              type="button"
              onClick={() => gotoTab('shelf')}
              aria-label="返回书架"
              className="flex h-11 w-11 items-center justify-center rounded-full text-ink-txt active:bg-white/[.06]"
            >
              <IconBack className="h-5 w-5" />
            </button>
          ) : (
            <div className="flex h-11 w-11 items-center justify-center text-brand-blue">
              <IconLogo className="h-[22px] w-[22px]" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="truncate text-[16px] font-semibold leading-tight">
              {isDetail ? '书籍详情' : page.title}
            </div>
            <div className="truncate text-[11.5px] leading-tight text-ink-faint">
              {isDetail ? '书架' : page.sub}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void supabase?.auth.signOut()}
            aria-label="退出登录"
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted active:bg-white/[.06]"
          >
            <IconLogout className="h-[19px] w-[19px]" />
          </button>
        </div>
      </header>

      {/* ── 主内容 ─────────────────────────────────────────────────── */}
      <div className="lg:pl-[248px]">
        <main className="mx-auto w-full max-w-[1180px] px-4 pb-[104px] pt-4 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          {/* PC 页头 */}
          <div className="mb-6 hidden items-end justify-between gap-4 lg:flex">
            <div>
              <h1 className="text-[22px] font-semibold leading-tight">
                {isDetail ? '书籍详情' : page.title}
              </h1>
              <p className="mt-1 text-[13px] text-ink-muted">
                {isDetail ? '划线 · 想法 · AI 阅读分析' : page.sub}
              </p>
            </div>
            {exportedAt && (
              <div className="shrink-0 rounded-full border border-ink-line bg-ink-surface px-3.5 py-1.5 text-[12px] text-ink-muted">
                数据导出于 {exportedAt}
              </div>
            )}
          </div>

          {error && (
            <div className="hint mb-5 flex flex-wrap items-center justify-between gap-3 border-brand-coral/40 bg-brand-coral/10 text-[#ffb3b8]">
              <span>{error}</span>
              <button type="button" onClick={() => void loadAll()} className="btn btn-soft !min-h-[36px] !px-3 !text-[13px]">
                重试
              </button>
            </div>
          )}

          {loading && tab !== 'sync' && books.length === 0 && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="stat-card">
                  <div className="h-7 w-20 animate-pulse rounded bg-white/[.06]" />
                  <div className="mt-2 h-3 w-24 animate-pulse rounded bg-white/[.05]" />
                </div>
              ))}
            </div>
          )}

          {route.name === 'book' ? (
            (() => {
              const book = books.find((b) => b.book_id === route.id)
              if (!book) {
                return (
                  <div className="empty">
                    没有找到这本书
                    <button
                      type="button"
                      onClick={() => gotoTab('shelf')}
                      className="mt-3 block w-full text-brand-blue"
                    >
                      返回书架
                    </button>
                  </div>
                )
              }
              return (
                <BookDetail
                  book={book}
                  highlights={highlights.filter((h) => h.book_id === book.book_id)}
                  reviews={reviews.filter((r) => r.book_id === book.book_id)}
                  analysis={analyses.find((a) => a.book_id === book.book_id)}
                  onBack={() => gotoTab('shelf')}
                />
              )
            })()
          ) : (
            <>
              {tab === 'shelf' && (
                <Shelf books={books} highlights={highlights} reviews={reviews} />
              )}
              {tab === 'report' && (
                <Report books={books} highlights={highlights} reviews={reviews} />
              )}
              {tab === 'stats' && <Stats books={books} stats={stats} />}
              {tab === 'sync' && <SyncPanel onDataChanged={loadAll} />}
            </>
          )}
        </main>
      </div>

      {/* ── 移动端：底部 Tab Bar ────────────────────────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-line bg-ink-surface/95 pb-safe backdrop-blur-lg lg:hidden">
        <div className="flex h-[62px] items-stretch">
          {TABS.map(({ key, short, Icon }) => {
            const on = tab === key && !isDetail
            return (
              <button
                key={key}
                type="button"
                onClick={() => gotoTab(key)}
                aria-current={on ? 'page' : undefined}
                className={`flex flex-1 flex-col items-center justify-center gap-1 active:bg-white/[.04] ${
                  on ? 'text-brand-blue' : 'text-ink-faint'
                }`}
              >
                <Icon className="h-[21px] w-[21px]" />
                <span className="text-[11px] leading-none">{short}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
