/**
 * AI 分析引擎（服务端）
 *
 * 输入：某本书的划线 + 想法
 * 输出：四个字段 —— 可带走的结论(harvest) / 要记住的点(remember) /
 *       偏好倾向(preference) / 关键词(keywords)
 *
 * 两条关键机制：
 *   1. 水位线（watermark）：wr_analysis.highlight_count_at_gen 记录"生成分析时
 *      这本书有多少条划线"。条数没变就不重算 —— 这是控制模型成本的核心。
 *   2. 单本失败不影响整批：调用方逐本 try/catch，失败的书水位不推进，
 *      下次还会被选中（自然重试）。
 */

import { admin } from "./supabaseAdmin";
import { chatJSON, llmConfig, type ChatMessage } from "./llm";

type Json = Record<string, any>;

export type Candidate = {
  bookId: string;
  title: string;
  highlights: number;
  watermark: number;
  reason: string;
};

/** 控制单次提示词规模，避免长书把上下文撑爆、把账单撑大 */
const MAX_HIGHLIGHTS = 120;
const MAX_REVIEWS = 20;
const MAX_INPUT_CHARS = 8_000;

/** 算「按水位线看，哪些书需要（重新）分析」 */
export async function analysisCandidates(): Promise<Candidate[]> {
  const db = admin();

  // 注：这里是全量取回后在内存里计数 —— 个人量级（几十到几千条）完全够用，
  // 若数据量再上一个数量级，应改为在库里用视图 / rpc 做聚合。
  const { data: highlights, error: hlErr } = await db.from("wr_highlights").select("book_id");
  if (hlErr) throw new Error(hlErr.message);

  const counts = new Map<string, number>();
  for (const h of highlights ?? []) {
    const id = String((h as Json).book_id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const { data: books, error: bookErr } = await db.from("wr_books").select("book_id, title");
  if (bookErr) throw new Error(bookErr.message);

  const { data: analysis, error: anErr } = await db
    .from("wr_analysis")
    .select("book_id, highlight_count_at_gen");
  if (anErr) throw new Error(anErr.message);

  const byBook = new Map<string, Json>();
  for (const a of (analysis ?? []) as Json[]) {
    byBook.set(String(a.book_id), a);
  }

  const out: Candidate[] = [];
  for (const b of books ?? []) {
    const bookId = String((b as Json).book_id);
    const current = counts.get(bookId) ?? 0;
    if (current === 0) continue; // 没有划线就没有可分析的材料

    const prev = byBook.get(bookId);
    const watermark = Number(prev?.highlight_count_at_gen ?? 0);

    if (!prev || current !== watermark) {
      out.push({
        bookId,
        title: String((b as Json).title ?? ""),
        highlights: current,
        watermark,
        reason: !prev ? "尚未分析" : "划线有变化",
      });
    }
  }

  return out.sort((a, b) => b.highlights - a.highlights);
}

/**
 * 所有「有划线、可分析」的书（忽略水位线）。
 * force=true 强制重算时用它当队列 —— 因为那种情况下不受水位线限制。
 */
export async function analyzableBookIds(): Promise<string[]> {
  const { data, error } = await admin().from("wr_highlights").select("book_id");
  if (error) throw new Error(error.message);

  const set = new Set<string>();
  for (const h of data ?? []) set.add(String((h as Json).book_id));
  return [...set];
}

const SYSTEM_PROMPT = `你是一位读书笔记整理助手。用户会给你一本书的划线原文和他自己的想法。
请只依据这些材料作答，不要引入材料之外的书评或常识补充。

严格输出一个 JSON 对象，包含四个字段：
- "harvest"（字符串，120-200 字）：从这本书里实际能带走的结论。要具体，可引用材料中的原话。
- "remember"（字符串数组，3-5 条）：值得记住的要点，每条一句话，不超过 40 字。
- "preference"（字符串，60-100 字）：从划线偏好推断出的阅读口味或关注点。
- "keywords"（字符串数组，4-8 个）：能代表这本书与该用户关注点交集的短词。

要求：中文；不要复述材料原文超过一句；不要写"本书讲述了……"这类空话；
无法从材料判断的内容宁可不写，也不要编造。`;

function buildUserPrompt(book: Json, highlights: string[], reviews: Json[]): string {
  const parts: string[] = [];

  parts.push(`书名：${book.title ?? "（未知）"}`);
  if (book.author) parts.push(`作者：${book.author}`);
  if (book.category) parts.push(`分类：${book.category}`);
  parts.push("");

  parts.push("【划线原文】");
  let used = 0;
  const lines: string[] = [];
  for (const [i, h] of highlights.entries()) {
    const line = `${i + 1}. ${h}`;
    if (used + line.length > MAX_INPUT_CHARS) break;
    used += line.length;
    lines.push(line);
  }
  parts.push(lines.join("\n"));

  const thoughts = reviews
    .map((r) => String(r.content ?? "").trim())
    .filter((c) => c.length > 0)
    .slice(0, MAX_REVIEWS);
  if (thoughts.length > 0) {
    parts.push("");
    parts.push("【用户自己的想法】");
    parts.push(thoughts.map((t, i) => `${i + 1}. ${t}`).join("\n"));
  }

  parts.push("");
  parts.push("请按约定的 JSON 格式输出。");
  return parts.join("\n");
}

type AnalysisPayload = {
  harvest?: string;
  remember?: string[];
  preference?: string;
  keywords?: string[];
};

/**
 * 分析一本书并写入 wr_analysis。
 * 水位线只在**成功写入后**推进，与同步引擎的计数写回是同一条原则。
 */
export async function analyzeBook(bookId: string): Promise<{
  bookId: string;
  title: string;
  keywords: string[];
  highlights: number;
}> {
  const db = admin();
  const cfg = llmConfig();

  const { data: book, error: bookErr } = await db
    .from("wr_books")
    .select("book_id, title, author, category")
    .eq("book_id", bookId)
    .maybeSingle();
  if (bookErr) throw new Error(`读取书籍失败：${bookErr.message}`);
  if (!book) throw new Error(`库里没有这本书：${bookId}`);

  const { data: hlRows, error: hlErr } = await db
    .from("wr_highlights")
    .select("mark_text")
    .eq("book_id", bookId)
    .order("create_time", { ascending: true })
    .limit(MAX_HIGHLIGHTS);
  if (hlErr) throw new Error(`读取划线失败：${hlErr.message}`);

  const highlights = (hlRows ?? [])
    .map((r) => String((r as Json).mark_text ?? "").trim())
    .filter((t) => t.length > 0);

  if (highlights.length === 0) {
    throw new Error("这本书还没有划线，无法分析");
  }

  const { data: reviewRows } = await db
    .from("wr_reviews")
    .select("content")
    .eq("book_id", bookId)
    .order("create_time", { ascending: true })
    .limit(MAX_REVIEWS);

  // 水位线以「库里真实存在的划线条数」为准，而不是本次送给模型的条数 ——
  // 否则超过 MAX_HIGHLIGHTS 的长书会永远算作"未分析"，每次同步都重算。
  const { count } = await db
    .from("wr_highlights")
    .select("bookmark_id", { count: "exact", head: true })
    .eq("book_id", bookId);

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: buildUserPrompt(book as Json, highlights, (reviewRows ?? []) as Json[]),
    },
  ];

  const payload = await chatJSON<AnalysisPayload>(messages, { maxTokens: 1200, temperature: 0.3 });

  const remember = Array.isArray(payload.remember)
    ? payload.remember.map((s) => String(s)).filter(Boolean).slice(0, 8)
    : [];
  const keywords = Array.isArray(payload.keywords)
    ? payload.keywords.map((s) => String(s)).filter(Boolean).slice(0, 12)
    : [];

  // remember / keywords 都是 text[]，直接存数组，不再做字符串拼接
  const { error: upErr } = await db.from("wr_analysis").upsert(
    {
      book_id: bookId,
      harvest: payload.harvest ? String(payload.harvest) : null,
      remember,
      preference: payload.preference ? String(payload.preference) : null,
      keywords,
      model: cfg.model,
      highlight_count_at_gen: count ?? highlights.length,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "book_id" },
  );
  if (upErr) throw new Error(`写入分析失败：${upErr.message}`);

  return {
    bookId,
    title: String((book as Json).title ?? ""),
    keywords,
    highlights: count ?? highlights.length,
  };
}
