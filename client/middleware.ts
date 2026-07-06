import { NextRequest, NextResponse } from "next/server";
import { googleConfigured, SESSION_COOKIE, verifySessionToken } from "./lib/session";

// Gate /dashboard behind a valid session (ARCHITECTURE.md §6). With no Google creds
// configured (dev-fallback mode) the dashboard stays open — Express only honors the
// no-JWT path in development, so this cannot leak into production.

export async function middleware(req: NextRequest) {
  if (!googleConfigured()) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) return NextResponse.redirect(new URL("/?auth_error=signed_out", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*"] };
