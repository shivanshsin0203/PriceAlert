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

// The bot. Alerts persist in Postgres, mirror to Redis, and the watcher fires them
// for real. Every failure path replies something useful. Transport (polling vs webhook)
// is chosen by the caller (worker = polling in dev, app = webhook in prod) — §19.

// Static messages use HTML parse_mode for bold headers; escape any interpolated name
// ("Larsen & Toubro" has an &). Dynamic replies (AI text, prices) stay plain — no escaping risk.
const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const START = `👋 <b>Welcome to PriceAlert</b>

I watch asset prices and ping you the moment your condition hits — just tell me in plain English.

🔔 <b>Create alerts</b>
   • "alert me when BTC goes above 70000"
   • "alert me if ETH drops 5% in 1h"
   • bulk works: "alert me if top 6 crypto rise 5% in 1h"

💰 <b>Prices</b>  —  "what's SOL at?" · "prices of gold, oil and nifty"

💱 <b>Currency</b>  —  "switch to INR"  (display only: USD / EUR / INR)

📋 <b>Manage</b>  —  "show my alerts" → tap 🗑 to delete

🔗 <b>Web app</b>  —  link the dashboard for the same alerts on both

📈 <b>Assets</b>
   • Crypto: BTC, ETH, SOL, BNB, XRP, ADA, DOGE +6
   • US stocks: Apple, Microsoft, Nvidia, Tesla… (15)
   • Indian stocks: Reliance, TCS, HDFC Bank, Zomato… (15)
   • NIFTY, Oil · price-only: gold, silver, forex

⌨️  /help  ·  /list  ·  /price  ·  /assets  ·  /unlink

Alerts fire once, then they're done — no spam.

<i>Not financial advice.</i>`;

const HELP = `📖 <b>How to use me</b>

🥇 <b>The golden rule</b> — put SYMBOL + CONDITION (+ TIMEFRAME for % alerts) in one message.

✅ <b>Clear — I act instantly</b>
   • "alert me when btc goes above 70000"
   • "eth drops 5% in 2 hours"
   • "btc &lt; 55k"   (shorthand: k, lakh, &gt;, &lt;)
   • "alert me if top 6 crypto rise 5% in 1h"   (bulk: up to 15)
   • "prices of gold, oil and nifty"

❓ <b>Vague — I'll ask a follow-up</b>
   • "alert me on bitcoin"   (no condition)
   • "eth drops 5%"   (no timeframe)
   • "apple at 10"   ($10 or 10%?)

📏 <b>The rules</b>
   • Thresholds in USD — "55k" = 55,000, "1 lakh" = 100,000. Indian stocks &amp; NIFTY in ₹.
   • % alerts need a window between 5 minutes and 24 hours.
   • Stocks &amp; NIFTY evaluate during market hours; crypto is 24/7.
   • If your condition is already true, I flag it instead of firing instantly.
   • Alerts fire once, max lifetime 24h. Any language works — Hinglish is fine.

⌨️ <b>Commands</b>
   /list · /price · /assets · /unlink

💬 Everything else — just say it in plain English.`;

const ASSETS = `📈 <b>Supported assets</b>

🪙 <b>Crypto</b>  —  24/7 · alerts + prices
   ${escHtml(CRYPTO.join(" · "))}

🏢 <b>US stocks</b>  —  market hours · alerts + prices
   ${escHtml(STOCKS.map(nameOf).join(" · "))}

🇮🇳 <b>Indian stocks</b>  —  NSE hours · alerts + prices
   ${escHtml(INDIA.map(nameOf).join(" · "))}

📊 <b>Index:</b> Nifty 50    🛢 <b>Commodity:</b> Crude Oil

🥇 <b>Metals</b> (prices only): ${escHtml(METALS.join(" · "))}

💱 <b>Forex</b> (prices only): ${escHtml(FOREX.join(" · "))}

All thresholds in USD — display in USD / EUR / INR via "switch to …".`;

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
  if (alerts.length === 0) return { text: '📋 No active alerts.\n\nTry "alert me if BTC drops 5% in 1h".' };
  const kb = new InlineKeyboard();
  alerts.forEach((a, i) => kb.text(`🗑 Delete #${i + 1}`, `del:${a.id}`).row());
  return {
    text: "📋 Your alerts:\n\n" + alerts.map((a, i) => `• ${describeAlert(a, i + 1)}`).join("\n"),
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
      return { text: `💱 Display currency is now ${args.currency}.\n\nAlert thresholds stay in USD.` };
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
    if (!token) return void (await ctx.reply(START, { parse_mode: "HTML" }));
    try {
      const r = await consumeLinkToken(token, ctx.chat.id, ctx.from?.username);
      if (!r.ok) return void (await ctx.reply(`⚠️ Couldn't link this Telegram: ${r.reason}`));
      if (r.already) {
        return void (await ctx.reply(`✅ This Telegram is already connected to ${maskEmail(r.email)}.`));
      }
      const merged = r.mergedAlerts > 0 ? `\n\n📦 ${r.mergedAlerts} existing alert${r.mergedAlerts === 1 ? "" : "s"} from this chat moved to your account.` : "";
      await ctx.reply(
        `🔗 Connected!\n\nThis chat is now linked to ${maskEmail(r.email)} — alerts fire here AND in the web app.${merged}\n\n⚠️ Not you? Send /unlink to disconnect immediately.\n\nSend /help to see what I can do.`,
      );
    } catch (e) {
      plog.error(`bot: link failed for chat ${ctx.chat.id} — ${(e as Error).message}`);
      await ctx.reply("⚠️ Linking failed on my side — nothing was changed. Please try the dashboard link again.");
    }
  });
  bot.command("help", (ctx) => ctx.reply(HELP, { parse_mode: "HTML" }));
  bot.command("assets", (ctx) => ctx.reply(ASSETS, { parse_mode: "HTML" }));
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
      "🔓 Disconnect this chat from its web account?\n\nYour alerts stay in the web account and keep firing to the in-app inbox — they just stop pinging here.\n\nYou can re-link anytime from the dashboard.",
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
            ? `🔓 Disconnected from ${maskEmail(r.email)}.\n\nAlerts now go to the web inbox only — re-link anytime from the dashboard.`
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

    // Production: clean reply. Development: append the function + args the AI picked, so
    // local debugging still shows the routing (hidden the moment NODE_ENV=production).
    const body = `${r.message}${extra}`;
    const reply =
      env.NODE_ENV === "development"
        ? `${body}\n\n─────\n🔧 ${r.action.name ? `${r.action.name} ${JSON.stringify(r.action.args)}` : "(none — chat / clarify / refusal)"}`
        : body;
    await ctx.reply(reply, { reply_markup: keyboard });
  });

  bot.catch((err) => plog.error("bot error:", err.error));
  return bot;
}

// Shared with scripts/set-webhook.ts (webhook mode registers commands there).
export const BOT_COMMANDS = [
  { command: "start", description: "What I can do" },
  { command: "help", description: "How to use me effectively" },
  { command: "list", description: "My alerts (with delete buttons)" },
  { command: "price", description: "Get a price" },
  { command: "assets", description: "Everything I can watch" },
  { command: "unlink", description: "Disconnect this chat from the web account" },
];

// Long-polling transport (TELEGRAM_MODE=polling — local dev only; §19).
// Returns the Bot so the worker can stop() it on SIGTERM.
export async function startBot(): Promise<Bot> {
  const bot = createBot();
  await bot.api.setMyCommands(BOT_COMMANDS);
  plog.bot("Telegram bot starting (long-polling, dev)…");
  void bot.start({ onStart: (info) => plog.bot(`@${info.username} is live ✓`) });
  return bot;
}
