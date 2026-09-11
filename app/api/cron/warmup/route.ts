import { NextResponse } from "next/server";
import { appsScriptCall } from "@/lib/appsScriptFetch";
import { parseRoomsCSV } from "@/lib/parseSheet";
import { setRoomsCache, setTasksCache } from "@/lib/dashboardCache";
import {
  redisSetJson, REDIS_ROOMS_KEY, REDIS_TASKS_KEY, REDIS_SLICE_TTL_SEC,
} from "@/lib/redisCache";
import type { RoomRow, SheetRow } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Warmup endpoint — keeps the Apps Script V8 isolate and the shared
 * caches warm so the first user after idle doesn't eat the full
 * cold-start (worst case 11.8s observed).
 *
 * audit r35: the previous version fetched /api/dashboard/* through HTTP
 * with no session cookie — every call got 401 at the auth() gate, so it
 * warmed nothing and had been logging `status: 401` silently. It now
 * calls the origins directly (no session needed) and seeds this
 * instance's L1 + the shared Redis L2, which every other instance
 * hydrates from.
 *
 * Trigger strategy:
 *   - Vercel Cron can't run this every 5 min on Hobby tier (daily only).
 *   - Recommended: an external uptime monitor (UptimeRobot / cron-job.org
 *     / Better Uptime — all have free tiers) hitting
 *     https://<your-domain>/api/cron/warmup every 5 min with header
 *     `Authorization: Bearer <CRON_SECRET>`.
 *
 * Auth: requires `Authorization: Bearer <CRON_SECRET>`.
 */

async function warmTasks(): Promise<number> {
  const j = await appsScriptCall<{ rows?: SheetRow[] }>("getTasks", {}, { idempotent: true, timeoutMs: 20_000 });
  if (!j.ok) throw new Error(j.error || "backend error");
  const rows = (j.result?.rows || []) as SheetRow[];
  const at = Date.now();
  setTasksCache(rows, at);
  void redisSetJson(REDIS_TASKS_KEY, { at, rows }, REDIS_SLICE_TTL_SEC);
  return rows.length;
}

async function warmRooms(): Promise<number> {
  const url = process.env.SHEET_ROOMS_CSV_URL || process.env.NEXT_PUBLIC_SHEET_ROOMS_CSV_URL;
  if (!url) throw new Error("SHEET_ROOMS_CSV_URL unset");
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows: RoomRow[] = parseRoomsCSV(await res.text());
  const at = Date.now();
  setRoomsCache(rows, at);
  void redisSetJson(REDIS_ROOMS_KEY, { at, rows }, REDIS_SLICE_TTL_SEC);
  return rows.length;
}

export async function GET(req: Request) {
  // Verify the request came from the scheduler — without this, anyone with
  // the URL could spam warmup pings and waste our Apps Script quota.
  const expected = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization");
  if (!expected || provided !== `Bearer ${expected}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const start = Date.now();
  const [tasks, rooms] = await Promise.allSettled([warmTasks(), warmRooms()]);
  const summary = {
    tasks: tasks.status === "fulfilled" ? { ok: true, rows: tasks.value } : { ok: false, error: String(tasks.reason) },
    rooms: rooms.status === "fulfilled" ? { ok: true, rows: rooms.value } : { ok: false, error: String(rooms.reason) },
  };
  const totalMs = Date.now() - start;
  console.info("[cron/warmup] done", { totalMs, ...summary });
  return NextResponse.json({ ok: true, ts: new Date().toISOString(), totalMs, ...summary });
}
