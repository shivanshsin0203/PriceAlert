import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";

// 404 for unmatched routes.
export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: { message: "Not found" } });
}

// Central error handler — don't leak internals.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { message: err.message } });
  }
  logger.error("Unhandled error:", err);
  res.status(500).json({ error: { message: "Internal server error" } });
}
