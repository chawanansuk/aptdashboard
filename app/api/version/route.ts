import { NextResponse } from "next/server";

// Evaluated fresh on every request against the LIVE deployment, so a
// client running an older bundle can compare its baked NEXT_PUBLIC_BUILD_ID
// against this and prompt the user to reload. Must never be cached.
export const dynamic = "force-dynamic";

export function GET() {
  const build =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_BUILD_ID ||
    "dev";
  return NextResponse.json(
    { build },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
