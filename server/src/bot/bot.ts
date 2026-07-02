import { Bot, InlineKeyboard } from "grammy";
import type { CreateAlertArgs } from "../brain/schema";
import { runBrain } from "../brain/deepseek";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { CRYPTO, FOREX, INDIA, METALS, STOCKS, label, nameOf } from "../adapters/symbols";
import { createAlert, deleteAlert, listAlerts } from "../services/alert.service";
import { describeAlert, fmtPrice, money } from "../services/format";
import { getPrices } from "../services/price.service";
import { store, type Currency } from "../services/store";

// DEV bot: all LLM functions EXECUTE against an in-memory store (no DB/Redis yet).
type Turn = { role: "user" | "assistant"; content: string };
const windows = new Map<number, Turn[]>(); // rolling window (→ Redis later)
const MAX_TURNS = 6;
const pushTurn = (chatId: number, t: Turn) => {
  windows.set(chatId, [...(windows.get(chatId) ?? []), t].slice(-MAX_TURNS));
};

const START = `👋 Welcome to AlertEngine (dev build)

I watch asset prices and ping you when your condition hits. Just talk to me in plain English.

🔔 CREATE ALERTS  (thresholds in USD, window ≤ 24h)
 • "alert me when BTC goes above 70000"
 • "alert me if ETH drops 5% in 1h"

💰 GET PRICES — "what's SOL at?" · "prices of gold, oil and nifty"
💱 CURRENCY — "switch to INR" (display only: USD / EUR / INR)
📋 MANAGE — "show my alerts" → tap 🗑 to delete

📈 ASSETS
 • Crypto: BTC ETH SOL BNB XRP ADA DOGE LTC LINK DOT AVAX TRX TON
 • US stocks: Apple, Microsoft, Nvidia, Tesla, Google… (15)
 • Indian stocks: Reliance, TCS, HDFC Bank, Zomato, Swiggy, Paytm… (15)
 • NIFTY, OIL · price-only: gold, silver, USD↔EUR/INR/JPY/CNY/SGD

⌨️ /start · /help · /list · /price · /assets

⚠️ DEV MODE: alerts live in memory (reset on restart); watcher not running yet — alerts won't fire. Each reply shows the FUNCTION + INPUT the AI picked. Not financial advice.`;

const HELP = `📖 HOW TO USE ME EFFECTIVELY

🥇 The golden rule: put SYMBOL + CONDITION (+ TIMEFRAME for % alerts) in ONE message.

✅ GOOD — I'll act instantly:
 • "alert me when btc goes above 70000"
 • "eth drops 5% in 2 hours"
 • "btc < 55k"  (shorthand works: k, lakh, >, <)
 • "prices of gold, oil and nifty"
 • "apple price in inr"

❌ VAGUE — I'll have to ask follow-ups:
 • "alert me on bitcoin"  (no condition)
 • "eth drops 5%"  (no timeframe)
 • "apple at 10"  ($10 or 10%?)
 • "alert when it goes crazy"  (crazy = how many %, in how long?)

📏 MY RULES
 • Thresholds are in USD. "55k" = 55,000 · "1 lakh" = 100,000.
 • % alerts need a timeframe between 5 minutes and 24 hours.
 • Stocks & NIFTY are only evaluated during market hours; crypto is 24/7.
 • I create alerts I can verify: if your condition is ALREADY true, I'll flag it instead of firing instantly.
 • One alert per message — for a second one, I'll ask right after.
 • Alerts fire once, then auto-remove. Max lifetime 24h.
 • You can write in any language — Hinglish works fine.

⌨️ SLASH COMMANDS
 /start – intro & capabilities
 /help – this guide
 /list – your alerts, each with a 🗑 delete button
 /price – how to ask for prices
 /assets – everything I can watch

💬 Everything else — just say it in plain English.`;

const ASSETS = `📈 SUPPORTED ASSETS

🪙 Crypto (24/7, alerts + prices):
 ${CRYPTO.join(" · ")}

🏢 US stocks (US market hours, alerts + prices):
 ${STOCKS.map(nameOf).join(" · ")}

🇮🇳 Indian stocks (NSE hours, alerts + prices):
 ${INDIA.map(nameOf).join(" · ")}

📊 Index: Nifty 50 · 🛢 Commodity: Crude Oil

🥇 Metals (prices only): ${METALS.join(" · ")}
💱 Forex (prices only): ${FOREX.join(" · ")}

All prices/thresholds in USD (display in USD/EUR/INR via "switch to …").`;

async function renderList(chatId: number): Promise<{ text: string; keyboard?: InlineKeyboard }> {
  const alerts = listAlerts(chatId);
  if (alerts.length === 0) return { text: '📋 No active alerts. Try "alert me if BTC drops 5% in 1h".' };
  const kb = new InlineKeyboard();
  for (const a of alerts) kb.text(`🗑 Delete #${a.id}`, `del:${a.id}`).row();
  return { text: "📋 Your alerts:\n" + alerts.map((a) => `• ${describeAlert(a)}`).join("\n"), keyboard: kb };
}

// Execute a validated brain action. Returns the text to append to the AI's message.
async function execute(
  chatId: number,
  name: string,
  args: Record<string, unknown>,
): Promise<{ text: string; keyboard?: InlineKeyboard }> {
  switch (name) {
    case "get_price": {
      const cur = (args.currency as Currency) ?? store.getCurrency(chatId);
      const prices = await getPrices((args.symbols as string[]) ?? []);
      const lines = await Promise.all(
        prices.map(async (p) => (p.price != null ? `• ${label(p.symbol)}: ${await money(p.price, p.symbol, cur)}` : `• ${label(p.symbol)}: unavailable`)),
      );
      return { text: lines.join("\n") };
    }
    case "create_alert": {
      const res = await createAlert(chatId, args as unknown as CreateAlertArgs);
      if (!res.ok) return { text: `⚠️ Not created — ${res.reason}.` };
      const note = res.note ? `\nℹ️ ${res.note}` : "";
      return { text: `✅ Created ${describeAlert(res.alert)}\n(current: ${fmtPrice(res.current, res.alert.condition.symbol)})${note}` };
    }
    case "change_currency": {
      store.setCurrency(chatId, args.currency as Currency);
      return { text: `💱 Display currency is now ${args.currency}. (Alert thresholds stay in USD.)` };
    }
    case "list_alerts":
      return renderList(chatId);
    default:
      return { text: "" };
  }
}

export function createBot() {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN as string);

  bot.command("start", (ctx) => ctx.reply(START));
  bot.command("help", (ctx) => ctx.reply(HELP));
  bot.command("assets", (ctx) => ctx.reply(ASSETS));
  bot.command("list", async (ctx) => {
    const { text, keyboard } = await renderList(ctx.chat.id);
    await ctx.reply(text, { reply_markup: keyboard });
  });
  bot.command("price", (ctx) => ctx.reply('💰 Just ask, e.g. "what\'s BTC?" or "prices of gold and oil".'));

  // 🗑 button taps — deterministic, no LLM (state rides in callback_data)
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data.startsWith("del:")) {
      const id = Number(data.slice(4));
      const ok = deleteAlert(ctx.chat!.id, id);
      await ctx.answerCallbackQuery({ text: ok ? `Deleted #${id}` : `#${id} not found` });
      const { text, keyboard } = await renderList(ctx.chat!.id);
      await ctx.editMessageText(text, { reply_markup: keyboard });
      return;
    }
    await ctx.answerCallbackQuery();
  });

  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text;

    const r = await runBrain(text, { currency: store.getCurrency(chatId), history: windows.get(chatId) ?? [] });
    logger.info(
      `chat ${chatId} | "${text}" -> ${r.action.name ?? "none"}` +
        (r.action.name ? ` ${JSON.stringify(r.action.args)}` : ""),
    );

    let extra = "";
    let keyboard: InlineKeyboard | undefined;
    if (r.action.name) {
      try {
        const out = await execute(chatId, r.action.name, r.action.args);
        extra = out.text ? `\n\n${out.text}` : "";
        keyboard = out.keyboard;
      } catch (e) {
        extra = `\n\n⚠️ Couldn't complete that: ${(e as Error).message}`;
      }
    }

    // memory includes what the SYSTEM did (rejections, prices) so "yes"-style follow-ups work
    pushTurn(chatId, { role: "user", content: text });
    pushTurn(chatId, { role: "assistant", content: `${r.message}${extra}` });

    const dev = r.action.name
      ? `🔧 [dev] ${r.action.name} ${JSON.stringify(r.action.args)}`
      : "🔧 [dev] (none — chat / clarify / refusal)";
    await ctx.reply(`${r.message}${extra}\n\n━━━━━━━━━━━━━━\n${dev}`, { reply_markup: keyboard });
  });

  bot.catch((err) => logger.error("bot error:", err.error));
  return bot;
}

export async function startBot() {
  const bot = createBot();
  await bot.api.setMyCommands([
    { command: "start", description: "What I can do" },
    { command: "help", description: "How to use me effectively" },
    { command: "list", description: "My alerts (with delete buttons)" },
    { command: "price", description: "Get a price" },
    { command: "assets", description: "Everything I can watch" },
  ]);
  logger.info("Telegram bot starting (long-polling, dev)…");
  await bot.start({ onStart: (info) => logger.info(`Bot @${info.username} is live.`) });
}
