import { Bot, InlineKeyboard } from "grammy";
import type { Condition } from "../brain/schema";
import { runBrain } from "../brain/deepseek";
import { env } from "../config/env";
import { plog } from "../lib/logger";
import { CRYPTO, FOREX, INDIA, METALS, STOCKS, label, nameOf } from "../adapters/symbols";
import { getHistory, pushTurn } from "../cache/chat";
import { findOrCreateByChatId, setCurrency, type BotUser } from "../models/users.repo";
import { createAlert, deleteAlert, listAlerts } from "../services/alert.service";
import { describeAlert, fmtPrice, money, type Currency } from "../services/format";
import { getPrices } from "../services/price.service";
import { consumeLinkToken, maskEmail, unlinkByChat } from "../services/telegram-link.service";

// DEV bot (long-polling). Alerts now persist in Postgres, are mirrored to Redis,
// and the watcher fires them for real. Every failure path replies something useful.

const START = `👋 Welcome to PriceAlert (dev build)

I watch asset prices and ping you when your condition hits. Just talk to me in plain English.

🔔 CREATE ALERTS  (thresholds in USD, window ≤ 24h)
 • "alert me when BTC goes above 70000"
 • "alert me if ETH drops 5% in 1h"
 • bulk works too: "alert me if top 6 crypto rise 5% in 1h"

💰 GET PRICES — "what's SOL at?" · "prices of gold, oil and nifty"
💱 CURRENCY — "switch to INR" (display only: USD / EUR / INR)
📋 MANAGE — "show my alerts" → tap 🗑 to delete

📈 ASSETS
 • Crypto: BTC ETH SOL BNB XRP ADA DOGE LTC LINK DOT AVAX TRX TON
 • US stocks: Apple, Microsoft, Nvidia, Tesla, Google… (15)
 • Indian stocks: Reliance, TCS, HDFC Bank, Zomato, Swiggy, Paytm… (15)
 • NIFTY, OIL · price-only: gold, silver, USD↔EUR/INR/JPY/CNY/SGD

⌨️ /start · /help · /list · /price · /assets · /unlink

⚠️ DEV BUILD: alerts are saved and WILL fire — I check prices every minute and ping you here. Each reply shows the FUNCTION + INPUT the AI picked. Not financial advice.`;

const HELP = `📖 HOW TO USE ME EFFECTIVELY

🥇 The golden rule: put SYMBOL + CONDITION (+ TIMEFRAME for % alerts) in ONE message.

✅ GOOD — I'll act instantly:
 • "alert me when btc goes above 70000"
 • "eth drops 5% in 2 hours"
 • "btc < 55k"  (shorthand works: k, lakh, >, <)
 • "alert me if top 6 crypto rise 5% in 1h"  (bulk: up to 15 at once)
 • "prices of gold, oil and nifty"

❌ VAGUE — I'll have to ask follow-ups:
 • "alert me on bitcoin"  (no condition)
 • "eth drops 5%"  (no timeframe)
 • "apple at 10"  ($10 or 10%?)
 • "alert when it goes crazy"  (crazy = how many %, in how long?)

📏 MY RULES
 • Thresholds are in USD. "55k" = 55,000 · "1 lakh" = 100,000. (Indian stocks & NIFTY are in ₹.)
 • % alerts need a timeframe between 5 minutes and 24 hours.
 • Stocks & NIFTY are only evaluated during market hours; crypto is 24/7.
 • I create alerts I can verify: if your condition is ALREADY true, I'll flag it instead of firing instantly.
 • Alerts fire once, then they're done. Max lifetime 24h — if the window ends without firing, I'll tell you that too.
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

const DB_TROUBLE =
  "⚠️ I'm having trouble reaching my database right now — nothing was changed. Please try again in a moment.";

// chatId → user, with a friendly failure mode
async function resolveUser(chatId: number, username?: string): Promise<BotUser | null> {
  try {
    return await findOrCreateByChatId(chatId, username);
  } catch (e) {
    plog.error(`bot: user resolution failed for chat ${chatId} — ${(e as Error).message}`);
    return null;
  }
}

async function renderList(user: BotUser): Promise<{ text: string; keyboard?: InlineKeyboard }> {
  const alerts = await listAlerts(user.userId);
  if (alerts.length === 0) return { text: '📋 No active alerts. Try "alert me if BTC drops 5% in 1h".' };
  const kb = new InlineKeyboard();
  alerts.forEach((a, i) => kb.text(`🗑 Delete #${i + 1}`, `del:${a.id}`).row());
  return {
    text: "📋 Your alerts:\n" + alerts.map((a, i) => `• ${describeAlert(a, i + 1)}`).join("\n"),
    keyboard: kb,
  };
}

// Execute a validated brain action. Returns the text to append to the AI's message.
async function execute(
  user: BotUser,
  name: string,
  args: Record<string, unknown>,
): Promise<{ text: string; keyboard?: InlineKeyboard }> {
  switch (name) {
    case "get_price": {
      const cur = (args.currency as Currency) ?? user.currency;
      const prices = await getPrices((args.symbols as string[]) ?? []);
      const lines = await Promise.all(
        prices.map(async (p) =>
          p.price != null
            ? `• ${label(p.symbol)}: ${await money(p.price, p.symbol, cur)}`
            : `• ${label(p.symbol)}: unavailable right now — try again shortly`,
        ),
      );
      return { text: lines.join("\n") };
    }
    case "create_alert": {
      // bulk-capable: up to 15 alerts per message, each validated + persisted independently
      const conds = (args as unknown as { alerts: Condition[] }).alerts;
      const results = await Promise.all(conds.map((c) => createAlert(user, c)));
      const lines = results.map((res, i) =>
        res.ok
          ? `✅ ${describeAlert(res.alert)} · now ${fmtPrice(res.current, conds[i].symbol)}${res.note ? `\n   ℹ️ ${res.note}` : ""}`
          : `⚠️ ${nameOf(conds[i].symbol)}: not created — ${res.reason}.`,
      );
      return { text: lines.join("\n") };
    }
    case "change_currency": {
      await setCurrency(user, args.currency as Currency);
      return { text: `💱 Display currency is now ${args.currency}. (Alert thresholds stay in USD.)` };
    }
    case "list_alerts":
      return renderList(user);
    default:
      return { text: "" };
  }
}

export function createBot() {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  // /start <token> = the dashboard's deep-link account binding (§13); bare /start = intro.
  bot.command("start", async (ctx) => {
    const token = ctx.match.trim();
    if (!token) return void (await ctx.reply(START));
    try {
      const r = await consumeLinkToken(token, ctx.chat.id, ctx.from?.username);
      if (!r.ok) return void (await ctx.reply(`⚠️ Couldn't link this Telegram: ${r.reason}`));
      if (r.already) {
        return void (await ctx.reply(`✅ This Telegram is already connected to ${maskEmail(r.email)}.`));
      }
      const merged = r.mergedAlerts > 0 ? `\n📦 ${r.mergedAlerts} existing alert${r.mergedAlerts === 1 ? "" : "s"} from this chat moved to your account.` : "";
      await ctx.reply(
        `🔗 Connected! This chat is now linked to ${maskEmail(r.email)} — alerts fire here AND in the web app.${merged}\n\n⚠️ Not you? Send /unlink to disconnect immediately.\nSend /help to see what I can do.`,
      );
    } catch (e) {
      plog.error(`bot: link failed for chat ${ctx.chat.id} — ${(e as Error).message}`);
      await ctx.reply("⚠️ Linking failed on my side — nothing was changed. Please try the dashboard link again.");
    }
  });
  bot.command("help", (ctx) => ctx.reply(HELP));
  bot.command("assets", (ctx) => ctx.reply(ASSETS));
  bot.command("list", async (ctx) => {
    const user = await resolveUser(ctx.chat.id, ctx.from?.username);
    if (!user) return void (await ctx.reply(DB_TROUBLE));
    const { text, keyboard } = await renderList(user);
    await ctx.reply(text, { reply_markup: keyboard });
  });
  bot.command("price", (ctx) => ctx.reply('💰 Just ask, e.g. "what\'s BTC?" or "prices of gold and oil".'));

  // /unlink — user-controlled revocation of the web-account binding (confirm first;
  // it's recoverable via the dashboard, but a mis-tap shouldn't cut delivery silently).
  bot.command("unlink", async (ctx) => {
    await ctx.reply(
      "🔓 Disconnect this chat from its web account?\n\nYour alerts stay in the web account and keep firing to the in-app inbox — they just stop pinging here. You can re-link anytime from the dashboard.",
      { reply_markup: new InlineKeyboard().text("Yes, disconnect", "unlink:yes").text("Cancel", "unlink:no") },
    );
  });

  // 🗑 button taps — deterministic, no LLM (the alert uuid rides in callback_data)
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data === "unlink:yes") {
      try {
        const r = await unlinkByChat(ctx.chat!.id);
        await ctx.answerCallbackQuery({ text: r.ok ? "Disconnected ✓" : "Nothing to disconnect" });
        await ctx.editMessageText(
          r.ok
            ? `🔓 Disconnected from ${maskEmail(r.email)}. Alerts now go to the web inbox only — re-link anytime from the dashboard.`
            : `⚠️ ${r.reason}`,
        );
      } catch (e) {
        plog.error(`bot: unlink failed — ${(e as Error).message}`);
        await ctx.answerCallbackQuery({ text: "Couldn't disconnect — try again." });
      }
      return;
    }
    if (data === "unlink:no") {
      await ctx.answerCallbackQuery({ text: "Kept ✓" });
      await ctx.editMessageText("👍 Still connected — nothing changed.");
      return;
    }
    if (data.startsWith("del:")) {
      const id = data.slice(4);
      const user = await resolveUser(ctx.chat!.id, ctx.from?.username);
      if (!user) return void (await ctx.answerCallbackQuery({ text: "Database unavailable — try again." }));
      try {
        const ok = await deleteAlert(user.userId, id);
        await ctx.answerCallbackQuery({ text: ok ? "Deleted ✓" : "Already gone" });
        const { text, keyboard } = await renderList(user);
        await ctx.editMessageText(text, { reply_markup: keyboard });
      } catch (e) {
        plog.error(`bot: delete failed — ${(e as Error).message}`);
        await ctx.answerCallbackQuery({ text: "Couldn't delete — try again." });
      }
      return;
    }
    await ctx.answerCallbackQuery();
  });

  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text;
    plog.bot(`chat ${chatId} ⟵ "${text}"`);

    const user = await resolveUser(chatId, ctx.from?.username);
    if (!user) return void (await ctx.reply(DB_TROUBLE));

    const r = await runBrain(text, { currency: user.currency, history: await getHistory(chatId) });
    plog.brain(
      `chat ${chatId} → ${r.action.name ?? "none"}${r.action.name ? ` ${JSON.stringify(r.action.args)}` : ""}`,
    );

    let extra = "";
    let keyboard: InlineKeyboard | undefined;
    if (r.action.name) {
      try {
        const out = await execute(user, r.action.name, r.action.args);
        extra = out.text ? `\n\n${out.text}` : "";
        keyboard = out.keyboard;
      } catch (e) {
        plog.error(`bot: execute(${r.action.name}) failed — ${(e as Error).message}`);
        extra = "\n\n⚠️ I couldn't complete that — something failed on my side. Please try again in a moment.";
      }
    }

    // memory includes what the SYSTEM did (rejections, prices) so "yes"-style follow-ups work
    await pushTurn(chatId, { role: "user", content: text });
    await pushTurn(chatId, { role: "assistant", content: `${r.message}${extra}` });

    const dev = r.action.name
      ? `🔧 [dev] ${r.action.name} ${JSON.stringify(r.action.args)}`
      : "🔧 [dev] (none — chat / clarify / refusal)";
    await ctx.reply(`${r.message}${extra}\n\n━━━━━━━━━━━━━━\n${dev}`, { reply_markup: keyboard });
  });

  bot.catch((err) => plog.error("bot error:", err.error));
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
    { command: "unlink", description: "Disconnect this chat from the web account" },
  ]);
  plog.bot("Telegram bot starting (long-polling, dev)…");
  await bot.start({ onStart: (info) => plog.bot(`@${info.username} is live ✓`) });
}
