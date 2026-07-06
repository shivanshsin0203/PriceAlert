import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "../../../lib/session";

// BFF proxy (ARCHITECTURE.md §4, §4.1): the browser only ever talks to /api/* here;
// we forward to Express server-side (no CORS, Express stays private) carrying BOTH
// trust proofs: the user's JWT (who) + INTERNAL_API_SECRET (caller is this BFF).
const EXPRESS_API_URL = process.env.EXPRESS_API_URL ?? "http://localhost:4000";

async function handler(req: NextRequest, ctx: { params: Promise<{ proxy: string[] }> }) {
  const { proxy } = await ctx.params;
  const url = `${EXPRESS_API_URL}/api/${proxy.join("/")}${req.nextUrl.search}`;

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.INTERNAL_API_SECRET) headers["x-internal-secret"] = process.env.INTERNAL_API_SECRET;
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  if (session) headers["authorization"] = `Bearer ${session}`; // absent = Express dev fallback (dev only)

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.text(),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return NextResponse.json(
      { error: { message: "API server unreachable — is the Express server running?" } },
      { status: 502 },
    );
  }

  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
