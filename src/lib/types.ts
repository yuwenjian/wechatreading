/** 与 supabase/schema.sql 一一对应的行类型 */

export type BookRow = {
  book_id: string
  title: string
  author: string | null
  translator: string | null
  category: string | null
  publisher: string | null
  isbn: string | null
  publish_time: string | null
  word_count: number | null
  intro: string | null
  rating: number | null
  rating_count: number | null
  cover_url: string | null
  reader_link: string | null
  deep_link: string | null
  reading_progress: number | null
  reading_time: number | null
  tts_time: number | null
  start_reading_time: number | null
  finish_time: number | null
  last_note_time: number | null
  note_count: number | null
  review_count: number | null
  bookmark_count: number | null
  cover_source_url: string | null
  cover_mirrored_at: string | null
  last_synced_at: string | null
  created_at: string | null
  updated_at: string | null
}

export type HighlightRow = {
  bookmark_id: string
  book_id: string
  chapter_uid: number | null
  chapter_title: string | null
  mark_text: string | null
  create_time: number | null
  synced_at: string | null
}

export type ReviewRow = {
  review_id: string
  book_id: string
  chapter_uid: number | null
  chapter_title: string | null
  content: string | null
  abstract: string | null
  star: number | null
  create_time: number | null
  synced_at: string | null
}

export type AnalysisRow = {
  book_id: string
  harvest: string | null
  /** text[] —— 每条一句，不是一整段文本 */
  remember: string[] | null
  preference: string | null
  keywords: string[] | null
  model: string | null
  highlight_count_at_gen: number | null
  generated_at: string | null
}

export type SyncTask = {
  task_id: string
  trigger_source: string
  status: string
  books_total: number | null
  books_changed: number | null
  pending_book_ids: string[] | null
  failed_book_ids: string[] | null
  notes_total: number | null
  error: string | null
  started_at: string
  finished_at: string | null
}

export type StatsPayload = {
  totalReadTime: number
  readDays: number
  dayAverageReadTime: number
  registTime: number
  preferCategoryWord: string
  preferTimeWord: string
  readStat: { stat: string; counts: string }[]
  yearly: { year: string; seconds: number }[]
  readLongest: { title: string; bookId: string; seconds: number; tags: unknown[] }[]
  preferCategory: { parent: string; title: string; seconds: number; count: number }[]
  preferTime: number[]
  preferPublisher: { name: string; count: number }[]
}

export type StatsRow = {
  id: number
  mode: string
  base_time: number
  payload: StatsPayload
  synced_at: string
}

/** AI 阅读报告内容，与 api/_lib/report.ts 的 ReportContent 保持一致 */
export type ReportContent = {
  overview: string
  rhythm: string
  themes: { title: string; note: string }[]
  picks: { book: string; excerpt: string; why: string }[]
  suggestion: string
}

export type ReportRow = {
  period_type: 'week' | 'month' | 'year'
  /** YYYY-MM-DD，周期第一天 */
  period_start: string
  content: ReportContent
  model: string | null
  note_count: number
  generated_at: string
}

export type ReportGenerateResult = {
  ok: boolean
  report: ReportContent
  cached: boolean
  model?: string
  noteCount: number
  generatedAt: string
  error?: string
}

export type BatchResult = {
  ok: boolean
  done: boolean
  processed: number
  remaining: number
  failed: string[]
  failedIds: string[]
  notes: number
  progress: number
  error?: string
}
