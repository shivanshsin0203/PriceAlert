import express from "express";
import { webhookCallback } from "grammy";
import { createBot } from "./bot/bot";
import { env } from "./config/env";
import { plog } from "./lib/logger";
import healthRoute from "./routes/health.route";
import apiRouter from "./routes/index";
import internalRouter from "./routes/internal.route";
import { errorHandler, notFound } from "./middleware/error.middleware";

// Builds the Express app (ARCHITECTURE.md §5). Kept separate from server.ts so it's testable.
export function createApp() {
  const app = express();

  app.set("trust proxy", 1); // behind nginx in production — req.ip/proto come from X-Forwarded-*
  app.use(express.json());

  app.use("/health", healthRoute); // root health for LBs/uptime probes
  app.use("/internal", internalRouter); // BFF-only (secret): auth login (§4.1)
  app.use("/api", apiRouter); // domain endpoints: JWT + INTERNAL_API_SECRET (§4.1)

  // Webhook transport (§19, production): Telegram POSTs updates here; grammY verifies
  // the X-Telegram-Bot-Api-Secret-Token header (§4.1 third trust boundary). The same
  // handleUpdate logic as polling — only the transport differs (§13).
  if (env.TELEGRAM_MODE === "webhook") {
    const bot = createBot();
    void bot.init().then(() => plog.bot(`webhook bot ready (@${bot.botInfo.username}) — POST /bot`));
    const handler = webhookCallback(bot, "express", { secretToken: env.TELEGRAM_WEBHOOK_SECRET });
    app.use("/bot", (req, res, next) => {
      handler(req, res).catch(next);
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
