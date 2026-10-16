import { useCallback, useState } from 'react'
import { apiPost } from '../lib/api'
import type { BatchResult, SyncTask } from '../lib/types'

export type SyncPhase = 'idle' | 'starting' | 'running' | 'done' | 'error'

const BATCH_SIZE = 4
/** 安全上限：正常十几本书两三轮就结束，这个数字只是防止死循环 */
const MAX_ROUNDS = 200

export type SyncState = {
  phase: SyncPhase
  task: SyncTask | null
  progress: number
  message: string
  failedIds: string[]
  processed: number
  notes: number
}

const INITIAL: SyncState = {
  phase: 'idle',
  task: null,
  progress: 0,
  message: '',
  failedIds: [],
  processed: 0,
  notes: 0,
}

/**
 * 同步编排：start 建任务 → 循环 batch 推进队列 → 结束回调。
 *
 * 前端只负责"按批驱动"，进度真相在 wr_sync_log 表里。
 * 所以中途关掉页面不会丢进度，重新进来还能看到任务状态。
 */
export function useSync(onFinished?: () => void) {
  const [state, setState] = useState<SyncState>(INITIAL)

  const run = useCallback(async () => {
    setState({ ...INITIAL, phase: 'starting', message: '正在拉取书目并比对变化…' })

    try {
      const started = await apiPost<{ ok: boolean; task: SyncTask }>('/api/sync/start')
      const task = started.task

      const pending = task.pending_book_ids ?? []

      if (pending.length === 0) {
        setState({
          ...INITIAL,
          phase: 'done',
          task,
          progress: 100,
          message: '数据已是最新，没有需要更新的书。',
        })
        onFinished?.()
        return
      }

      setState({
        ...INITIAL,
        phase: 'running',
        task,
        message: `发现 ${task.books_changed ?? pending.length} 本有变化，开始逐本拉取…`,
      })

      let processed = 0
      let notes = 0
      let failedIds: string[] = []
      let progress = 0

      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const r = await apiPost<BatchResult>('/api/sync/batch', {
          task_id: task.task_id,
          limit: BATCH_SIZE,
        })

        processed += r.processed
        notes += r.notes
        failedIds = r.failedIds ?? []
        progress = r.progress ?? progress

        setState((prev) => ({
          ...prev,
          processed,
          notes,
          failedIds,
          progress,
          message: r.done
            ? '正在收尾…'
            : `已处理 ${processed} 本，剩余 ${r.remaining} 本…`,
        }))

        if (r.done) break
      }

      setState((prev) => ({
        ...prev,
        phase: 'done',
        progress: 100,
        processed,
        notes,
        failedIds,
        message:
          failedIds.length > 0
            ? `同步完成，但 ${failedIds.length} 本拉取失败，可点「重试失败的书」再试一次。`
            : `同步完成，共更新 ${processed} 本、${notes} 条笔记内容。`,
      }))
      onFinished?.()
    } catch (e) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        message: e instanceof Error ? e.message : '同步失败，请稍后重试',
      }))
    }
  }, [onFinished])

  /** 重试失败的书：走 batch 的 explicit 模式，不推进队列 */
  const retryFailed = useCallback(async () => {
    if (!state.task || state.failedIds.length === 0) return

    setState((prev) => ({ ...prev, phase: 'running', message: '正在重试失败的书…' }))

    try {
      const r = await apiPost<BatchResult>('/api/sync/batch', {
        task_id: state.task.task_id,
        book_ids: state.failedIds,
        limit: state.failedIds.length,
      })

      const stillFailed = r.failed ?? []
      setState((prev) => ({
        ...prev,
        phase: 'done',
        failedIds: stillFailed,
        message:
          stillFailed.length > 0
            ? `重试后仍有 ${stillFailed.length} 本失败，稍后可再试。`
            : '失败的书已全部补齐。',
      }))
      onFinished?.()
    } catch (e) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        message: e instanceof Error ? e.message : '重试失败',
      }))
    }
  }, [state.task, state.failedIds, onFinished])

  const reset = useCallback(() => setState(INITIAL), [])

  return { ...state, run, retryFailed, reset }
}
