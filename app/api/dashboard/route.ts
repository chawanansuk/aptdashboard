import { runAfterResponse } from "@/lib/afterResponse";
import { timing } from "@/lib/apiTiming";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { parseRoomsCSV } from "@/lib/parseSheet";
import {
  endRevalidation,
  FRESH_TTL_MS,
  getDashboardCacheState,
  roomsCacheGeneration,
  setRoomsCacheIfCurrent,
  setTasksCacheIfCurrent,
  tasksCacheGeneration,
  tryBeginRevalidation,
} from "@/lib/dashboardCache";
import { appsScriptCall } from "@/lib/appsScriptFetch";
import { canViewTenant, canViewTaskCustomer } from "@/lib/permissions";
import type { RoomRow, SheetRow } from "@/types";
import { setRoomsCache, setTasksCache } from "@/lib/dashboardCache";
import {
  redisGetJson, redisSetJson, isCachedSlice,
  REDIS_ROOMS_KEY, REDIS_TASKS_KEY, REDIS_SLICE_TTL_SEC, type CachedSlice,
} from "@/lib/redisCache";

/** Push a successful origin fetch into the shared L2 (fire-and-forget). */
function persistToRedis(rooms: RoomRow[], tasks: SheetRow[], at: number = Date.now()): void {
  void redisSetJson(REDIS_ROOMS_KEY, { at, rows: rooms }, REDIS_SLICE_TTL_SEC);
  void redisSetJson(REDIS_TASKS_KEY, { at, rows: tasks }, REDIS_SLICE_TTL_SEC);
}

/** r34: store both slots only if no write invalidated them since `gens`
 *  were captured (a fetch that straddles a write must not resurrect
 *  pre-write rows). Returns whether BOTH were applied. */
function storeIfCurrent(
  rooms: RoomRow[], tasks: SheetRow[], gens: { rooms: number; tasks: number }, at: number,
): boolean {
  const r = setRoomsCacheIfCurrent(rooms, gens.rooms, at);
  const t = setTasksCacheIfCurrent(tasks, gens.tasks, at);
  return r && t;
}

/** On an L1 miss, hydrate both slots from the shared L2 (see the split
 *  routes for the same pattern). Returns true when anything was seeded. */
async function hydrateFromRedis(): Promise<boolean> {
  const [r2, t2] = await Promise.all([
    redisGetJson<CachedSlice<RoomRow>>(REDIS_ROOMS_KEY),
    redisGetJson<CachedSlice<SheetRow>>(REDIS_TASKS_KEY),
  ]);
  let seeded = false;
  if (isCachedSlice<RoomRow>(r2)) { setRoomsCache(r2.rows, r2.at); seeded = true; }
  if (isCachedSlice<SheetRow>(t2)) { setTasksCache(t2.rows, t2.at); seeded = true; }
  return seeded;
}

/** Strip tenant PII (see app/api/dashboard/rooms/route.ts for details). */
function stripTenantPii(rows: RoomRow[]): RoomRow[] {
  return rows.map((r) => ({ ...r, tenant: "", phone: "" }));
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// r27: Vercel default (10-15s) สั้นกว่า timeout ของ appsScriptCall → function
// ถูกฆ่าก่อนโค้ดจับ error ผู้ใช้เจอ 504 เปล่าๆ. 60s = เพดาน Hobby.
export const maxDuration = 60;

/**
 * GET /api/dashboard — primary read endpoint.
 *
 * Performance strategy (perf/dashboard-swr-and-timing):
 *
 * 1. SWR cache (lib/dashboardCache):
 *    - fresh (≤ 60s): return as-is, no upstream call
 *    - stale (≤ 5min): return immediately, kick off background refetch
 *    - missing (> 5min or invalidated): block on a full fetch
 *
 * 2. Timing instrumentation:
 *    - Per-source latency (rooms CSV vs Apps Script tasks)
 *    - Total handler time
 *    - Surfaced as Server-Timing header so we can inspect in DevTools / curl,
 *      and as console.info for Vercel logs
 *
 * Auth gates access; the cache itself isn't per-user (dashboard data is the
 * same for every authenticated user), so we keep one shared slot.
 */

interface SourceTiming {
  source: "rooms" | "tasks";
  ms: number;
  ok: boolean;
  error?: string;
}

async function timed<T>(
  source: SourceTiming["source"],
  fn: () => Promise<T>,
): Promise<{ result: T | null; timing: SourceTiming }> {
  const start = Date.now();
  try {
    const result = await fn();
    return {
      result,
      timing: { source, ms: Date.now() - start, ok: true },
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : "unknown";
    return {
      result: null,
      timing: { source, ms: Date.now() - start, ok: false, error },
    };
  }
}

async function fetchRooms(): Promise<RoomRow[]> {
  // Prefer the server-only name; NEXT_PUBLIC_* fallback kept for existing
  // deployments. The publish-to-web CSV carries tenant PII, so the env
  // must never actually be NEXT_PUBLIC-exposed in client code — rename
  // the Vercel var to SHEET_ROOMS_CSV_URL when convenient (.env.example).
  const url = process.env.SHEET_ROOMS_CSV_URL || process.env.NEXT_PUBLIC_SHEET_ROOMS_CSV_URL;
  if (!url) throw new Error("ยังไม่ได้ตั้งค่า NEXT_PUBLIC_SHEET_ROOMS_CSV_URL");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const csv = await res.text();
  return parseRoomsCSV(csv);
}

async function fetchTasks(): Promise<SheetRow[]> {
  const j = await appsScriptCall<{ rows?: SheetRow[] }>(
    "getTasks", {}, { idempotent: true }
  );
  if (!j.ok) throw new Error(j.error || "backend error");
  return (j.result?.rows || []) as SheetRow[];
}

interface FetchAllResult {
  rooms: RoomRow[];
  tasks: SheetRow[];
  timings: SourceTiming[];
  errors: string[];
}

async function fetchAllUpstream(): Promise<FetchAllResult> {
  const [roomsT, tasksT] = await Promise.all([
    timed("rooms", fetchRooms),
    timed("tasks", fetchTasks),
  ]);

  const errors: string[] = [];
  if (!roomsT.timing.ok && roomsT.timing.error) errors.push("rooms: " + roomsT.timing.error);
  if (!tasksT.timing.ok && tasksT.timing.error) errors.push("tasks: " + tasksT.timing.error);

  return {
    rooms: roomsT.result || [],
    tasks: tasksT.result || [],
    timings: [roomsT.timing, tasksT.timing],
    errors,
  };
}

/** Format timings into a Server-Timing header so DevTools can render it.
 *  r37: ใช้ timing() ตัวกลาง (lib/apiTiming) ที่กรองอักษรนอก ASCII ออก —
 *  สำเนาในไฟล์นี้ไม่ได้กรอง ถ้ามี error ภาษาไทยหลุดเข้ามาจะทำให้ response
 *  พังเป็น 500 แบบเดียวกับที่เจอใน /api/dashboard/tasks. */
function buildServerTimingHeader(parts: { name: string; ms: number; desc?: string }[]): string {
  return parts.map((p) => timing(p.name, p.ms, p.desc)).join(", ");
}

/**
 * Fire-and-forget background revalidation. Single-flight guarded so that
 * 10 concurrent stale-hits only trigger 1 upstream refetch.
 */
function scheduleRevalidate(): void {
  if (!tryBeginRevalidation()) return;
  // Don't await — this runs in the background while the user already has
  // their stale response in hand. r37: แต่ต้องบอก Vercel ให้รอจนงานจบก่อน
  // แช่แข็ง instance ไม่งั้นถูกตัดกลางคัน (ดู lib/afterResponse)
  runAfterResponse((async () => {
    const start = Date.now();
    const gens = { rooms: roomsCacheGeneration(), tasks: tasksCacheGeneration() };
    try {
      const out = await fetchAllUpstream();
      if (out.errors.length === 0) {
        if (storeIfCurrent(out.rooms, out.tasks, gens, start)) persistToRedis(out.rooms, out.tasks, start);
        console.info("[dashboard] revalidate ok", {
          totalMs: Date.now() - start,
          timings: out.timings,
        });
      } else {
        console.warn("[dashboard] revalidate partial-fail; keeping previous cache", {
          totalMs: Date.now() - start,
          errors: out.errors,
        });
      }
    } catch (e) {
      console.error("[dashboard] revalidate threw", e);
    } finally {
      endRevalidation();
    }
  })());
}

export async function GET() {
  const handlerStart = Date.now();
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const authMs = Date.now() - handlerStart;
  const canTenant = canViewTenant(session.user.roles);
  const projectRooms = (rs: RoomRow[]) => (canTenant ? rs : stripTenantPii(rs));
  // Tasks ก็ต้อง strip PII ต่อ role เหมือน /api/dashboard/tasks — เดิม
  // endpoint รวมนี้ส่ง customer+phone ดิบให้ทุก role (audit r22, MED-HIGH):
  // ช่างที่ curl ตรงมาที่นี่อ่านชื่อ/เบอร์ลูกค้าได้ทั้งที่ endpoint แยก strip
  const canSeeCustomer = canViewTaskCustomer(session.user.roles);
  const projectTasks = (ts: SheetRow[]): SheetRow[] =>
    canSeeCustomer ? ts : ts.map((t) => ({ ...t, customer: "", phone: "" }));

  let cacheLookup = getDashboardCacheState();
  if (cacheLookup.state === "missing") {
    // L1 miss → try the shared Redis L2 before blocking on upstream.
    if (await hydrateFromRedis()) cacheLookup = getDashboardCacheState();
  }

  // ----- fresh: return immediately, no upstream call -----
  if (cacheLookup.state === "fresh" && cacheLookup.data) {
    const totalMs = Date.now() - handlerStart;
    console.info("[dashboard] cache fresh", { ageMs: cacheLookup.ageMs, totalMs });
    return NextResponse.json(
      {
        rooms: projectRooms(cacheLookup.data.rooms),
        tasks: projectTasks(cacheLookup.data.tasks),
        cached: true,
        cacheState: "fresh",
        ageMs: cacheLookup.ageMs,
      },
      {
        headers: {
          // Browser cache only — response varies by user role (PII strip).
          // 30s fresh + 120s SWR for the combined endpoint.
          "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
          "Server-Timing": buildServerTimingHeader([
            { name: "auth", ms: authMs },
            { name: "cache", ms: 0, desc: "fresh hit" },
            { name: "total", ms: totalMs },
          ]),
        },
      },
    );
  }

  // ----- stale: return immediately, revalidate in background -----
  if (cacheLookup.state === "stale" && cacheLookup.data) {
    scheduleRevalidate();
    const totalMs = Date.now() - handlerStart;
    console.info("[dashboard] cache stale (revalidating bg)", {
      ageMs: cacheLookup.ageMs,
      totalMs,
    });
    return NextResponse.json(
      {
        rooms: projectRooms(cacheLookup.data.rooms),
        tasks: projectTasks(cacheLookup.data.tasks),
        cached: true,
        cacheState: "stale",
        ageMs: cacheLookup.ageMs,
      },
      {
        headers: {
          // Browser cache only — response varies by user role (PII strip).
          // 30s fresh + 120s SWR for the combined endpoint.
          "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
          "Server-Timing": buildServerTimingHeader([
            { name: "auth", ms: authMs },
            { name: "cache", ms: 0, desc: "stale hit + bg revalidate" },
            { name: "total", ms: totalMs },
          ]),
        },
      },
    );
  }

  // ----- missing: block on upstream -----
  const fetchStart = Date.now();
  const gens = { rooms: roomsCacheGeneration(), tasks: tasksCacheGeneration() };
  const fetchOut = await fetchAllUpstream();
  if (fetchOut.errors.length === 0) {
    if (storeIfCurrent(fetchOut.rooms, fetchOut.tasks, gens, fetchStart)) {
      persistToRedis(fetchOut.rooms, fetchOut.tasks, fetchStart);
    }
  }
  const totalMs = Date.now() - handlerStart;
  console.info("[dashboard] cache miss", {
    totalMs,
    timings: fetchOut.timings,
    errors: fetchOut.errors,
  });

  return NextResponse.json(
    {
      rooms: projectRooms(fetchOut.rooms),
      tasks: projectTasks(fetchOut.tasks),
      cached: false,
      cacheState: "missing",
      errors: fetchOut.errors.length ? fetchOut.errors : undefined,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
        "Server-Timing": buildServerTimingHeader([
          { name: "auth", ms: authMs },
          ...fetchOut.timings.map((t) => ({
            name: t.source,
            ms: t.ms,
            desc: t.ok ? undefined : `error: ${t.error || ""}`,
          })),
          { name: "total", ms: totalMs },
        ]),
      },
    },
  );
}

/** Re-export so the legacy spec helper still exists for tests. */
export { FRESH_TTL_MS };
