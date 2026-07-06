import type { Request, Response } from "express";
import { z } from "zod";
import { mintJwt } from "../lib/jwt";
import { plog } from "../lib/logger";
import { upsertGoogleUser } from "../models/users.repo";

// POST /internal/auth/login (ARCHITECTURE.md §6 steps 3–4). The BFF already verified the
// Google code exchange server-to-server; we upsert by google_sub and mint the session JWT.

const LoginBody = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  name: z.string().nullish(),
  avatarUrl: z.string().url().nullish(),
});

export async function internalLogin(req: Request, res: Response) {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: { message: "Invalid Google profile payload." } });
  }
  try {
    const user = await upsertGoogleUser(parsed.data);
    plog.pg(`login: ${user.email} → user ${user.id.slice(0, 8)}`);
    // users.email is nullable only for telegram-first placeholders; a Google upsert always has one
    res.json({ token: mintJwt({ id: user.id, email: user.email ?? parsed.data.email, name: user.name, avatarUrl: user.avatarUrl }) });
  } catch (e) {
    plog.error(`login: upsert failed — ${(e as Error).message}`);
    res.status(503).json({ error: { message: "Could not sign you in (database unavailable). Try again shortly." } });
  }
}
