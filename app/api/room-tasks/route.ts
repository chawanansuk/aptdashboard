import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { appsScriptCall, AppsScriptError } from "@/lib/appsScriptFetch";
import { canViewTaskCustomer } from "@/lib/permissions";
import type { SheetRow } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/room-tasks?building=X&room=Y — FULL task history for one room.
 *
 * v3.22: the dashboard task feed (getTasks) is windowed server-side
 * (open tasks + last 120 days) so the payload stops growing with the
 * sheet. The RoomModal's ประวัติงาน list and completed-cost totals need
 * older rows too — this endpoint returns one room's complete history
 * lazily when the modal opens (small payload, read-only).
 *
 * On a pre-3.22 backend the action is unknown → we return ok:false and
 * the client silently falls back to the (windowed) feed data.
 *
 * PII parity with /api/dashboard/tasks: customer name + phone are
 * stripped for roles that can't view them.
 */

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);

  const url = new URL(req.url);
  const building = (url.searchParams.get("building") || "").trim();
  const room = (url.searchParams.get("room") || "").trim();
  if (!building || !room) return bad("building/room required");
  if (building.length > 40 || room.length > 60) return bad("invalid building/room");

  const canSeeCustomer = canViewTaskCustomer(session.user.roles);

  try {
    const json = await appsScriptCall<{ rows?: SheetRow[] }>(
      "getRoomTasks", { building, room }, { idempotent: true, timeoutMs: 10_000 },
    );
    if (!json.ok) {
      // Old backend (unknown action) or upstream error — the client
      // falls back to feed data, so a 200 with ok:false keeps it quiet.
      return NextResponse.json({ ok: false, error: json.error || "backend error" });
    }
    const rows = (json.result?.rows || []) as SheetRow[];
    const out = canSeeCustomer
      ? rows
      : rows.map((t) => ({ ...t, customer: "", phone: "" }));
    return NextResponse.json(
      { ok: true, rows: out },
      // Private per-role response; history changes rarely — small cache.
      { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = e instanceof AppsScriptError ? e.status : 502;
    return bad(`โหลดประวัติห้องไม่สำเร็จ: ${msg}`, status);
  }
}
