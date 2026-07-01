import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";

// ENTRY: API process (ARCHITECTURE.md §5). Runs as its own PM2 app.
const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}  (health: /health)`);
});
