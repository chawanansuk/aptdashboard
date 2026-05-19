export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Vercel Cron warmup — pings the 3 dashboard endpoints every 5 minutes
 * (see vercel.json) so neither Vercel function instances nor Apps Script
 * V8 isolates go cold. Without this, the user who happens to hit the
 * site after ~10 min of inactivity eats the full cold-start cost.
 *
 * Edge runtime: this handler does only fetch + JSON return, no Node-only
 * APIs — safe to run on the edge for ~0ms cold-start.
 *
 * Auth: Vercel Cron automatically attaches `Authorization: Bearer
 * <CRON_SECRET>` to scheduled runs. The same secret can be set manually
 * via Vercel dashboard → Project → Environment variables (any value;
 * UUID v4 works fine).
 *
 * Cost: free on Hobby tier — Cron is included; outbound fetches to our
 * own functions don't count against any quota that matters here.
 */

const ENDPOINTS = [
  "/api/dashboard/rooms",
  "/api/dashboard/tasks",
  "/api/dashboard",
];

export async function GET(req: Request) {
  // Verify the request came from Vercel Cron — without this, anyone with
  // the URL could spam warmup pings and waste our Apps Script quota.
  const expected = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization");
  if (!expected || provided !== `Bearer ${expected}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Resolve base URL — Vercel Cron sets `x-vercel-deployment-url` so we
  // can warm the exact same deployment that owns the cron. Fall back to
  // NEXT_PUBLIC_BASE_URL or VERCEL_URL for local/preview testing.
  const headerHost = req.headers.get("x-vercel-deployment-url") || req.headers.get("host");
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (headerHost ? `https://${headerHost}` : null) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!base) {
    return new Response("base URL unresolvable", { status: 500 });
  }

  const start = Date.now();
  const results = await Promise.allSettled(
    ENDPOINTS.map((path) =>
      fetch(`${base}${path}`, {
        cache: "no-store",
        headers: {
          // Mark the request so logs can distinguish warmup pings from
          // real user traffic, and so the route handlers can skip
          // anything user-specific that's irrelevant here.
          "x-warmup": "1",
        },
      }).then((r) => ({ path, status: r.status, ok: r.ok })),
    ),
  );

  const totalMs = Date.now() - start;
  console.info("[cron/warmup] done", {
    totalMs,
    results: results.map((r, i) => ({
      path: ENDPOINTS[i],
      ...(r.status === "fulfilled"
        ? { ok: r.value.ok, status: r.value.status }
        : { ok: false, error: String(r.reason) }),
    })),
  });

  return Response.json({
    ok: true,
    ts: new Date().toISOString(),
    totalMs,
    targets: ENDPOINTS,
  });
}
