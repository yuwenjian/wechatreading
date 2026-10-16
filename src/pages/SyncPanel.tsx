import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from '../lib/api'
import { useSync } from '../hooks/useSync'
import type { SyncTask } from '../lib/types'
import { formatDateTime } from '../lib/format'
import Hint from '../components/Hint'
import { IconSpark, IconSync } from '../components/icons'

type Props = { onDataChanged: () => void }

/** 循环调用型任务的公共状态：一直调到后端说 done 为止 */
type LoopState = {
  running: boolean
  message: string
  tone: 'muted' | 'risk'
  worked: number
}

const IDLE: LoopState = { running: false, message: '', tone: 'muted', worked: 0 }

/** 安全阀：最多循环多少次，防止后端 done 判断出错时把浏览器打爆 */
const MAX_ROUNDS = 80

export default function SyncPanel({ onDataChanged }: Props) {
  const [history, setHistory] = useState<SyncTask[]>([])
  const [historyError, setHistoryError] = useState('')

  const [covers, setCovers] = useState<LoopState>(IDLE)
  const [analysis, setAnalysis] = useState<LoopState & { enabled: boolean; pending: number }>({
    ...IDLE,
    enabled: false,
    pending: 0,
  })

  const loadHistory = useCallback(async () => {
    try {
      const r = await apiGet<{ ok: boolean; tasks: SyncTask[] }>('/api/sync/status')
      setHistory(r.tasks ?? [])
      setHistoryError('')
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : '读取同步记录失败')
    }
  }, [])

  const probeAnalysis = useCallback(async () => {
    try {
      // limit:0 = 干跑，只问状态，不调用模型
      const r = await apiPost<{
        enabled: boolean
        pending?: number
        candidates?: unknown[]
        message?: string
      }>('/api/analysis/run', { limit: 0 })

      setAnalysis({
        running: false,
        message: r.message ?? '',
        tone: 'muted',
        worked: 0,
        enabled: Boolean(r.enabled),
        pending: r.pending ?? r.candidates?.length ?? 0,
      })
    } catch (e) {
      setAnalysis({
        running: false,
        message: e instanceof Error ? e.message : '读取分析状态失败',
        tone: 'risk',
        worked: 0,
        enabled: false,
        pending: 0,
      })
    }
  }, [])

  const handleFinished = useCallback(() => {
    onDataChanged()
    loadHistory()
    probeAnalysis()
  }, [onDataChanged, loadHistory, probeAnalysis])

  const { phase, task, progress, message, failedIds, processed, notes, run, retryFailed } =
    useSync(handleFinished)

  useEffect(() => {
    loadHistory()
    probeAnalysis()
  }, [loadHistory, probeAnalysis])

  // ── 封面补齐 ─────────────────────────────────────────────────────────────
  const runCovers = useCallback(async () => {
    setCovers({ running: true, message: '开始补齐封面…', tone: 'muted', worked: 0 })

    let mirrored = 0
    let failed = 0

    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const r = await apiPost<{
          mirroredCount: number
          failed: { bookId: string; error: string }[]
          remaining: number
          processed: number
          done: boolean
          message: string
        }>('/api/covers/backfill', { limit: 10 })

        mirrored += r.mirroredCount
        failed += r.failed?.length ?? 0

        setCovers({
          running: true,
          message: `已镜像 ${mirrored} 本${failed > 0 ? `，失败 ${failed} 本` : ''}，剩余 ${r.remaining} 本…`,
          tone: 'muted',
          worked: mirrored,
        })

        if (r.done) break

        // 没有任何进展又没结束 → 说明是稳定失败，继续循环只会空转
        if (r.processed === 0 || r.mirroredCount === 0) {
          setCovers({
            running: false,
            message: `已镜像 ${mirrored} 本；剩余 ${r.remaining} 本本轮未能成功（多为源图不可用），可稍后重试。`,
            tone: 'risk',
            worked: mirrored,
          })
          onDataChanged()
          return
        }
      }

      setCovers({
        running: false,
        message: `封面补齐完成：本次共镜像 ${mirrored} 本${failed > 0 ? `，失败 ${failed} 本` : ''}。`,
        tone: failed > 0 ? 'risk' : 'muted',
        worked: mirrored,
      })
    } catch (e) {
      setCovers({
        running: false,
        message: e instanceof Error ? e.message : '补齐封面失败',
        tone: 'risk',
        worked: mirrored,
      })
    } finally {
      onDataChanged()
    }
  }, [onDataChanged])

  // ── AI 分析 ──────────────────────────────────────────────────────────────
  const runAnalysis = useCallback(async () => {
    setAnalysis((s) => ({ ...s, running: true, message: '开始分析…', tone: 'muted' }))

    let analyzed = 0
    let failed = 0

    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const r = await apiPost<{
          analyzedCount: number
          failed: { bookId: string; error: string }[]
          remaining: number
          done: boolean
          message: string
        }>('/api/analysis/run', { limit: 3 })

        analyzed += r.analyzedCount
        failed += r.failed?.length ?? 0

        setAnalysis((s) => ({
          ...s,
          running: true,
          message: `已分析 ${analyzed} 本${failed > 0 ? `，失败 ${failed} 本` : ''}，剩余 ${r.remaining} 本…`,
          tone: 'muted',
          worked: analyzed,
        }))

        if (r.done) break

        if (r.analyzedCount === 0) {
          setAnalysis((s) => ({
            ...s,
            running: false,
            message: `已分析 ${analyzed} 本；剩余 ${r.remaining} 本本轮未能完成，可稍后重试。${
              r.failed?.[0] ? `首个错误：${r.failed[0].error}` : ''
            }`,
            tone: 'risk',
            worked: analyzed,
          }))
          onDataChanged()
          return
        }
      }

      setAnalysis((s) => ({
        ...s,
        running: false,
        message: `分析完成：本次共生成 ${analyzed} 本${failed > 0 ? `，失败 ${failed} 本` : ''}。`,
        tone: failed > 0 ? 'risk' : 'muted',
        worked: analyzed,
        pending: 0,
      }))
    } catch (e) {
      setAnalysis((s) => ({
        ...s,
        running: false,
        message: e instanceof Error ? e.message : 'AI 分析失败',
        tone: 'risk',
        worked: analyzed,
      }))
    } finally {
      onDataChanged()
    }
  }, [onDataChanged])

  const busy = phase === 'starting' || phase === 'running'

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="card card-pad">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="section-title">
              <IconSync className="mr-1.5 h-4 w-4 text-brand-blue" />
              数据同步
            </h2>
            <p className="mt-1.5 max-w-[520px] text-[12.5px] leading-relaxed text-ink-muted">
              只会拉取「笔记计数有变化」的书。首次全量约 15 本、60 余次请求，因此按每批 4
              本分批执行，中断后重跑不会丢进度、也不会产生重复数据。
            </p>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
            {failedIds.length > 0 && (
              <button
                type="button"
                onClick={retryFailed}
                disabled={busy}
                className="btn btn-soft"
              >
                重试失败的 {failedIds.length} 本
              </button>
            )}
            <button type="button" onClick={run} disabled={busy} className="btn btn-primary">
              {busy ? '同步中…' : '开始同步'}
            </button>
          </div>
        </div>

        {(busy || progress > 0) && (
          <div className="mt-5">
            <div className="h-2 overflow-hidden rounded-full bg-ink-surface2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-teal/60 to-brand-teal transition-[width] duration-300 ease-app"
                style={{ width: `${Math.max(progress, busy ? 4 : 0)}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[12px] text-ink-faint tabular-nums">
              <span className="truncate pr-3">{message || '准备中…'}</span>
              <span className="shrink-0">{progress}%</span>
            </div>
          </div>
        )}

        {!busy && progress === 0 && message && (
          <div className="mt-4">
            <Hint text={message} tone={phase === 'error' ? 'risk' : 'muted'} />
          </div>
        )}

        {phase === 'done' && (processed > 0 || notes > 0) && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MiniStat label="本次处理" value={`${processed} 本`} />
            <MiniStat label="写入笔记内容" value={`${notes} 条`} />
            <MiniStat label="剩余" value={`${task?.pending_book_ids?.length ?? 0} 本`} />
          </div>
        )}
      </section>

      {/* ── 封面与 AI 分析 ── */}
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <section className="card card-pad">
          <h2 className="section-title">封面镜像</h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
            把封面从微信读书 CDN 搬到自己的 Supabase Storage，页面就不再受第三方可用性影响。
            同步流程会顺带做，这里的按钮负责补齐历史上漏掉的。
          </p>

          <div className="mt-4">
            <button
              type="button"
              onClick={runCovers}
              disabled={covers.running}
              className="btn btn-soft w-full sm:w-auto"
            >
              {covers.running ? '补齐中…' : '补齐封面'}
            </button>
          </div>

          {covers.message && (
            <div className="mt-3">
              <Hint text={covers.message} tone={covers.tone} />
            </div>
          )}
        </section>

        <section className="card card-pad">
          <h2 className="section-title">
            <IconSpark className="mr-1.5 h-4 w-4 text-brand-purple" />
            AI 分析
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
            按「划线条数水位线」判断哪些书需要（重新）生成分析 —— 划线没变的书不会重复调用模型。
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={runAnalysis}
              disabled={analysis.running || !analysis.enabled}
              className="btn btn-soft flex-1 sm:flex-none"
            >
              {analysis.running ? '分析中…' : '运行 AI 分析'}
            </button>

            {analysis.enabled && !analysis.running && analysis.pending > 0 && (
              <span className="text-[12.5px] text-ink-faint tabular-nums">
                待分析 {analysis.pending} 本
              </span>
            )}
          </div>

          {analysis.message && (
            <div className="mt-3">
              <Hint text={analysis.message} tone={analysis.tone} />
            </div>
          )}
        </section>
      </div>

      <section className="card card-pad">
        <h2 className="section-title mb-4">同步记录</h2>

        {historyError && <Hint text={historyError} tone="risk" />}
        {!historyError && history.length === 0 && <Hint text="还没有同步记录。" />}

        {history.length > 0 && (
          <>
            {/* 移动端：卡片流，避免横向滚动 */}
            <ul className="space-y-2.5 md:hidden">
              {history.map((t) => (
                <li
                  key={t.task_id}
                  className="rounded-tile border border-ink-line bg-ink-surface2/50 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] tabular-nums text-ink-muted">
                      {formatDateTime(t.started_at)}
                    </span>
                    <StatusTag status={t.status} failed={t.failed_book_ids?.length ?? 0} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-muted">
                    <span>{t.trigger_source === 'cron' ? '定时' : '手动'}触发</span>
                    <span className="tabular-nums">书目 {t.books_total ?? 0}</span>
                    <span className="tabular-nums">变化 {t.books_changed ?? 0}</span>
                    <span className="tabular-nums">
                      {t.finished_at ? `耗时 ${elapsed(t.started_at, t.finished_at)} 秒` : '进行中'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            {/* PC：表格 */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-ink-line text-left text-ink-faint">
                    <th className="py-2.5 pr-3 font-normal">开始时间</th>
                    <th className="py-2.5 pr-3 font-normal">触发</th>
                    <th className="py-2.5 pr-3 font-normal">书目</th>
                    <th className="py-2.5 pr-3 font-normal">变化</th>
                    <th className="py-2.5 pr-3 font-normal">状态</th>
                    <th className="py-2.5 font-normal">耗时</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-line">
                  {history.map((t) => (
                    <tr key={t.task_id} className="transition-colors hover:bg-white/[.03]">
                      <td className="py-3 pr-3 tabular-nums text-ink-muted">
                        {formatDateTime(t.started_at)}
                      </td>
                      <td className="py-3 pr-3 text-ink-muted">
                        {t.trigger_source === 'cron' ? '定时' : '手动'}
                      </td>
                      <td className="py-3 pr-3 tabular-nums text-ink-muted">{t.books_total ?? 0}</td>
                      <td className="py-3 pr-3 tabular-nums text-ink-muted">
                        {t.books_changed ?? 0}
                      </td>
                      <td className="py-3 pr-3">
                        <StatusTag status={t.status} failed={t.failed_book_ids?.length ?? 0} />
                      </td>
                      <td className="py-3 tabular-nums text-ink-muted">
                        {t.finished_at ? `${elapsed(t.started_at, t.finished_at)} 秒` : '进行中'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function elapsed(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return Math.max(0, Math.round(ms / 1000))
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-tile border border-ink-line bg-ink-surface2 px-3.5 py-2.5">
      <div className="text-[11.5px] text-ink-faint">{label}</div>
      <div className="mt-0.5 text-[15px] font-medium tabular-nums">{value}</div>
    </div>
  )
}

function StatusTag({ status, failed }: { status: string; failed: number }) {
  const done = status === 'done'
  const text = done ? (failed > 0 ? `完成（${failed} 本失败）` : '完成') : '进行中'
  const tone = done
    ? failed > 0
      ? 'border-brand-amber/40 bg-brand-amber/10 text-brand-amber'
      : 'border-brand-teal/[0.35] bg-brand-teal/10 text-brand-teal'
    : 'border-brand-blue/[0.35] bg-brand-blue/10 text-brand-blue'
  const dot = done ? (failed > 0 ? 'bg-brand-amber' : 'bg-brand-teal') : 'bg-brand-blue'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[11.5px] ${tone}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {text}
    </span>
  )
}
