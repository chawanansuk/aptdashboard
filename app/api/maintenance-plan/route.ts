import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAddEngTask } from "@/lib/permissions";
import { appsScriptCall, AppsScriptError } from "@/lib/appsScriptFetch";
import {
  endEquipmentRevalidation,
  getEquipmentCacheState,
  peekEmergencyEquipmentCache,
  setEquipmentCache,
  tryBeginEquipmentRevalidation,
} from "@/lib/maintenanceCache";
import type { RoomEquipment } from "@/types";
import { createHash } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cross-project maintenance list. Returns ALL equipment across all rooms
 * so the UI can compute next-service-date + status badges client-side.
 *
 * GET /api/maintenance-plan → { rows: RoomEquipment[], ... }
 *
 * Permissions: engineer + management only.
 *
 * 2026-05 performance pass (mirrors /api/dashboard/tasks):
 *   - SWR cache (lib/maintenanceCache): fresh 90s / stale 10min / emergency 1hr
 *   - Granular Server-Timing: auth / cache / fetch / etag / total
 *   - ETag → 304 Not Modified for unchanged data (browser skips body)
 *   - Emergency-stale fallback on upstream error (don't return 502)
 *   - Shorter Apps Script timeout (8s) — fail fast → emergency-stale
 *
 * Cache invalidation hooked from /api/room-equipment POST writes
 * (addEquipment / updateEquipment) so the list reloads immediately.
 */

const PLAN_TIMEOUT_MS = 8_000;

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

async function fetchAll(): Promise<RoomEquipment[]> {
  const json = await appsScriptCall<{ rows?: RoomEquipment[] }>(
    "getAllEquipment", {}, { idempotent: true, timeoutMs: PLAN_TIMEOUT_MS }
  );
  if (!json.ok) throw new Error(json.error || "backend error");
  return (json.result?.rows || []) as RoomEquipment[];
}

function scheduleRevalidate(): void {
  if (!tryBeginEquipmentRevalidation()) return;
  (async () => {
    const start = Date.now();
    try {
      const rows = await fetchAll();
      setEquipmentCache(rows);
      console.info("[maintenance-plan] revalidate ok", { ms: Date.now() - start });
    } catch (e) {
      console.warn("[maintenance-plan] revalidate failed (keep prev cache)", e);
    } finally {
      endEquipmentRevalidation();
    }
  })();
}

function timing(name: string, ms: number, desc?: string): string {
  const d = desc ? `;desc="${desc.replace(/"/g, "'")}"` : "";
  return `${name}${d};dur=${ms.toFixed(0)}`;
}

function makeEtag(rows: RoomEquipment[]): string {
  const hash = createHash("md5").update(JSON.stringify(rows)).digest("hex");
  return `W/"maint-${hash.slice(0, 16)}"`;
}

interface BuildOpts {
  body: {
    rows: RoomEquipment[];
    cached: boolean;
    cacheState: string;
    ageMs?: number;
    error?: string;
  };
  etag?: string;
  status?: number;
  timings: { name: string; ms: number; desc?: string }[];
  ifNoneMatch: string | null;
}
function buildResponse({ body, etag, status, timings, ifNoneMatch }: BuildOpts): NextResponse {
  const headers: Record<string, string> = {
    "Server-Timing": timings.map((t) => timing(t.name, t.ms, t.desc)).join(", "),
  };
  if (etag) {
    headers["ETag"] = etag;
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
  if (!session?.user?.email) return bad("unauthenticated", 401);
  if (!canAddEngTask(session.user.roles)) {
    return bad("ไม่มีสิทธิ์ดูแผนบำรุง (เฉพาะ engineer และ management)", 403);
  }
  const authMs = Date.now() - handlerStart;

  // -------- Cache lookup --------
  const cacheStart = Date.now();
  const c = getEquipmentCacheState();
  const cacheMs = Date.now() - cacheStart;

  if (c.state === "fresh" && c.data) {
    const etag = makeEtag(c.data);
    const totalMs = Date.now() - handlerStart;
    console.info("[maintenance-plan] fresh", { ageMs: c.ageMs, totalMs, cacheMs });
    return buildResponse({
      body: { rows: c.data, cached: true, cacheState: "fresh", ageMs: c.ageMs },
      etag,
      ifNoneMatch,
      timings: [
        { name: "auth", ms: authMs },
        { name: "cache", ms: cacheMs, desc: "fresh hit" },
        { name: "total", ms: totalMs },
      ],
    });
  }

  if (c.state === "stale" && c.data) {
    scheduleRevalidate();
    const etag = makeEtag(c.data);
    const totalMs = Date.now() - handlerStart;
    console.info("[maintenance-plan] stale + bg revalidate", { ageMs: c.ageMs, totalMs, cacheMs });
    return buildResponse({
      body: { rows: c.data, cached: true, cacheState: "stale", ageMs: c.ageMs },
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
    const rows = await fetchAll();
    const fetchMs = Date.now() - fetchStart;
    setEquipmentCache(rows);

    const etagStart = Date.now();
    const etag = makeEtag(rows);
    const etagMs = Date.now() - etagStart;

    const totalMs = Date.now() - handlerStart;
    console.info("[maintenance-plan] miss → fetched", { fetchMs, etagMs, totalMs });
    return buildResponse({
      body: { rows, cached: false, cacheState: "missing" },
      etag,
      ifNoneMatch,
      timings: [
        { name: "auth", ms: authMs },
        { name: "cache", ms: cacheMs, desc: "miss" },
        { name: "fetch", ms: fetchMs },
        { name: "etag", ms: etagMs },
        { name: "total", ms: totalMs },
      ],
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : "unknown";
    const fetchMs = Date.now() - fetchStart;

    const emergency = peekEmergencyEquipmentCache();
    if (emergency) {
      const etag = makeEtag(emergency);
      const totalMs = Date.now() - handlerStart;
      console.warn("[maintenance-plan] miss-fail → emergency stale served", { error, fetchMs, totalMs });
      return buildResponse({
        body: { rows: emergency, cached: true, cacheState: "emergency-stale", error },
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

    const totalMs = Date.now() - handlerStart;
    const status = e instanceof AppsScriptError ? e.status : 502;
    console.error("[maintenance-plan] miss fetch failed (no cache)", { error, fetchMs, totalMs });
    return bad(`ดึงแผนบำรุงไม่สำเร็จ: ${error}`, status);
  }
}
