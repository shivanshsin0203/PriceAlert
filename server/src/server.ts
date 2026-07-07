import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";

// ENTRY: API process (ARCHITECTURE.md §5). Runs as its own container/PM2 app.
const app = createApp();

const srv = app.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}  (health: /health)`);
});

// Graceful shutdown (docker stop sends SIGTERM): stop accepting, drain, exit. 10s cap.
const shutdown = (sig: string) => {
  logger.info(`${sig} — closing HTTP server…`);
  setTimeout(() => process.exit(1), 10_000).unref();
  srv.close(() => process.exit(0));
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
