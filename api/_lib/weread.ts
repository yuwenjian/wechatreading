/**
 * 微信读书 Agent Gateway 客户端（仅服务端可用）
 *
 * 为什么必须放在服务端：
 *   网关的 CORS 响应头硬编码为 access-control-allow-origin: https://weread.qq.com，
 *   且不返回 allow-methods / allow-headers。任何其他来源的浏览器请求都会在
 *   预检阶段被拦掉，所以浏览器不能直连，必须由服务端中转。
 *
 * 字段名均按实测结果映射，改动前请先核对真实返回结构。
 */

const GATEWAY = "https://i.weread.qq.com/api/agent/gateway";
const SKILL_VERSION = "1.0.5";

export class WereadError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "WereadError";
    this.status = status;
  }
}

type Json = Record<string, any>;

async function call<T = Json>(body: Json): Promise<T> {
  const key = process.env.WEREAD_API_KEY;
  if (!key) throw new WereadError("服务端未配置 WEREAD_API_KEY");

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    // 业务参数平铺在顶层，与 api_name / skill_version 同级
    body: JSON.stringify({ ...body, skill_version: SKILL_VERSION }),
  });

  if (res.status === 401 || res.status === 403) {
    throw new WereadError("微信读书鉴权失败，请检查 WEREAD_API_KEY 是否有效", res.status);
  }
  if (res.status === 429) {
    throw new WereadError("微信读书接口触发限流，请稍后再试", res.status);
  }
  if (!res.ok) {
    throw new WereadError(`微信读书网关返回 HTTP ${res.status}`, res.status);
  }

  return (await res.json()) as T;
}

// ── 类型 ────────────────────────────────────────────────────────────────────

export type NotebookBook = {
  bookId: string;
  book?: {
    title?: string;
    author?: string;
    translator?: string;
    cover?: string;
    categories?: { title?: string }[];
    readerLink?: string;
    deepLink?: string;
  };
  reviewCount?: number;
  markedStatus?: number;
  readingProgress?: number;
  noteCount?: number;
  bookmarkCount?: number;
  sort?: number;
};

export type Chapter = { chapterUid?: number; chapterIdx?: number; title?: string };

export type RawHighlight = {
  bookmarkId: string;
  chapterUid?: number;
  chapterIdx?: number;
  markText?: string;
  createTime?: number;
};

export type RawReview = {
  reviewId: string;
  content?: string;
  abstract?: string;
  chapterUid?: number;
  chapterName?: string;
  createTime?: number;
  star?: number;
  type?: number;
};

export type BookDetail = {
  chapters: Chapter[];
  highlights: RawHighlight[];
  reviews: RawReview[];
  progress: Json;
  info: Json;
};

// ── 接口 ────────────────────────────────────────────────────────────────────

export type NotebooksResult = {
  books: NotebookBook[];
  totalBookCount: number;
  totalNoteCount: number;
};

/**
 * 拉取「有笔记的书」列表。
 * 游标分页：count + lastSort 平铺在顶层，不支持 offset/limit。
 * 这是增量同步的入口 —— 代价只有 1 次请求。
 */
export async function listNotebooks(): Promise<NotebooksResult> {
  const books: NotebookBook[] = [];
  let lastSort: number | undefined;
  let totalBookCount = 0;
  let totalNoteCount = 0;

  // 上限只是防御：真实书目不会到 1000 本
  for (let page = 0; page < 50; page += 1) {
    const body: Json = { api_name: "/user/notebooks", count: 20 };
    if (lastSort) body.lastSort = lastSort;

    const r = await call<Json>(body);

    if (page === 0) {
      totalBookCount = Number(r.totalBookCount ?? 0);
      totalNoteCount = Number(r.totalNoteCount ?? 0);
    }

    const batch = (r.books ?? []) as NotebookBook[];
    books.push(...batch);

    if (!r.hasMore || batch.length === 0) break;
    lastSort = batch[batch.length - 1]?.sort;
    if (!lastSort) break;
  }

  return { books, totalBookCount, totalNoteCount };
}

/** 单本的划线 + 章节表（划线接口同时带回 chapters，用来补章节标题） */
async function fetchHighlights(bookId: string): Promise<{ chapters: Chapter[]; highlights: RawHighlight[] }> {
  const r = await call<Json>({ api_name: "/book/bookmarklist", bookId });
  return {
    chapters: (r.chapters ?? []) as Chapter[],
    highlights: (r.updated ?? []) as RawHighlight[],
  };
}

/** 单本的想法 / 点评，游标分页 */
async function fetchReviews(bookId: string): Promise<RawReview[]> {
  const out: RawReview[] = [];
  let synckey = 0;

  for (let page = 0; page < 50; page += 1) {
    // 注意：这个接口的书籍参数名是小写 bookid，与其它接口不一致
    const r = await call<Json>({
      api_name: "/review/list/mine",
      bookid: bookId,
      count: 50,
      synckey,
    });

    for (const item of (r.reviews ?? []) as Json[]) {
      if (item?.review) out.push(item.review as RawReview);
    }

    if (r.hasMore) {
      synckey = Number(r.synckey ?? 0);
      if (!synckey) break;
    } else {
      break;
    }
  }

  return out;
}

/** 逐本拉全量明细：4 个接口并发，减少串行等待 */
export async function fetchBookDetail(bookId: string): Promise<BookDetail> {
  const [hl, reviews, pg, info] = await Promise.all([
    fetchHighlights(bookId),
    fetchReviews(bookId),
    call<Json>({ api_name: "/book/getprogress", bookId }),
    call<Json>({ api_name: "/book/info", bookId }),
  ]);

  return {
    chapters: hl.chapters,
    highlights: hl.highlights,
    reviews,
    progress: (pg.book ?? {}) as Json,
    info,
  };
}

/** 阅读统计详情。mode=overall 为全账号累计 */
export async function fetchReadStats(mode: "overall" | "monthly" | "annually" | "weekly" = "overall"): Promise<Json> {
  return call<Json>({ api_name: "/readdata/detail", mode, baseTime: 0 });
}
