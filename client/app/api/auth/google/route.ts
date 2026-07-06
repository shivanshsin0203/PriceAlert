import { NextRequest, NextResponse } from "next/server";
import { googleConfigured } from "../../../../lib/session";

// Step 1 of the flow (ARCHITECTURE.md §6): send the browser to Google's consent screen.
// `state` is a CSRF nonce — set as a short-lived cookie, checked again in the callback.

export async function GET(req: NextRequest) {
  if (!googleConfigured()) {
    return NextResponse.redirect(
      new URL(`/?auth_error=${encodeURIComponent("Google sign-in isn't configured yet — add GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET to client/.env.local")}`, req.url),
    );
  }

  const state = crypto.randomUUID().replace(/-/g, "");
  const appUrl = process.env.APP_URL ?? new URL(req.url).origin;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${appUrl}/api/auth/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });

  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  res.cookies.set("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax", // Google's redirect back is a top-level navigation → Lax cookies are sent
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/api/auth",
  });
  return res;
}
