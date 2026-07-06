import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken, type Session } from "./session";

// Server-component session read (landing page button state, etc.).
// Edge-safe pieces live in lib/session.ts; this file may use next/headers.

export const SIGN_IN_PATH = "/api/auth/google";
export const SIGN_OUT_PATH = "/api/auth/logout";

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
