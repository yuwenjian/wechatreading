import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser } from "../_lib/auth.js";
import { describeError, fail, json } from "../_lib/http.js";
import { llmConfig } from "../_lib/llm.js";
import { generateReport, type PeriodType } from "../_lib/report.js";

/**
 * POST /api/report/generate
 *
 * 生成（或取缓存的）周度/月度 AI 阅读报告。
 *
 * 请求体：
 *   type      "week" | "month"
 *   startDate "YYYY-MM-DD" —— 周期第一天，作库主键（周=周一，月=1号）
 *   label     展示用周期文案，如「10月12日 – 10月18日」
 *   startTs   周期起点的 Unix 秒（前端按本地时区算好，服务端不换算时区）
 *   endTs     周期终点（不含）
 *   dayCount  周期天数（7 或当月天数）
 *   force     忽略缓存水位线，强制重算
 */
export const config = { maxDuration: 60 };

type Body = {
  type?: PeriodType;
  startDate?: string;
  label?: string;
  startTs?: number;
  endTs?: number;
  dayCount?: number;
  force?: boolean;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    fail(res, 405, "只支持 POST");
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  if (!llmConfig().configured) {
    fail(res, 503, "未配置 OPENAI_API_KEY，AI 报告未启用");
    return;
  }

  try {
    const raw =
      typeof req.body === "string"
        ? (JSON.parse(req.body || "{}") as Body)
        : ((req.body ?? {}) as Body);

    const type = raw.type;
    const startDate = String(raw.startDate ?? "").trim();
    const startTs = Number(raw.startTs);
    const endTs = Number(raw.endTs);
    const dayCount = Number(raw.dayCount);

    if (type !== "week" && type !== "month" && type !== "year") {
      fail(res, 400, "type 必须是 week、month 或 year");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      fail(res, 400, "startDate 必须是 YYYY-MM-DD");
      return;
    }
    if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs <= startTs) {
      fail(res, 400, "周期时间戳不合法");
      return;
    }
    if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > 366) {
      fail(res, 400, "dayCount 不合法");
      return;
    }

    const result = await generateReport({
      type,
      startDate,
      label: String(raw.label ?? startDate),
      startTs,
      endTs,
      dayCount,
      force: raw.force === true,
    });

    json(res, 200, { ok: true, ...result });
  } catch (e) {
    console.error("[report/generate]", describeError(e));
    fail(res, 500, describeError(e));
  }
}
