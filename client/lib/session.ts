import { jwtVerify } from "jose";

// Edge-safe session helpers (imported by middleware.ts — no next/headers here).
// The session cookie holds the plain HS256 JWT that EXPRESS minted; we verify it with
// the same shared JWT_SECRET (ARCHITECTURE.md §6).

export const SESSION_COOKIE = "session";

export type Session = {
  userId: string;
  email: string;
  name: string | null;
  avatar: string | null;
};

// Empty Google creds = dev-fallback mode: no sign-in, the dashboard runs as the
// server's DASHBOARD_CHAT_ID user (development only — Express enforces that side).
export const googleConfigured = (): boolean =>
  !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export async function verifySessionToken(token: string): Promise<Session | null> {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    return {
      userId: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : null,
      avatar: typeof payload.avatar === "string" ? payload.avatar : null,
    };
  } catch {
    return null; // bad signature / expired / malformed — treated as signed out
  }
}
