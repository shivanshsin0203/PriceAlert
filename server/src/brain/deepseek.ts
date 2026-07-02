import OpenAI from "openai";
import { ALERTABLE, PRICEABLE } from "../adapters/symbols";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { buildSystemPrompt } from "./prompt";
import { Envelope, validateArgs, windowMinutes } from "./schema";

type Turn = { role: "user" | "assistant"; content: string };

export type BrainResult = {
  message: string;
  action: { name: string | null; args: Record<string, unknown> };
};

// Used ONLY when the model/API itself fails (bad JSON, timeout) — not for normal clarifies.
const CLARIFY: BrainResult = {
  message:
    'Something went wrong on my side processing that — mind rephrasing?\nI can: create alerts ("BTC above 70k", "ETH drops 5% in 1h"), get prices ("what\'s gold?"), list alerts, or change currency.',
  action: { name: null, args: {} },
};

// DeepSeek is OpenAI-compatible → use the OpenAI SDK (gives retries + timeouts for free).
const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: env.DEEPSEEK_API_KEY,
  maxRetries: 2,
  timeout: 20_000,
});

export async function runBrain(
  userText: string,
  opts: { currency: string; history?: Turn[] },
): Promise<BrainResult> {
  const messages = [
    { role: "system" as const, content: buildSystemPrompt(opts.currency) },
    ...(opts.history ?? []),
    { role: "user" as const, content: userText },
  ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

  let content: string;
  try {
    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      messages,
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    content = completion.choices[0]?.message?.content ?? "";
  } catch (e) {
    logger.error("brain call failed:", (e as Error).message);
    return CLARIFY;
  }

  const parsed = Envelope.safeParse(safeJson(content));
  if (!parsed.success) return CLARIFY;
  const out = parsed.data;

  if (out.action.name) {
    const res = validateArgs(out.action.name, out.action.args);
    if (!res || !res.success) {
      // known case: get_price with a mix of supported + unsupported symbols -> keep the supported ones
      if (out.action.name === "get_price") {
        const raw = (out.action.args as { symbols?: unknown }).symbols;
        const supported = Array.isArray(raw) ? raw.filter((s) => typeof s === "string" && PRICEABLE.includes(s)) : [];
        if (supported.length > 0) {
          const cur = (out.action.args as { currency?: unknown }).currency;
          const args: Record<string, unknown> = { symbols: supported };
          if (cur === "USD" || cur === "EUR" || cur === "INR") args.currency = cur;
          const unsupported = Array.isArray(raw) ? raw.filter((s) => !supported.includes(s as string)) : [];
          return {
            message: `${out.message}${unsupported.length ? ` (${unsupported.join(", ")} isn't supported yet — showing the rest.)` : ""}`,
            action: { name: "get_price", args },
          };
        }
      }
      // known case: alert requested on a price-only asset
      const raw = out.action.args as { symbol?: unknown; condition?: { symbol?: unknown } };
      const sym = typeof raw?.symbol === "string" ? raw.symbol : raw?.condition?.symbol;
      if (
        out.action.name === "create_alert" &&
        typeof sym === "string" &&
        PRICEABLE.includes(sym) &&
        !ALERTABLE.includes(sym)
      ) {
        return {
          message: `${sym} supports price checks only — alerts aren't available for metals/forex yet. I can alert on crypto, US stocks, NIFTY or OIL instead.`,
          action: { name: null, args: {} },
        };
      }
      return CLARIFY;
    }
    const data = res.data as Record<string, unknown>;

    if (
      out.action.name === "create_alert" &&
      data.kind === "pct_change" &&
      windowMinutes(data.window as { value: number; unit: "m" | "h" | "d" }) > 1440
    ) {
      return {
        message: 'Alerts can watch at most a 24-hour window. Try e.g. "5% in 1h" or "5% in a day".',
        action: { name: null, args: {} },
      };
    }

    return { message: out.message, action: { name: out.action.name, args: data } };
  }

  return { message: out.message, action: { name: null, args: {} } };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
