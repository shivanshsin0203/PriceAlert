import type { Request, Response } from "express";
import { env } from "../config/env";

// Thin controller (ARCHITECTURE.md §3 rule 1). Health check for load balancers / uptime probes.
export function getHealth(_req: Request, res: Response) {
  res.json({
    status: "ok",
    service: "alert-engine-api",
    env: env.NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}
