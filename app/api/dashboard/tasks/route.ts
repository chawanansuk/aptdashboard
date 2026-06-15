import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { appsScriptCall } from "@/lib/appsScriptFetch";
import {
  endTasksRevalidation,
  getTasksCacheState,
  peekEmergencyTasksCache,
  setTasksCache,
  tryBeginTasksRevalidation,
} from "@/lib/dashboardCache";
import type { SheetRow } from "@/types";
import { canViewTaskCustomer } from "@/lib/permissions";
import { makeEtag, timing } from "@/lib/apiTiming";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/tasks — slice endpoint for task data.
 *
 * v3.11 performance pass:
 * - Granular Server-Timing: auth / cache / fetch / parse / etag — so we
 *   can identify which step costs what from devtools without instrumenting
 *   the client.
 * - Serve-stale-on-error: if upstream fails or times out and we still
 *   have data in the emergency window (1 hour), return it (HTTP 200,
 *   `cacheState: "emergency-stale"`) instead of 502 + empty array. Users
 *   see old data, not a broken view.
 * - Shorter timeout: 8s (was 15s default) — fail fast so we can fall
 *   through to the emergency-stale path quicker.
 * - ETag: hash of the body → browser sends If-None-Match → we reply 304
 *   Not Modified for unchanged data, skipping the body transfer entirely
 *   (~50-150KB → 0 KB on hit).
 */

const TASKS_TIMEOUT_MS = 8_000;

async function fetchTasks(): Promise<SheetRow[]> {
  const j = await appsScriptCall<{ rows?: SheetRow[] }>(
    "getTasks", {}, { idempotent: true, timeoutMs: TASKS_TIMEOUT_MS }
  );
  if (!j.ok) throw new Error(j.error || "backend error");
  return (j.result?.rows || []) as SheetRow[];
}

function scheduleRevalidate(): void {
  if (!tryBeginTasksRevalidation()) return;
  (async () => {
    const start = Date.now();
    try {
      const tasks = await fetchTasks();
      setTasksCache(tasks);
      console.info("[dashboard/tasks] revalidate ok", { ms: Date.now() - start });
    } catch (e) {
      console.warn("[dashboard/tasks] revalidate failed (keeping prev cache)", e);
    } finally {
      endTasksRevalidation();
    }
  })();
}


interface BuildOpts {
  body: { tasks: SheetRow[]; cached: boolean; cacheState: string; ageMs?: number; error?: string };
  etag?: string;
  status?: number;
  timings: { name: string; ms: number; desc?: string }[];
  ifNoneMatch: string | null;
}
function buildResponse({ body, etag, status, timings, ifNoneMatch }: BuildOpts): NextResponse {
  const headers: Record<string, string> = {
    "Server-Timing": timings.map((t) => timing(t.name, t.ms, t.desc)).join(", "),
    // Browser cache only (`private`) — NOT `s-maxage` because the response
    // varies by user role (PR #61 strips tenant PII per role). A shared
    // CDN cache would risk serving an admin's full response to a sales
    // user. 15s fresh + 60s SWR matches the data's natural change rate.
    "Cache-Control": "private, max-age=15, stale-while-revalidate=60",
  };
  if (etag) {
    headers["ETag"] = etag;
    // 304 short-circuit — skip body entirely if client has the same ETag.
    if (ifNoneMatch === etag) {
      return new NextResponse(null, { status: 304, headers });
    }
  }
  return NextResponse.json(body, { status: status ?? 200, headers });
}

export async function GET(req: Request) {
  const handlerStart = Date.now();
  const ifNoneMatch = req.headers.get("if-none-match");

  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const authMs = Date.now() - handlerStart;

  // Per-role PII projection. The cache stores FULL rows (shared); each
  // response strips the task customer name + phone for users who can't
  // view it (engineer-only). The ETag is computed over the PROJECTED rows
  // so an engineer's 304 can't be satisfied by a sales user's cached body
  // (Cache-Control is already `private`, never CDN).
  const canSeeCustomer = canViewTaskCustomer(session.user.roles);
  const project = (rows: SheetRow[]): SheetRow[] =>
    canSeeCustomer ? rows : rows.map((t) => ({ ...t, customer: "", phone: "" }));

  // -------- Cache lookup --------
  const cacheStart = Date.now();
  const c = getTasksCacheState();
  const cacheMs = Date.now() - cacheStart;

  // ---- Fresh hit ----
  if (c.state === "fresh" && c.data) {
    const out = project(c.data);
    const etag = makeEtag("tasks", out);
    const totalMs = Date.now() - handlerStart;
    console.info("[dashboard/tasks] fresh", { ageMs: c.ageMs, totalMs, cacheMs });
    return buildResponse({
      body: { tasks: out, cached: true, cacheState: "fresh", ageMs: c.ageMs },
      etag,
      ifNoneMatch,
      timings: [
        { name: "auth", ms: authMs },
        { name: "cache", ms: cacheMs, desc: "fresh hit" },
        { name: "total", ms: totalMs },
      ],
    });
  }

  // ---- Stale hit (background revalidate) ----
  if (c.state === "stale" && c.data) {
    scheduleRevalidate();
    const out = project(c.data);
    const etag = makeEtag("tasks", out);
    const totalMs = Date.now() - handlerStart;
    console.info("[dashboard/tasks] stale + bg revalidate", { ageMs: c.ageMs, totalMs, cacheMs });
    return buildResponse({
      body: { tasks: out, cached: true, cacheState: "stale", ageMs: c.ageMs },
      etag,
      ifNoneMatch,
      timings: [
        { name: "auth", ms: authMs },
        { name: "cache", ms: cacheMs, desc: "stale hit + bg" },
        { name: "total", ms: totalMs },
      ],
    });
  }

  // ---- Missing — block on upstream, with emergency-stale fallback ----
  const fetchStart = Date.now();
  try {
    const tasks = await fetchTasks();
    const fetchMs = Date.now() - fetchStart;

    const parseStart = Date.now();
    setTasksCache(tasks); // cache the FULL rows; project only the response
    const out = project(tasks);
    const parseMs = Date.now() - parseStart;

    const etagStart = Date.now();
    const etag = makeEtag("tasks", out);
    const etagMs = Date.now() - etagStart;

    const totalMs = Date.now() - handlerStart;
    console.info("[dashboard/tasks] miss → fetched", { fetchMs, parseMs, etagMs, totalMs });
    return buildResponse({
      body: { tasks: out, cached: false, cacheState: "missing" },
      etag,
      ifNoneMatch,
      timings: [
        { name: "auth", ms: authMs },
        { name: "cache", ms: cacheMs, desc: "miss" },
        { name: "fetch", ms: fetchMs },
        { name: "parse", ms: parseMs },
        { name: "etag", ms: etagMs },
        { name: "total", ms: totalMs },
      ],
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : "unknown";
    const fetchMs = Date.now() - fetchStart;

    // Emergency: if we still have *any* recent cache (within 1 hour),
    // serve it rather than failing the whole dashboard.
    const emergency = peekEmergencyTasksCache();
    if (emergency) {
      const out = project(emergency);
      const etag = makeEtag("tasks", out);
      const totalMs = Date.now() - handlerStart;
      console.warn("[dashboard/tasks] miss-fail → emergency stale served", { error, fetchMs, totalMs });
      return buildResponse({
        body: { tasks: out, cached: true, cacheState: "emergency-stale", error },
        etag,
        ifNoneMatch,
        timings: [
          { name: "auth", ms: authMs },
          { name: "cache", ms: cacheMs, desc: "emergency hit" },
          { name: "fetch", ms: fetchMs, desc: `failed: ${error}` },
          { name: "total", ms: totalMs },
        ],
      });
    }

    // No cache at all — return 502 like before.
    const totalMs = Date.now() - handlerStart;
    console.error("[dashboard/tasks] miss fetch failed (no cache)", { error, fetchMs, totalMs });
    return buildResponse({
      body: { tasks: [], cached: false, cacheState: "missing", error },
      status: 502,
      ifNoneMatch,
      timings: [
        { name: "auth", ms: authMs },
        { name: "fetch", ms: fetchMs, desc: `error: ${error}` },
        { name: "total", ms: totalMs },
      ],
    });
  }
}
