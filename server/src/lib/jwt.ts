import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "../config/env";

// Plain HS256 JWT (ARCHITECTURE.md §6 — the locked "custom + shared secret" choice).
// Minted here on /internal/auth/login, verified here on every /api request, and
// verified by the Next BFF (jose) with the SAME JWT_SECRET. HMAC only — we never
// read the header's `alg`, so algorithm-confusion attacks don't apply.

const SESSION_DAYS = 7;

export const JwtPayload = z.object({
  sub: z.string().uuid(), // users.id
  email: z.string(),
  name: z.string().nullable(),
  avatar: z.string().nullable(),
  iat: z.number(),
  exp: z.number(),
});
export type JwtPayload = z.infer<typeof JwtPayload>;

const b64url = (buf: Buffer | string): string =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const sign = (data: string): Buffer => createHmac("sha256", env.JWT_SECRET).update(data).digest();

export function mintJwt(user: { id: string; email: string; name: string | null; avatarUrl: string | null }): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatarUrl,
      iat: now,
      exp: now + SESSION_DAYS * 24 * 60 * 60,
    } satisfies JwtPayload),
  );
  return `${header}.${payload}.${b64url(sign(`${header}.${payload}`))}`;
}

// null = invalid/expired (caller responds 401 — never throws on bad input).
export function verifyJwt(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;

  const expected = b64url(sign(`${header}.${payload}`));
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  try {
    const parsed = JwtPayload.safeParse(JSON.parse(Buffer.from(payload, "base64").toString("utf8")));
    if (!parsed.success) return null;
    if (parsed.data.exp <= Math.floor(Date.now() / 1000)) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
