import { NextRequest, NextResponse } from "next/server";

// BFF proxy (ARCHITECTURE.md §4, §4.1): the browser only ever talks to /api/* here;
// we forward to Express server-side (no CORS, Express stays private).
// Pre-auth phase: no JWT/secret headers yet — added when auth lands.
const EXPRESS_API_URL = process.env.EXPRESS_API_URL ?? "http://localhost:4000";

async function handler(req: NextRequest, ctx: { params: Promise<{ proxy: string[] }> }) {
  const { proxy } = await ctx.params;
  const url = `${EXPRESS_API_URL}/api/${proxy.join("/")}${req.nextUrl.search}`;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers: { "content-type": "application/json" },
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
