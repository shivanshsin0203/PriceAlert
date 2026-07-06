import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "../../../../lib/session";

// Steps 2–5 of the flow (ARCHITECTURE.md §6): Google redirects back with a one-time code;
// we exchange it server-side for an id_token (so its claims are trusted — they came from
// Google over TLS, no signature check needed), pass the verified profile to Express
// /internal/auth/login, and set the returned session JWT as a first-party httpOnly cookie.

const EXPRESS_API_URL = process.env.EXPRESS_API_URL ?? "http://localhost:4000";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // keep in step with the JWT's 7-day exp

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const fail = (message: string) => {
    const res = NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(message)}`, req.url));
    res.cookies.delete("oauth_state");
    return res;
  };

  const googleError = url.searchParams.get("error");
  if (googleError) {
    return fail(googleError === "access_denied" ? "Sign-in was cancelled." : `Google returned an error: ${googleError}`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("oauth_state")?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return fail("Sign-in session mismatch — please try again.");
  }

  // code → tokens (server-to-server; the client_secret never touches the browser)
  const appUrl = process.env.APP_URL ?? url.origin;
  let idToken: string;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${appUrl}/api/auth/callback`,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenRes.ok) return fail("Google rejected the sign-in code — please try again.");
    const body = (await tokenRes.json()) as { id_token?: string };
    if (!body.id_token) return fail("Google's response had no identity token — please try again.");
    idToken = body.id_token;
  } catch {
    return fail("Couldn't reach Google to finish sign-in — check your connection and try again.");
  }

  let profile: { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string; aud?: string };
  try {
    profile = JSON.parse(Buffer.from(idToken.split(".")[1], "base64").toString("utf8"));
  } catch {
    return fail("Malformed identity token — please try again.");
  }
  if (profile.aud !== process.env.GOOGLE_CLIENT_ID || !profile.sub || !profile.email) {
    return fail("Identity token failed validation — please try again.");
  }

  // verified profile → Express upserts the user and mints our session JWT (§6 steps 3–4)
  let sessionToken: string;
  try {
    const login = await fetch(`${EXPRESS_API_URL}/internal/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
      },
      body: JSON.stringify({
        sub: profile.sub,
        email: profile.email,
        name: profile.name ?? null,
        avatarUrl: profile.picture ?? null,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!login.ok) return fail("Our API rejected the sign-in — is the Express server running?");
    sessionToken = ((await login.json()) as { token: string }).token;
  } catch {
    return fail("Couldn't reach our API to finish sign-in — is the Express server running?");
  }

  const res = NextResponse.redirect(new URL("/dashboard", req.url));
  res.cookies.delete("oauth_state");
  res.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  return res;
}
