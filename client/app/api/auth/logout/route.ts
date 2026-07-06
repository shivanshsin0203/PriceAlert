import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "../../../../lib/session";

// Sign out = drop the first-party session cookie. Express holds no session state (§6).
export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
