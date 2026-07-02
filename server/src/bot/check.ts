import { Bot } from "grammy";
import { env } from "../config/env";

// Verify the bot token connects. Run: npx tsx src/bot/check.ts
(async () => {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN as string);
  const me = await bot.api.getMe();
  console.log(`Bot connected: @${me.username} (id ${me.id})`);
})();
