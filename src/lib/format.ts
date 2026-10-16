/** 时长：秒 → 人话 */
export function formatDuration(seconds: number | null | undefined): string {
  const s = Number(seconds ?? 0)
  if (!s) return '0 分钟'
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  if (h >= 100) return `${h} 小时`
  if (h > 0) return `${h} 小时 ${m} 分`
  return `${m} 分钟`
}

/** 紧凑时长，用于卡片角标：秒 → 「292.5h」 */
export function formatHours(seconds: number | null | undefined): string {
  const h = Number(seconds ?? 0) / 3600
  if (h >= 100) return `${Math.round(h)}h`
  if (h >= 10) return `${h.toFixed(1)}h`
  return `${h.toFixed(1)}h`
}

/** Unix 秒 → YYYY-MM-DD */
export function formatDate(ts: number | null | undefined): string {
  if (!ts) return '—'
  const d = new Date(Number(ts) * 1000)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** iso 字符串 → YYYY-MM-DD HH:mm */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 距离今天多少天，用于「最近笔记」提示 */
export function daysAgo(ts: number | null | undefined): string {
  if (!ts) return '暂无笔记'
  const diff = Date.now() - Number(ts) * 1000
  const days = Math.floor(diff / 86400000)
  if (days <= 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 30) return `${days} 天前`
  if (days < 365) return `${Math.floor(days / 30)} 个月前`
  return `${Math.floor(days / 365)} 年前`
}

/** 数字千分位 */
export function groupNumber(n: number | null | undefined): string {
  return Number(n ?? 0).toLocaleString('zh-CN')
}

/**
 * 阅读时长（秒）→ 中文紧凑写法，与参考工作台一致：
 * 0、13小时1分、2小时9分、3分钟、208小时33分
 */
export function formatHoursCN(seconds: number | null | undefined): string {
  const s = Number(seconds ?? 0)
  if (!s) return '0小时'
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  if (h === 0) return `${m}分钟`
  return `${h}小时${m ? `${m}分` : ''}`
}

/** 微信读书原始分类 → 四大组（与 WorkBuddy 参考页一致） */
export function groupCategory(category: string | null | undefined): string {
  const c = category ?? ''
  if (/小说|文学|科幻|玄幻|武侠|诗/.test(c)) return '文学小说'
  if (/投资|理财|股票|金融|经济|商业/.test(c)) return '金融理财'
  if (/心理|认知|成长|励志|管理/.test(c)) return '认知成长与管理'
  return '其他'
}

/** 字数 → 「12.3万字」/「5000字」，与参考工作台一致 */
export function formatWords(w: number | null | undefined): string {
  const n = Number(w ?? 0)
  if (!n) return ''
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')}万字`
  return `${n}字`
}

/** 评分原始值（百分制 900）→ 「9.0」 */
export function formatRating(rating: number | null | undefined): string {
  const r = Number(rating ?? 0)
  if (!r) return ''
  return (r / 100).toFixed(1)
}
