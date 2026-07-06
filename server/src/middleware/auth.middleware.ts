import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { verifyJwt } from "../lib/jwt";
import { findAuthUser, findOrCreateByChatId, type AuthedUser, type BotUser } from "../models/users.repo";

// The two trust checks of ARCHITECTURE.md §4.1, Express being internet-exposed:
//   x-internal-secret  → the caller is OUR BFF (required on /internal AND /api)
//   Authorization: Bearer <jwt> → WHO the user is (required on /api)
// Dev fallback (development only, no JWT sent): act as the DASHBOARD_CHAT_ID user, so the
// dashboard keeps working before Google credentials exist. Production has no fallback.

declare module "express-serve-static-core" {
  interface Request {
    user?: BotUser | AuthedUser;
  }
}

const deny = (res: Response, message: string) => res.status(401).json({ error: { message } });

// /internal/* guard: secret only, no user identity (§4.1).
export function requireInternalSecret(req: Request, res: Response, next: NextFunction) {
  if (req.header("x-internal-secret") !== env.INTERNAL_API_SECRET) {
    return void deny(res, "Unauthorized (bad or missing internal secret).");
  }
  next();
}

// /api/* guard: secret (caller) + JWT (user).
export async function requireUser(req: Request, res: Response, next: NextFunction) {
  if (req.header("x-internal-secret") !== env.INTERNAL_API_SECRET) {
    return void deny(res, "Unauthorized (bad or missing internal secret — is the BFF configured?).");
  }

  const auth = req.header("authorization");
  try {
    if (auth?.startsWith("Bearer ")) {
      const payload = verifyJwt(auth.slice("Bearer ".length));
      if (!payload) return void deny(res, "Session expired or invalid — please sign in again.");
      const user = await findAuthUser(payload.sub);
      if (!user) return void deny(res, "Unknown user — please sign in again.");
      req.user = user;
      return next();
    }

    if (env.NODE_ENV === "development") {
      req.user = await findOrCreateByChatId(env.DASHBOARD_CHAT_ID); // pre-Google dev seam
      return next();
    }
  } catch {
    return void res
      .status(503)
      .json({ error: { message: "Could not resolve your account (database unavailable). Try again shortly." } });
  }

  deny(res, "Signed out — please sign in.");
}
