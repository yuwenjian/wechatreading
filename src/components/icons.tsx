import type { SVGProps } from 'react'

/**
 * 统一图标集：24×24 网格、stroke 1.75、currentColor。
 * 全部为矢量，不使用 emoji —— emoji 依赖系统字体，各平台形状不一致且无法跟随主题色。
 */
type P = SVGProps<SVGSVGElement>

function Base({ children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

/** 书架 */
export function IconShelf(p: P) {
  return (
    <Base {...p}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H9a2 2 0 0 1 2 2v12a2 2 0 0 0 2-2V6a2 2 0 0 1 2-2h3.5A1.5 1.5 0 0 1 20 5.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5.5Z" />
      <path d="M9 8h6" />
    </Base>
  )
}

/** 阅读报告 */
export function IconReport(p: P) {
  return (
    <Base {...p}>
      <path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 16h4" />
    </Base>
  )
}

/** 阅读统计 */
export function IconStats(p: P) {
  return (
    <Base {...p}>
      <path d="M4 20V10M10 20V5M16 20v-7M22 20H2" />
    </Base>
  )
}

/** 同步 */
export function IconSync(p: P) {
  return (
    <Base {...p}>
      <path d="M20 11a8 8 0 0 0-13.6-4.6L4 9" />
      <path d="M4 5v4h4" />
      <path d="M4 13a8 8 0 0 0 13.6 4.6L20 15" />
      <path d="M20 19v-4h-4" />
    </Base>
  )
}

/** 返回 */
export function IconBack(p: P) {
  return (
    <Base {...p}>
      <path d="M15 6l-6 6 6 6" />
    </Base>
  )
}

/** 前进 */
export function IconNext(p: P) {
  return (
    <Base {...p}>
      <path d="M9 6l6 6-6 6" />
    </Base>
  )
}

/** 时长 */
export function IconClock(p: P) {
  return (
    <Base {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Base>
  )
}

/** 评分（实心） */
export function IconStar(p: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
      <path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6l-5.3 2.9 1.1-5.9L3.4 9.5l6-.8L12 3.2z" />
    </svg>
  )
}

/** 划线 */
export function IconQuote(p: P) {
  return (
    <Base {...p}>
      <path d="M8 7H5.5A1.5 1.5 0 0 0 4 8.5v7A1.5 1.5 0 0 0 5.5 17H8" />
      <path d="M16 7h2.5A1.5 1.5 0 0 1 20 8.5v7a1.5 1.5 0 0 1-1.5 1.5H16" />
      <path d="M9 12h6" />
    </Base>
  )
}

/** 想法 */
export function IconIdea(p: P) {
  return (
    <Base {...p}>
      <path d="M9 17h6M10 20h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3Z" />
    </Base>
  )
}

/** AI / 智能 */
export function IconSpark(p: P) {
  return (
    <Base {...p}>
      <path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Z" />
      <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" />
    </Base>
  )
}

/** 外部链接 */
export function IconExternal(p: P) {
  return (
    <Base {...p}>
      <path d="M14 5h5v5" />
      <path d="M19 5l-7.5 7.5" />
      <path d="M18 14.5V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V7.5A1.5 1.5 0 0 1 6 6h3.5" />
    </Base>
  )
}

/** 退出登录 */
export function IconLogout(p: P) {
  return (
    <Base {...p}>
      <path d="M14 4h3.5A1.5 1.5 0 0 1 19 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" />
      <path d="M10 8l-4 4 4 4" />
      <path d="M6 12h9" />
    </Base>
  )
}

/** 应用标志：打开的书籍（实心，与 PWA 图标呼应） */
export function IconLogo(p: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
      <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1z" />
    </svg>
  )
}
