import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser } from "../_lib/auth";
import { describeError, fail, json } from "../_lib/http";
import { analyzeBook, analyzableBookIds, analysisCandidates } from "../_lib/analysis";
import { llmConfig } from "../_lib/llm";

/**
 * POST /api/analysis/run
 *
 * AI 分析入口。逐本把「划线 + 想法」交给 OpenAI 兼容接口，产出
 * harvest / remember / preference / keywords 并写入 wr_analysis。
 *
 * 请求体（全部可选）：
 *   limit    本次最多分析几本，默认 3，上限 8
 *   bookIds  只分析指定的书（重试失败书目时用）
 *   force    忽略水位线，强制重算
 *
 * 为什么默认只做 3 本：一次模型调用要几秒到几十秒，Vercel 函数有硬时限
 * （vercel.json 里设的 60s）。逐本串行 + 限流，比一次塞十本然后整批超时更可靠。
 * 前端按这个接口循环调用即可。
 *
 * 未配置模型时（没有 OPENAI_API_KEY）：返回 enabled:false 并附上按水位线
 * 算出的待分析书目，不调用任何模型、不改动任何数据。
 */

export const config = { maxDuration: 60 };

const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 8;

type Body = {
  limit?: number;
  bookIds?: string[];
  book_ids?: string[];
  force?: boolean;
  /** 干跑：只回状态与待办数量，不调模型（limit: 0 等效） */
  dryRun?: boolean;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    fail(res, 405, "只支持 POST");
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  try {
    const raw =
      typeof req.body === "string"
        ? (JSON.parse(req.body || "{}") as Body)
        : ((req.body ?? {}) as Body);

    const cfg = llmConfig();
    const provider = (process.env.ANALYSIS_PROVIDER ?? "").trim().toLowerCase();

    // 没有 Key 就是没开通，不管 ANALYSIS_PROVIDER 写了什么
    const enabled = cfg.configured && provider !== "none";

    if (!enabled) {
      const candidates = await analysisCandidates();
      json(res, 200, {
        ok: true,
        enabled: false,
        ran: false,
        candidates,
        message: cfg.configured
          ? "ANALYSIS_PROVIDER=none，AI 分析已被显式关闭。以下是待分析书目，本次未调用模型。"
          : "未配置 OPENAI_API_KEY，AI 分析未启用。以下是按水位线算出的待分析书目，本次未调用任何模型、未改动任何数据。",
      });
      return;
    }

    const candidates = await analysisCandidates();
    const requested = raw.bookIds ?? raw.book_ids;
    const force = raw.force === true;
    // 干跑：只回状态与待办数量，不调模型。前端用它渲染面板初始态。
    const dryRun = raw.dryRun === true || Number(raw.limit) === 0;
    const limit = clamp(Number(raw.limit) || DEFAULT_LIMIT, 1, MAX_LIMIT);

    if (dryRun) {
      json(res, 200, {
        ok: true,
        enabled: true,
        ran: false,
        dryRun: true,
        provider: provider || "openai",
        model: cfg.model,
        candidates,
        pending: candidates.length,
        done: candidates.length === 0,
        message:
          candidates.length === 0
            ? "所有有划线的书都已按当前划线数生成过分析。"
            : `有 ${candidates.length} 本待分析。`,
      });
      return;
    }

    // 队列优先级：显式指定书目 > 强制全量 > 水位线候选
    let queue: string[];
    if (Array.isArray(requested) && requested.length > 0) {
      queue = requested.map(String);
    } else if (force) {
      queue = await analyzableBookIds();
    } else {
      queue = candidates.map((c) => c.bookId);
    }

    const targets = queue.slice(0, limit);
    const results: Array<Record<string, unknown>> = [];
    const failed: Array<{ bookId: string; error: string }> = [];

    for (const bookId of targets) {
      try {
        const r = await analyzeBook(bookId);
        results.push({
          bookId: r.bookId,
          title: r.title,
          keywords: r.keywords,
          highlights: r.highlights,
        });
      } catch (e) {
        // 单本失败不影响其余：失败书的 highlight_count_at_gen 未推进，
        // 下次仍会被水位线判为"待分析"，自然重试。
        failed.push({ bookId, error: describeError(e) });
        console.error(`[analysis/run] book=${bookId}`, describeError(e));
      }
    }

    const remaining = Math.max(0, queue.length - targets.length);

    json(res, 200, {
      ok: true,
      enabled: true,
      ran: results.length > 0,
      provider: provider || "openai",
      model: cfg.model,
      pendingBefore: candidates.length,
      forced: force,
      analyzedCount: results.length,
      results,
      failed,
      remaining,
      done: remaining === 0,
      message:
        targets.length === 0
          ? "没有需要分析的书 —— 所有有划线的书都已按当前划线数生成过分析。"
          : `本次分析 ${results.length} 本${failed.length > 0 ? `，失败 ${failed.length} 本` : ""}，剩余 ${remaining} 本。`,
    });
  } catch (e) {
    console.error("[analysis/run]", describeError(e));
    fail(res, 500, describeError(e));
  }
}
