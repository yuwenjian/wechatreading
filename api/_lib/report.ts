/**
 * 周期阅读报告（服务端）
 *
 * 数据来源说明：
 *   网关的 /readdata/detail 只开放 mode=overall，拿不到「某周/某月」的
 *   阅读时长明细，所以周期统计只能基于有精确时间戳的数据 ——
 *   即划线（wr_highlights.create_time）与想法（wr_reviews.create_time）。
 *   「这段时间读了哪些书」也就定义为「这段时间留下过笔记的书」。
 *
 * 时区约定：
 *   create_time 是 Unix 秒，周期边界由前端按浏览器本地时区算好后
 *   以 startTs/endTs 传进来，服务端不做任何本地时区换算
 *   （Vercel 函数跑在 UTC，自己算周一会偏 8 小时）。
 */

import { admin } from "./supabaseAdmin.js";
import { chatJSON, llmConfig } from "./llm.js";

type Json = Record<string, any>;

// ── 类型 ────────────────────────────────────────────────────────────────────

export type PeriodType = "week" | "month" | "year";

export type ReportContent = {
  /** 本期总览，2~4 句 */
  overview: string;
  /** 节奏观察：活跃天数、连续性、高峰期，1~3 句 */
  rhythm: string;
  /** 本期关注的主题，2~4 个 */
  themes: { title: string; note: string }[];
  /** 精选笔记，2~4 条 */
  picks: { book: string; excerpt: string; why: string }[];
  /** 给下个周期的建议，1~2 句 */
  suggestion: string;
};

type NoteRow = {
  id: string;
  kind: "mark" | "thought";
  book_id: string;
  chapter_title: string | null;
  text: string;
  /** 想法特有的被点评原文 */
  abstract?: string;
  create_time: number;
};

export type PeriodData = {
  marks: NoteRow[];
  thoughts: NoteRow[];
  books: Map<string, { title: string; author: string | null }>;
  /** 有笔记的天数 */
  activeDays: number;
  /** 每天笔记总数，下标 0 = 周期第一天 */
  daily: number[];
};

// ── 聚合 ────────────────────────────────────────────────────────────────────

/** 从库里取周期内的划线 + 想法，并补上书名/作者 */
export async function fetchPeriodData(
  startTs: number,
  endTs: number,
  dayCount: number,
): Promise<PeriodData> {
  const db = admin();

  const [hl, rv] = await Promise.all([
    db
      .from("wr_highlights")
      .select("bookmark_id, book_id, chapter_title, mark_text, create_time")
      .gte("create_time", startTs)
      .lt("create_time", endTs)
      .order("create_time", { ascending: true }),
    db
      .from("wr_reviews")
      .select("review_id, book_id, chapter_title, content, abstract, create_time")
      .gte("create_time", startTs)
      .lt("create_time", endTs)
      .order("create_time", { ascending: true }),
  ]);
  if (hl.error) throw new Error(`读取周期划线失败：${hl.error.message}`);
  if (rv.error) throw new Error(`读取周期想法失败：${rv.error.message}`);

  const marks: NoteRow[] = (hl.data ?? []).map((r: Json) => ({
    id: r.bookmark_id,
    kind: "mark",
    book_id: r.book_id,
    chapter_title: r.chapter_title ?? null,
    text: r.mark_text ?? "",
    create_time: Number(r.create_time ?? 0),
  }));
  const thoughts: NoteRow[] = (rv.data ?? []).map((r: Json) => ({
    id: r.review_id,
    kind: "thought",
    book_id: r.book_id,
    chapter_title: r.chapter_title ?? null,
    text: r.content ?? "",
    abstract: r.abstract ?? "",
    create_time: Number(r.create_time ?? 0),
  }));

  const bookIds = [...new Set([...marks, ...thoughts].map((n) => n.book_id))];
  const books = new Map<string, { title: string; author: string | null }>();
  if (bookIds.length > 0) {
    const { data, error } = await db
      .from("wr_books")
      .select("book_id, title, author")
      .in("book_id", bookIds);
    if (error) throw new Error(`读取书籍信息失败：${error.message}`);
    for (const b of data ?? []) {
      books.set(b.book_id, { title: b.title ?? "（无标题）", author: b.author ?? null });
    }
  }

  // 活跃天：按「周期第几天」分桶。天数桶用秒差近似即可——
  // 同一时区下就算跨夏令时，误差也不会让笔记落到错误的相邻桶里影响统计结论。
  const daily = new Array<number>(dayCount).fill(0);
  const days = new Set<number>();
  for (const n of [...marks, ...thoughts]) {
    const idx = Math.floor((n.create_time - startTs) / 86400);
    if (idx >= 0 && idx < dayCount) {
      daily[idx] += 1;
      days.add(idx);
    }
  }

  return { marks, thoughts, books, activeDays: days.size, daily };
}

// ── 提示词 ──────────────────────────────────────────────────────────────────

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** 年度场景：把 365 个日桶按日历月压成 12 个数（天数用 UTC 取，与时区无关） */
function dailyToMonthly(daily: number[], year: number): number[] {
  const out = new Array<number>(12).fill(0);
  let idx = 0;
  for (let m = 0; m < 12; m++) {
    const dim = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
    for (let d = 0; d < dim && idx < daily.length; d++, idx++) out[m] += daily[idx];
  }
  return out;
}

function buildPrompt(
  type: PeriodType,
  label: string,
  data: PeriodData,
  monthly?: number[],
): { role: "system" | "user"; content: string }[] {
  const typeCN = type === "week" ? "周" : type === "month" ? "月" : "年";
  const total = data.marks.length + data.thoughts.length;

  // 书单：按周期内笔记数降序
  const perBook = new Map<string, number>();
  for (const n of [...data.marks, ...data.thoughts]) {
    perBook.set(n.book_id, (perBook.get(n.book_id) ?? 0) + 1);
  }
  const bookLines = [...perBook.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => {
      const b = data.books.get(id);
      return `· 《${b?.title ?? id}》${b?.author ? `（${b.author}）` : ""}：${count} 条笔记`;
    })
    .join("\n");

  // 笔记样本：想法全给（含被点评原文），划线每书最多 8 条，单条截断 —
  // 月报笔记多时控制 token；样本外剩余只报数量
  const thoughtLines = data.thoughts.map((n) => {
    const b = data.books.get(n.book_id);
    return `· 【想法】《${b?.title ?? ""}》：${clip(n.text, 150)}${n.abstract ? `（原文：${clip(n.abstract, 100)}）` : ""}`;
  });
  const markCountByBook = new Map<string, number>();
  const markLines: string[] = [];
  for (const n of data.marks) {
    const c = markCountByBook.get(n.book_id) ?? 0;
    markCountByBook.set(n.book_id, c + 1);
    if (c >= 8) continue;
    const b = data.books.get(n.book_id);
    markLines.push(`· 【划线】《${b?.title ?? ""}》${n.chapter_title ? `·${n.chapter_title}` : ""}：${clip(n.text, 120)}`);
  }

  const distribution =
    type === "year" && monthly
      ? `【每月笔记数】${monthly.join(", ")}（1月 ~ 12月）`
      : `【每日笔记数】${data.daily.join(", ")}（从周期第一天起）`;

  const user = [
    `这是我的${typeCN}度阅读数据（${label}），请据此生成一份${typeCN}度阅读报告。`,
    "",
    `【概览】新增划线 ${data.marks.length} 条、想法 ${data.thoughts.length} 条，共 ${total} 条；有笔记活跃 ${data.activeDays} 天；涉及 ${perBook.size} 本书。`,
    distribution,
    "",
    "【书目】",
    bookLines || "（无）",
    "",
    "【笔记样本】",
    [...thoughtLines, ...markLines].join("\n") || "（无）",
  ].join("\n");

  const system = [
    "你是一位敏锐而克制的阅读教练，为读者写周度/月度/年度阅读报告。",
    "要求：",
    "1. 只依据给出的数据说话，不编造没出现的书或观点；",
    "2. 语言自然、具体，像写给读者本人的私信，避免套话和排比堆砌；",
    "3. 输出严格为 JSON 对象，字段如下：",
    '{',
    '  "overview": "本期总览，2~4 句：读了什么、量怎么样、一句话点出这期最鲜明的特点",',
    `  "rhythm": "节奏观察，1~3 句：活跃天数、连续还是突击、高峰出现在哪${type === "year" ? "个月" : "一天"}",`,
    '  "themes": [{"title": "主题名（4~8字）", "note": "这个主题下你实际划了什么/想了什么，1~2 句"}],',
    '  "picks": [{"book": "书名", "excerpt": "从样本中原文摘录的一句", "why": "为什么值得回看，1 句"}],',
    '  "suggestion": "给下个周期的具体建议，1~2 句，要落到行动"',
    "}",
    "themes 取 2~4 个，picks 取 2~4 条（excerpt 必须是样本里真实出现的原文）；样本太少时就少取，不要硬凑。",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// ── 生成 + 缓存 ─────────────────────────────────────────────────────────────

export type GenerateResult = {
  report: ReportContent;
  cached: boolean;
  model?: string;
  noteCount: number;
  generatedAt: string;
};

/**
 * 生成（或取缓存的）周期报告。
 * 水位线：缓存的 note_count 与当前周期笔记数一致且未要求 force 时，直接回缓存。
 */
export async function generateReport(opts: {
  type: PeriodType;
  startDate: string; // YYYY-MM-DD，仅作库主键与展示
  label: string; // 展示用周期文案，如「10月12日 – 10月18日」
  startTs: number;
  endTs: number;
  dayCount: number;
  force?: boolean;
}): Promise<GenerateResult> {
  const db = admin();
  const data = await fetchPeriodData(opts.startTs, opts.endTs, opts.dayCount);
  const noteCount = data.marks.length + data.thoughts.length;

  if (!opts.force) {
    const { data: existing } = await db
      .from("wr_reports")
      .select("content, model, note_count, generated_at")
      .eq("period_type", opts.type)
      .eq("period_start", opts.startDate)
      .maybeSingle();
    if (existing && Number(existing.note_count) === noteCount) {
      return {
        report: existing.content as ReportContent,
        cached: true,
        model: existing.model ?? undefined,
        noteCount,
        generatedAt: existing.generated_at,
      };
    }
  }

  const monthly =
    opts.type === "year"
      ? dailyToMonthly(data.daily, Number(opts.startDate.slice(0, 4)))
      : undefined;
  const messages = buildPrompt(opts.type, opts.label, data, monthly);
  const report = await chatJSON<ReportContent>(messages, {
    maxTokens: 2000,
    temperature: 0.4,
  });

  const generatedAt = new Date().toISOString();
  const { error } = await db.from("wr_reports").upsert(
    {
      period_type: opts.type,
      period_start: opts.startDate,
      content: report,
      model: llmConfig().model,
      note_count: noteCount,
      generated_at: generatedAt,
    },
    { onConflict: "period_type,period_start" },
  );
  if (error) throw new Error(`写入报告缓存失败：${error.message}`);

  return { report, cached: false, model: llmConfig().model, noteCount, generatedAt };
}
