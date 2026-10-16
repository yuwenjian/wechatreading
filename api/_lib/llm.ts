/**
 * 大模型调用（仅服务端可用）
 *
 * 走「OpenAI 兼容」协议 —— 只要对方提供 /chat/completions 就能用：
 *   · OpenAI       OPENAI_BASE_URL=https://api.openai.com/v1
 *   · DeepSeek     OPENAI_BASE_URL=https://api.deepseek.com/v1   model=deepseek-chat
 *   · 阿里通义      OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
 *   · 智谱 / Moonshot / Groq / 本地 vLLM 等同理
 *
 * 一个实测过的坑：response_format={"type":"json_object"} 并非所有兼容网关都支持，
 * 有的直接 400。所以这里的策略是「先带、被拒再退回」——见 chatJSON。
 */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type LlmConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  configured: boolean;
};

export function llmConfig(): LlmConfig {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  const baseUrl = (process.env.OPENAI_BASE_URL ?? "").trim() || "https://api.openai.com/v1";
  const model = (process.env.OPENAI_MODEL ?? "").trim() || "gpt-4o-mini";

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model,
    configured: apiKey.length > 0,
  };
}

export class LlmError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "LlmError";
    this.status = status;
  }
}

/** 剥掉模型爱加的 ```json 围栏，并裁到最外层花括号 */
function extractJson(text: string): string {
  let s = text.trim();

  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) s = fence[1].trim();

  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);

  return s;
}

type CallOptions = {
  /** 超时毫秒数。默认 60s —— 受 Vercel 函数 maxDuration 约束，见 handler 里的 config */
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

async function requestOnce(
  cfg: LlmConfig,
  messages: ChatMessage[],
  jsonMode: boolean,
  opts: CallOptions,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);

  try {
    // 阿里系兼容网关（dashscope / 阿里云 MaaS）的 qwen 系模型默认开启思考模式：
    // 先长篇推理再作答，长输出时在 serverless 60s 预算内极易超时，显式关掉。
    // 该参数是阿里私有扩展，只发往阿里网关，不影响 OpenAI 等其他方。
    const noThinking = /aliyuncs\.com|dashscope/.test(cfg.baseUrl)
      ? { enable_thinking: false }
      : {};

    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 1200,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        ...noThinking,
      }),
      signal: controller.signal,
    });

    const text = await res.text();

    if (!res.ok) {
      throw new LlmError(`模型接口返回 HTTP ${res.status}：${text.slice(0, 300)}`, res.status);
    }

    let parsed: ChatCompletionResponse;
    try {
      parsed = JSON.parse(text) as ChatCompletionResponse;
    } catch {
      throw new LlmError(`模型接口返回的不是 JSON：${text.slice(0, 200)}`);
    }

    const content = parsed.choices?.[0]?.message?.content;
    if (!content) {
      throw new LlmError(parsed.error?.message ?? "模型没有返回内容");
    }
    return content;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new LlmError("模型调用超时");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 调一次模型并解析成 JSON。
 *
 * 「先带 json 模式、被拒再退回」：如果网关因为 response_format 报了 4xx，
 * 我们去掉它重试一次 —— 这样既拿到了支持方的好处，又不被不支持方卡死。
 */
export async function chatJSON<T>(messages: ChatMessage[], opts: CallOptions = {}): Promise<T> {
  const cfg = llmConfig();
  if (!cfg.configured) {
    throw new LlmError("未配置 OPENAI_API_KEY，无法调用模型");
  }

  let content: string;
  try {
    content = await requestOnce(cfg, messages, true, opts);
  } catch (e) {
    const rejected =
      e instanceof LlmError && e.status !== undefined && e.status >= 400 && e.status < 500;
    if (!rejected) throw e;
    // 网关不吃 response_format，退回纯提示词约束
    content = await requestOnce(cfg, messages, false, opts);
  }

  try {
    return JSON.parse(extractJson(content)) as T;
  } catch {
    throw new LlmError(`模型输出无法解析为 JSON：${content.slice(0, 200)}`);
  }
}
