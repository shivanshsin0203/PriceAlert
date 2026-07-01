import { NextRequest, NextResponse } from "next/server";

// BFF proxy (ARCHITECTURE.md §4, §4.1): forwards /api/* to Express with the JWT cookie
// + INTERNAL_API_SECRET header. Placeholder until auth + server endpoints exist.
// TODO (build step 4): read JWT cookie → forward to EXPRESS_API_URL with Authorization + secret.
async function handler(_req: NextRequest) {
  return NextResponse.json(
    { error: { code: "not_implemented", message: "BFF proxy not implemented yet (skeleton)" } },
    { status: 501 },
  );
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
