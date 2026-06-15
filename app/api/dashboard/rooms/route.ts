import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { parseRoomsCSV } from "@/lib/parseSheet";
import {
  endRoomsRevalidation,
  getRoomsCacheState,
  setRoomsCache,
  tryBeginRoomsRevalidation,
} from "@/lib/dashboardCache";
import { canViewTenant } from "@/lib/permissions";
import type { RoomRow } from "@/types";
import { makeEtag, timing } from "@/lib/apiTiming";

/**
 * Strip tenant PII fields when the requester isn't allowed to read them.
 * Only fields that identify a person are blanked — `contractEnd` stays
 * because sales needs to know which rooms have contracts expiring (to
 * follow up) without seeing who the tenant is.
 *
 * Server-side enforcement is mandatory: even if the UI hides the section,
 * a direct fetch to /api/dashboard/rooms should never leak PII.
 */
function stripTenantPii(rows: RoomRow[]): RoomRow[] {
  return rows.map((r) => ({ ...r, tenant: "", phone: "" }));
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/rooms — slice endpoint for room data.
 *
 * Phase 2 split: the legacy /api/dashboard waited for BOTH rooms (fast,
 * CSV ~500ms) AND tasks (slow, Apps Script 2-15s) before responding.
 * This endpoint serves rooms independently so the client can render the
 * room grid as soon as CSV finishes, without waiting on Apps Script.
 *
 * SWR semantics inherited from lib/dashboardCache (independent rooms slot).
 */

async function fetchRooms(): Promise<RoomRow[]> {
  const url = process.env.NEXT_PUBLIC_SHEET_ROOMS_CSV_URL;
  if (!url) throw new Error("ยังไม่ได้ตั้งค่า NEXT_PUBLIC_SHEET_ROOMS_CSV_URL");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const csv = await res.text();
  return parseRoomsCSV(csv);
}

function scheduleRevalidate(): void {
  if (!tryBeginRoomsRevalidation()) return;
  (async () => {
    const start = Date.now();
    try {
      const rooms = await fetchRooms();
      setRoomsCache(rooms);
      console.info("[dashboard/rooms] revalidate ok", { ms: Date.now() - start });
    } catch (e) {
      console.warn("[dashboard/rooms] revalidate failed (keeping prev cache)", e);
    } finally {
      endRoomsRevalidation();
    }
  })();
}

// Browser cache only (`private`) — never CDN. Rooms response varies by
// user role (PII strip, PR #61), so a shared CDN could leak management's
// data to sales. 60s fresh covers typical click-back navigation cheaply.
const ROOMS_CACHE_CONTROL = "private, max-age=60, stale-while-revalidate=300";

interface BuildOpts {
  body: { rooms: RoomRow[]; cached: boolean; cacheState: string; ageMs?: number; error?: string };
  etag?: string;
  status?: number;
  timings: { name: string; ms: number; desc?: string }[];
  ifNoneMatch: string | null;
}
function buildResponse({ body, etag, status, timings, ifNoneMatch }: BuildOpts): NextResponse {
  const headers: Record<string, string> = {
    "Cache-Control": ROOMS_CACHE_CONTROL,
    "Server-Timing": timings.map((t) => timing(t.name, t.ms, t.desc)).join(", "),
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
  // Single permission check at handler entry — applied to every response
  // body below via `project()` which strips PII for non-admins.
  const canTenant = canViewTenant(session.user.roles);
  const project = (rows: RoomRow[]): RoomRow[] => (canTenant ? rows : stripTenantPii(rows));

  const c = getRoomsCacheState();

  if (c.state === "fresh" && c.data) {
    const out = project(c.data);
    const totalMs = Date.now() - handlerStart;
    console.info("[dashboard/rooms] fresh", { ageMs: c.ageMs, totalMs });
    return buildResponse({
      body: { rooms: out, cached: true, cacheState: "fresh", ageMs: c.ageMs },
      etag: makeEtag("rooms", out),
      ifNoneMatch,
      timings: [
        timingEntry("auth", authMs),
        timingEntry("cache", 0, "fresh hit"),
        timingEntry("total", totalMs),
      ],
    });
  }

  if (c.state === "stale" && c.data) {
    scheduleRevalidate();
    const out = project(c.data);
    const totalMs = Date.now() - handlerStart;
    console.info("[dashboard/rooms] stale + bg revalidate", { ageMs: c.ageMs, totalMs });
    return buildResponse({
      body: { rooms: out, cached: true, cacheState: "stale", ageMs: c.ageMs },
      etag: makeEtag("rooms", out),
      ifNoneMatch,
      timings: [
        timingEntry("auth", authMs),
        timingEntry("cache", 0, "stale hit"),
        timingEntry("total", totalMs),
      ],
    });
  }

  // Missing — block on upstream
  const fetchStart = Date.now();
  try {
    const rooms = await fetchRooms();
    setRoomsCache(rooms);
    const out = project(rooms);
    const fetchMs = Date.now() - fetchStart;
    const totalMs = Date.now() - handlerStart;
    console.info("[dashboard/rooms] miss → fetched", { fetchMs, totalMs });
    return buildResponse({
      body: { rooms: out, cached: false, cacheState: "missing" },
      etag: makeEtag("rooms", out),
      ifNoneMatch,
      timings: [
        timingEntry("auth", authMs),
        timingEntry("rooms", fetchMs),
        timingEntry("total", totalMs),
      ],
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : "unknown";
    const totalMs = Date.now() - handlerStart;
    console.error("[dashboard/rooms] miss fetch failed", { error, totalMs });
    return buildResponse({
      body: { rooms: [], cached: false, cacheState: "missing", error },
      status: 502,
      ifNoneMatch,
      timings: [
        timingEntry("auth", authMs),
        timingEntry("rooms", Date.now() - fetchStart, `error: ${error}`),
        timingEntry("total", totalMs),
      ],
    });
  }
}

function timingEntry(name: string, ms: number, desc?: string) {
  return { name, ms, desc };
}
