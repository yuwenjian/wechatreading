/**
 * 同步引擎（服务端）
 *
 * 职责：
 *   1. 增量判定 —— 用 /user/notebooks 的计数与库内比对，算出"真正变了"的书；
 *   2. 幂等入库 —— 全部走业务唯一键 upsert，重跑/中断/并发都不会产生重复数据；
 *   3. 统计清洗 —— 把 overall 原始结构精简成前端可直接渲染的形状。
 *
 * 一条重要约定：计数（note_count 等）只在"明细拉取成功"后才写回。
 * 若某本书拉取失败，它的旧计数保持不变，下次同步会被重新判定为"有变化"，
 * 从而自然获得重试机会 —— 这正是把计数当作判据的前提。
 */

import { admin } from "./supabaseAdmin.js";
import { describeError } from "./http.js";
import { isMirrored, mirrorCover } from "./covers.js";
import {
  fetchBookDetail,
  fetchReadStats,
  listNotebooks,
  type Chapter,
  type NotebookBook,
} from "./weread.js";

type Json = Record<string, any>;

// ── 结构转换 ────────────────────────────────────────────────────────────────

/**
 * 新书的「身份行」——只写标识信息，**不写计数与进度**。
 *
 * 这是刻意的：计数是增量判据，只有 syncOneBook 成功拉完明细才写回。
 * 如果这里就把计数写上，一旦紧接着的明细拉取失败，这本书就会被误判为
 * "已同步"，从此再也不会被重试到。留空（默认 0）能让失败自然重试。
 */
export function toIdentityRow(b: NotebookBook): Json {
  const meta = b.book ?? {};
  return {
    book_id: b.bookId,
    title: meta.title ?? "（无标题）",
    author: meta.author ?? null,
    translator: meta.translator ?? null,
    // 先放 CDN 原址兜底，让书架立刻有图；镜像成功后由 syncOneBook 覆盖成 Storage 地址。
    // cover_source_url 记下原址，是后面判断"要不要重新镜像"的依据。
    cover_url: meta.cover ?? null,
    cover_source_url: meta.cover ?? null,
    category: meta.categories?.[0]?.title ?? null,
    reader_link: meta.readerLink ?? null,
    deep_link: meta.deepLink ?? null,
  };
}

/** 章节 uid → 标题，用于给划线补章节名 */
export function buildChapterMap(chapters: Chapter[]): Map<number, string> {
  const m = new Map<number, string>();
  for (const c of chapters) {
    if (typeof c.chapterUid === "number") m.set(c.chapterUid, c.title ?? "");
  }
  return m;
}

/** 统计清洗：把 overall 原始结构压成前端要的形状 */
export function cleanStats(raw: Json): Json {
  const toArray = (v: unknown) => (Array.isArray(v) ? (v as Json[]) : []);

  const yearly = Object.entries((raw.readTimes ?? {}) as Record<string, number>)
    .map(([ts, seconds]) => ({
      year: String(new Date(Number(ts) * 1000).getFullYear()),
      seconds: Number(seconds) || 0,
    }))
    .sort((a, b) => Number(a.year) - Number(b.year));

  const readLongest = toArray(raw.readLongest).map((r) => ({
    title: r.book?.title ?? r.albumInfo?.name ?? "",
    bookId: r.book?.bookId ?? "",
    seconds: Number(r.readTime ?? 0),
    tags: toArray(r.tags),
  }));

  const preferCategory = toArray(raw.preferCategory).map((c) => ({
    parent: c.parentCategoryTitle ?? "",
    title: c.categoryTitle ?? "",
    seconds: Number(c.readingTime ?? 0),
    count: Number(c.readingCount ?? 0),
  }));

  return {
    totalReadTime: Number(raw.totalReadTime ?? 0),
    readDays: Number(raw.readDays ?? 0),
    dayAverageReadTime: Number(raw.dayAverageReadTime ?? 0),
    registTime: Number(raw.registTime ?? 0),
    preferCategoryWord: raw.preferCategoryWord ?? "",
    preferTimeWord: raw.preferTimeWord ?? "",
    readStat: toArray(raw.readStat).map((s) => ({ stat: s.stat ?? "", counts: s.counts ?? "" })),
    yearly,
    readLongest,
    preferCategory,
    preferTime: toArray(raw.preferTime),
    preferPublisher: toArray(raw.preferPublisher).map((p) => ({
      name: p.name ?? "",
      count: Number(p.count ?? 0),
    })),
  };
}

// ── 增量判定 ────────────────────────────────────────────────────────────────

export type BookCounters = {
  book_id: string;
  note_count: number | null;
  review_count: number | null;
  bookmark_count: number | null;
  last_note_time: number | null;
};

/**
 * 变化判据：笔记/想法/书签计数任一变化，或最近笔记时间变化，或出现新书。
 * 纯本地比较，不触发任何网络请求 —— 这是"少拉"的关键。
 */
export function findChangedBooks(existing: BookCounters[], incoming: NotebookBook[]): string[] {
  const byId = new Map(existing.map((e) => [e.book_id, e]));
  const changed: string[] = [];

  for (const b of incoming) {
    const prev = byId.get(b.bookId);
    if (!prev) {
      changed.push(b.bookId);
      continue;
    }
    if (
      Number(prev.note_count ?? 0) !== Number(b.noteCount ?? 0) ||
      Number(prev.review_count ?? 0) !== Number(b.reviewCount ?? 0) ||
      Number(prev.bookmark_count ?? 0) !== Number(b.bookmarkCount ?? 0) ||
      Number(prev.last_note_time ?? 0) !== Number(b.sort ?? 0)
    ) {
      changed.push(b.bookId);
    }
  }

  return changed;
}

// ── 入库 ────────────────────────────────────────────────────────────────────

/**
 * 拉取单本明细并幂等入库。
 * counters 传入时，成功后才写回计数（失败则不写，保留重试机会）。
 */
export async function syncOneBook(
  bookId: string,
  counters?: NotebookBook,
): Promise<{ highlights: number; reviews: number }> {
  const db = admin();
  const detail = await fetchBookDetail(bookId);
  const chapters = buildChapterMap(detail.chapters);

  const info = detail.info ?? {};
  const progress = detail.progress ?? {};
  const now = new Date().toISOString();

  const patch: Json = {
    title: info.title ?? undefined,
    author: info.author ?? undefined,
    translator: info.translator ?? undefined,
    cover_url: info.cover ?? undefined,
    cover_source_url: info.cover ?? undefined,
    category: info.category ?? undefined,
    publisher: info.publisher ?? undefined,
    isbn: info.isbn ?? undefined,
    publish_time: info.publishTime ?? undefined,
    word_count: Number(info.wordCount ?? 0),
    intro: info.intro ?? undefined,
    rating: Number(info.newRating ?? 0),
    rating_count: Number(info.newRatingCount ?? 0),
    reader_link: info.readerLink ?? undefined,
    deep_link: info.deepLink ?? undefined,
    reading_progress: Number(progress.progress ?? 0),
    reading_time: Number(progress.readingTime ?? 0),
    tts_time: Number(progress.ttsTime ?? 0),
    start_reading_time: Number(progress.startReadingTime ?? 0),
    finish_time: Number(progress.finishTime ?? 0),
    last_synced_at: now,
    updated_at: now,
  };

  // 计数与列表页元数据在成功路径上写回
  if (counters) {
    patch.note_count = Number(counters.noteCount ?? 0);
    patch.review_count = Number(counters.reviewCount ?? 0);
    patch.bookmark_count = Number(counters.bookmarkCount ?? 0);
    patch.last_note_time = Number(counters.sort ?? 0);
    patch.reading_progress = Number(counters.readingProgress ?? patch.reading_progress ?? 0);
    if (counters.book?.cover) {
      patch.cover_url = counters.book.cover;
      patch.cover_source_url = counters.book.cover;
    }
  }

  // ── 封面镜像 ──────────────────────────────────────────────────────────────
  // 原则：封面是「锦上添花」，拉不到不该让整本书的同步失败。
  // 失败时退化为直接用 CDN 原址，由 /api/covers/backfill 在后续补齐。
  const srcCover = (patch.cover_source_url as string | undefined) ?? null;
  if (srcCover) {
    try {
      const { data: cur } = await db
        .from("wr_books")
        .select("cover_url, cover_source_url")
        .eq("book_id", bookId)
        .maybeSingle();

      const row = (cur ?? null) as Json | null;
      const sourceChanged = String(row?.cover_source_url ?? "") !== srcCover;
      if (sourceChanged || !isMirrored(row?.cover_url)) {
        patch.cover_url = await mirrorCover(bookId, srcCover, {
          currentUrl: row?.cover_url ?? null,
        });
        patch.cover_mirrored_at = now;
      }
    } catch (e) {
      console.warn(`[sync] 封面镜像失败，退化为 CDN 原址 book=${bookId}：`, describeError(e));
      patch.cover_url = srcCover;
    }
  }

  const { error: bookErr } = await db.from("wr_books").update(patch).eq("book_id", bookId);
  if (bookErr) throw new Error(`更新书籍信息失败：${bookErr.message}`);

  if (detail.highlights.length > 0) {
    const rows = detail.highlights.map((h) => ({
      bookmark_id: h.bookmarkId,
      book_id: bookId,
      chapter_uid: h.chapterUid ?? null,
      chapter_title: chapters.get(Number(h.chapterUid)) ?? null,
      mark_text: h.markText ?? "",
      create_time: Number(h.createTime ?? 0),
      synced_at: now,
    }));
    const { error } = await db.from("wr_highlights").upsert(rows, { onConflict: "bookmark_id" });
    if (error) throw new Error(`写入划线失败：${error.message}`);
  }

  if (detail.reviews.length > 0) {
    const rows = detail.reviews.map((r) => ({
      review_id: r.reviewId,
      book_id: bookId,
      chapter_uid: r.chapterUid ?? null,
      chapter_title: r.chapterName ?? chapters.get(Number(r.chapterUid)) ?? null,
      content: r.content ?? "",
      abstract: r.abstract ?? "",
      star: r.star ?? null,
      create_time: Number(r.createTime ?? 0),
      synced_at: now,
    }));
    const { error } = await db.from("wr_reviews").upsert(rows, { onConflict: "review_id" });
    if (error) throw new Error(`写入想法失败：${error.message}`);
  }

  return { highlights: detail.highlights.length, reviews: detail.reviews.length };
}

/** 同步阅读统计快照（代价 1 次请求） */
export async function syncStats(): Promise<{ totalReadTime: number }> {
  const raw = await fetchReadStats("overall");
  const payload = cleanStats(raw);
  const { error } = await admin()
    .from("wr_stats")
    .upsert(
      {
        mode: "overall",
        base_time: Number(raw.baseTime ?? 0),
        payload,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "mode,base_time" },
    );
  if (error) throw new Error(`写入统计失败：${error.message}`);
  return { totalReadTime: Number(payload.totalReadTime ?? 0) };
}

/**
 * 拉书目 + 算变化集。
 * 只插入"没见过的新书"（保证划线有外键可挂），不覆盖已有书的计数 ——
 * 计数由 syncOneBook 在成功路径上写回。
 */
export async function prepareSync() {
  const db = admin();
  const notebooks = await listNotebooks();

  const { data: existing, error } = await db
    .from("wr_books")
    .select("book_id, note_count, review_count, bookmark_count, last_note_time");
  if (error) throw new Error(`读取现有书目失败：${error.message}`);

  const existingRows = (existing ?? []) as BookCounters[];
  const changed = findChangedBooks(existingRows, notebooks.books);

  const known = new Set(existingRows.map((e) => e.book_id));
  const newBooks = notebooks.books.filter((b) => !known.has(b.bookId));
  if (newBooks.length > 0) {
    // 先落地身份行：划线/想法有外键指向 wr_books，新书必须先存在
    const { error: insErr } = await db.from("wr_books").insert(newBooks.map(toIdentityRow));
    if (insErr) throw new Error(`写入新书目失败：${insErr.message}`);
  }

  // 计数表交给调用方：成功同步后用它的计数写回判据
  const countersById = new Map<string, NotebookBook>();
  for (const b of notebooks.books) countersById.set(b.bookId, b);

  return {
    booksTotal: notebooks.books.length,
    notesTotal: notebooks.totalNoteCount,
    changed,
    countersById,
  };
}
