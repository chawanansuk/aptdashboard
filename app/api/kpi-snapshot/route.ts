import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAccess } from "@/lib/permissions";
import { redisEnabled, redisGetJson, redisSetJson } from "@/lib/redisCache";
import {
  DaySnapshotSchema, SNAPSHOT_DAYS, SNAPSHOT_TTL_SEC,
  lastBangkokDates, snapshotRedisKey, type DaySnapshot,
} from "@/lib/kpiSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily sales-KPI counts (lib/kpiSnapshot). Same audience as the sales
 * page itself (sales + management). Without Redis both methods answer
 * `{ ok: true, enabled: false }` and the cards simply draw no line.
 *
 *   GET  → { days: [{ date, snapshot | null }] } for the previous
 *          SNAPSHOT_DAYS-1 Bangkok days (today is live on the page).
 *   POST { snapshot } → stores it as TODAY's (Bangkok) counts. The date
 *          is the server's, never the client's, so nobody can backfill
 *          or rewrite another day.
 */

async function gate() {
  const session = await auth();
  if (!session?.user?.email) return { res: NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 }) };
  if (!canAccess(session.user.roles, "salespipeline")) {
    return { res: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }) };
  }
  return { res: null };
}

export async function GET() {
  const { res } = await gate();
  if (res) return res;
  if (!redisEnabled()) return NextResponse.json({ ok: true, enabled: false, days: [] });
  const dates = lastBangkokDates(SNAPSHOT_DAYS).slice(0, -1); // today is live
  const snaps = await Promise.all(dates.map((d) => redisGetJson<DaySnapshot>(snapshotRedisKey(d))));
  return NextResponse.json({
    ok: true,
    enabled: true,
    days: dates.map((date, i) => ({ date, snapshot: snaps[i] ?? null })),
  });
}

export async function POST(req: Request) {
  const { res } = await gate();
  if (res) return res;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }
  const parsed = DaySnapshotSchema.safeParse((body as { snapshot?: unknown } | null)?.snapshot);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message || "invalid snapshot" }, { status: 400 });
  }
  if (!redisEnabled()) return NextResponse.json({ ok: true, enabled: false });
  const today = lastBangkokDates(1)[0];
  await redisSetJson(snapshotRedisKey(today), parsed.data, SNAPSHOT_TTL_SEC);
  return NextResponse.json({ ok: true, enabled: true, date: today });
}
