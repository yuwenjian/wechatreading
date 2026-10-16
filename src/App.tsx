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

const TABS: { key: Tab; label: string }[] = [
  { key: 'shelf', label: '书架' },
  { key: 'report', label: '阅读报告' },
  { key: 'stats', label: '阅读统计' },
  { key: 'sync', label: '同步' },
]

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
      <div className="flex min-h-screen items-center justify-center text-ink-muted">
        前端 Supabase 环境变量未配齐，请检查 .env.local
      </div>
    )
  }

  const subtitle =
    tab === 'stats'
      ? '阅读时长 · 偏好分析 · 来自微信读书'
      : tab === 'report'
        ? '周期复盘 · 来自微信读书'
        : tab === 'sync'
          ? '数据同步 · 来自微信读书'
          : '划线与想法 · 来自微信读书'

  return (
    <div className="min-h-screen bg-ink-bg text-ink-txt">
      {/* 顶栏 */}
      <header className="border-b border-ink-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-panel2">
              <svg className="h-5 w-5 text-brand-blue" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">我的阅读工作台</h1>
              <p className="text-xs text-ink-muted">{subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            {exportedAt && (
              <span className="hidden text-ink-muted md:inline">
                数据导出于 {exportedAt}
              </span>
            )}
            <span className="text-ink-muted">{session.user.email}</span>
            <button
              type="button"
              onClick={() => void supabase?.auth.signOut()}
              className="rounded-lg border border-ink-line px-3 py-1.5 text-sm text-ink-muted transition-colors hover:border-ink-faint hover:text-ink-txt"
            >
              退出登录
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="mx-auto max-w-6xl px-5 pt-6">
        <div className="inline-flex rounded-xl border border-ink-line bg-ink-panel p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => gotoTab(t.key)}
              className={`rounded-lg px-6 py-2 text-sm transition-colors ${
                tab === t.key
                  ? 'bg-ink-panel2 text-ink-txt'
                  : 'text-ink-muted hover:text-ink-txt'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 主体 */}
      <main className="mx-auto max-w-6xl px-5 py-6 pb-20">
        {error && (
          <div className="mb-5 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading && tab !== 'sync' && books.length === 0 && (
          <div className="py-16 text-center text-ink-muted">加载中…</div>
        )}

        {route.name === 'book' ? (
          (() => {
            const book = books.find((b) => b.book_id === route.id)
            if (!book) {
              return (
                <div className="rounded-xl border border-dashed border-ink-line bg-ink-panel p-10 text-center text-ink-muted">
                  没有找到这本书，
                  <button
                    type="button"
                    onClick={() => gotoTab('shelf')}
                    className="text-brand-blue hover:underline"
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
  )
}
