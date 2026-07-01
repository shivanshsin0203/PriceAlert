import express from "express";
import healthRoute from "./routes/health.route";
import apiRouter from "./routes/index";
import { errorHandler, notFound } from "./middleware/error.middleware";

// Builds the Express app (ARCHITECTURE.md §5). Kept separate from server.ts so it's testable.
export function createApp() {
  const app = express();

  app.use(express.json());

  app.use("/health", healthRoute); // root health for LBs/uptime probes
  app.use("/api", apiRouter); // domain endpoints (JWT + INTERNAL_API_SECRET later — §4.1)

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
