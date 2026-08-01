import { NextResponse } from "next/server";
import { redisPing } from "@/lib/redisCache";

// Evaluated fresh on every request against the LIVE deployment, so a
// client running an older bundle can compare its baked NEXT_PUBLIC_BUILD_ID
// against this and prompt the user to reload. Must never be cached.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const build =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_BUILD_ID ||
    "dev";
  // ?ping=1 → also round-trip the shared Redis cache. Opt-in only:
  // clients poll this endpoint for build checks, and those polls must
  // stay instant. Exposes health booleans only — no keys, no data.
  const withPing = new URL(req.url).searchParams.get("ping") === "1";
  const redis = withPing ? await redisPing() : undefined;
  return NextResponse.json(
    { build, ...(redis ? { redis } : {}) },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
