import { runAfterResponse } from "@/lib/afterResponse";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { appsScriptCall } from "@/lib/appsScriptFetch";
import {
  dropTasksCacheIfOlderThan,
  endTasksRevalidation,
  getTasksCacheState,
  peekEmergencyTasksCache,
  setTasksCache,
  setTasksCacheIfCurrent,
  tasksCacheGeneration,
  tryBeginTasksRevalidation,
} from "@/lib/dashboardCache";
import type { SheetRow } from "@/types";
import { canViewTaskCustomer } from "@/lib/permissions";
import { makeEtag, timing } from "@/lib/apiTiming";
import {
  redisGetJson, redisSetJson, redisGetEpoch, isCachedSlice,
  REDIS_TASKS_KEY, REDIS_SLICE_TTL_SEC, type CachedSlice,
} from "@/lib/redisCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// r27: Vercel default (10-15s) สั้นกว่า timeout ของ appsScriptCall → function
// ถูกฆ่าก่อนโค้ดจับ error ผู้ใช้เจอ 504 เปล่าๆ. 60s = เพดาน Hobby.
export const maxDuration = 60;

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
// r32 (?fresh=1): ใช้เช็คหลัง Google ตอบช้า — Google เพิ่งช้ามา ให้เวลามากกว่าปกติ
const FRESH_TIMEOUT_MS = 20_000;

async function fetchTasks(timeoutMs: number = TASKS_TIMEOUT_MS): Promise<SheetRow[]> {
  const j = await appsScriptCall<{ rows?: SheetRow[] }>(
    "getTasks", {}, { idempotent: true, timeoutMs }
  );
  if (!j.ok) throw new Error(j.error || "backend error");
  return (j.result?.rows || []) as SheetRow[];
}

function scheduleRevalidate(): void {
  if (!tryBeginTasksRevalidation()) return;
  // r37: บอก Vercel ว่ายังมีงานค้าง อย่าเพิ่งแช่แข็ง instance — เดิมงาน
  // revalidate ถูกตัดกลางคันหลังส่ง response ทำให้แคชไม่เคยถูกเติมจริง
  runAfterResponse((async () => {
    const start = Date.now();
    // r34: capture generation + start time — rows fetched before a concurrent
    // write must not repopulate L1/L2 after the write invalidated them
    // (audit: this re-poisoned Redis for an hour → "ปิดงานแล้วเด้งกลับ").
    const gen = tasksCacheGeneration();
    try {
      const tasks = await fetchTasks();
      if (setTasksCacheIfCurrent(tasks, gen, start)) {
        // Share with every other instance (L2). Fire-and-forget: a Redis
        // hiccup must not fail the revalidation that already succeeded.
        void redisSetJson(REDIS_TASKS_KEY, { at: start, rows: tasks }, REDIS_SLICE_TTL_SEC);
      } else {
        console.info("[dashboard/tasks] revalidate discarded (write happened mid-fetch)");
      }
      console.info("[dashboard/tasks] revalidate ok", { ms: Date.now() - start });
    } catch (e) {
      console.warn("[dashboard/tasks] revalidate failed (keeping prev cache)", e);
    } finally {
      endTasksRevalidation();
    }
  })());
}


interface BuildOpts {
  // `tasks` ต้องไม่มีใน body ตอน error (audit r33): ฝั่งเว็บถือว่า "มี key tasks"
  // = ข้อมูลจริง แล้วเอา [] ทับรายการที่ยังใช้ได้ทั้งหน้า
  body: { tasks?: SheetRow[]; cached: boolean; cacheState: string; ageMs?: number; error?: string };
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
    // Error bodies must never be cached by the browser (audit r33).
    "Cache-Control": status && status >= 400 ? "no-store" : "private, max-age=15, stale-while-revalidate=60",
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

  // ---- ?fresh=1 — ข้าม L1/L2/emergency ทุกชั้น (r32) ----
  // ใช้ตอน "Google ตอบช้าจนหมดเวลา" แล้วฝั่งเว็บอยากรู้ความจริงว่างานเข้าแล้วหรือยัง.
  // เส้นทางปกติตอบจากแคช และการล้างแคชตอน 504 ถึงแค่เครื่อง Vercel ที่หมดเวลา —
  // ถ้าคำขอเช็คไปตกเครื่องอื่นที่แคชยังอุ่น จะตอบผิดว่า "ยังไม่ได้บันทึก" (audit r33).
  if (new URL(req.url).searchParams.get("fresh") === "1") {
    const fetchStart = Date.now();
    try {
      const tasks = await fetchTasks(FRESH_TIMEOUT_MS);
      setTasksCache(tasks);
      void redisSetJson(REDIS_TASKS_KEY, { at: Date.now(), rows: tasks }, REDIS_SLICE_TTL_SEC);
      console.info("[dashboard/tasks] fresh bypass", { fetchMs: Date.now() - fetchStart });
      return NextResponse.json(
        { tasks: project(tasks), cached: false, cacheState: "fresh-bypass" },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (e) {
      const error = e instanceof Error ? e.message : "unknown";
      console.error("[dashboard/tasks] fresh bypass failed", { error, fetchMs: Date.now() - fetchStart });
      return NextResponse.json(
        { cached: false, cacheState: "missing", error },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  // -------- Cache lookup --------
  // L1 = this instance's memory. On an L1 miss (cold start / other
  // instance's write invalidated us), try the shared Redis L2 before
  // paying the slow Apps Script fetch. The entry is seeded with its
  // ORIGIN timestamp so the normal fresh/stale machinery applies.
  const cacheStart = Date.now();
  // r34: drop L1 that predates the last task write on ANY instance (epoch
  // stamped by every write route). No-op without Redis.
  const lastWriteAt = await redisGetEpoch("tasks");
  if (lastWriteAt !== null) dropTasksCacheIfOlderThan(lastWriteAt);
  let c = getTasksCacheState();
  if (c.state === "missing") {
    const l2 = await redisGetJson<CachedSlice<SheetRow>>(REDIS_TASKS_KEY);
    // L2 entry that predates the last write is stale too — skip it.
    if (isCachedSlice<SheetRow>(l2) && (lastWriteAt === null || l2.at >= lastWriteAt)) {
      setTasksCache(l2.rows, l2.at);
      c = getTasksCacheState();
    }
  }
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
  const gen = tasksCacheGeneration();
  try {
    const tasks = await fetchTasks();
    const fetchMs = Date.now() - fetchStart;

    const parseStart = Date.now();
    // cache the FULL rows; project only the response. r34: only when no
    // write landed while we were fetching.
    if (setTasksCacheIfCurrent(tasks, gen, fetchStart)) {
      void redisSetJson(REDIS_TASKS_KEY, { at: fetchStart, rows: tasks }, REDIS_SLICE_TTL_SEC);
    }
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
      // r34 (audit): the emergency body has the SAME rows as the last good
      // 200 → same ETag → 304 → the browser replays its old body with
      // cacheState:"fresh" and the "ข้อมูลเก่า" warning never shows. Fold the
      // state into the ETag so a degraded reply is always sent in full.
      const etag = makeEtag("tasks", { state: "emergency-stale", rows: out });
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

    // No cache at all — return 502 like before. ไม่ใส่ key `tasks` (audit r33):
    // ฝั่งเว็บถือว่ามี key = ข้อมูลจริง แล้วเอา [] ทับรายการที่ยังใช้ได้.
    const totalMs = Date.now() - handlerStart;
    console.error("[dashboard/tasks] miss fetch failed (no cache)", { error, fetchMs, totalMs });
    return buildResponse({
      body: { cached: false, cacheState: "missing", error },
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
