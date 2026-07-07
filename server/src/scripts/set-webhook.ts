import { Api } from "grammy";
import { BOT_COMMANDS } from "../bot/bot";
import { env } from "../config/env";

// One-shot webhook management (run inside the api container or locally with prod .env):
//   node dist/scripts/set-webhook.js           → set webhook to PUBLIC_BASE_URL/bot + commands
//   node dist/scripts/set-webhook.js --delete  → remove the webhook (re-enables local polling)
//   node dist/scripts/set-webhook.js --info    → show current webhook state

async function main() {
  const api = new Api(env.TELEGRAM_BOT_TOKEN);
  const arg = process.argv[2];

  if (arg === "--info") {
    console.log(JSON.stringify(await api.getWebhookInfo(), null, 2));
    return;
  }
  if (arg === "--delete") {
    await api.deleteWebhook({ drop_pending_updates: false });
    console.log("webhook deleted — polling is possible again");
    return;
  }

  if (!env.PUBLIC_BASE_URL || !env.TELEGRAM_WEBHOOK_SECRET) {
    throw new Error("PUBLIC_BASE_URL and TELEGRAM_WEBHOOK_SECRET must be set");
  }
  const url = `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/bot`;
  await api.setWebhook(url, {
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    drop_pending_updates: true,
    allowed_updates: ["message", "callback_query"],
  });
  await api.setMyCommands(BOT_COMMANDS);
  console.log(`webhook set → ${url} (secret header enforced) + commands registered`);
  console.log(JSON.stringify(await api.getWebhookInfo(), null, 2));
}

main().catch((e) => {
  console.error("set-webhook failed:", e);
  process.exit(1);
});
