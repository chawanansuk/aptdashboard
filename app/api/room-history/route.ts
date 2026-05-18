import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAddTask } from "@/lib/permissions";
import type { RoomHistoryEntry } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-room history endpoint.
 *
 * GET  /api/room-history?building=X&room=Y → { rows: RoomHistoryEntry[] }
 * POST /api/room-history { building, room, date?, type?, description?, cost?, photoUrl? }
 *
 * Both forward to the Apps Script Web App (SHEET_WRITE_URL) which talks
 * directly to the `ประวัติ` tab. Apps Script v3.5.0+ auto-creates the
 * tab on first write.
 *
 * Auth: every authenticated user can read + write. Server stamps `creator`
 * from session (overrides any client-supplied value). No role gate yet —
 * use canAddTask for symmetry with task add permission.
 */

async function appsScript(action: string, body: Record<string, unknown>): Promise<Response> {
  const url = process.env.SHEET_WRITE_URL;
  if (!url) throw new Error("ยังไม่ได้ตั้งค่า SHEET_WRITE_URL");
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
    cache: "no-store",
    redirect: "follow",
  });
}

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

  try {
    const res = await appsScript("getRoomHistory", { building, room });
    if (!res.ok) return bad(`upstream HTTP ${res.status}`, 502);
    const json = await res.json().catch(() => null);
    if (!json || !json.ok) return bad(json?.error || "backend error", 502);
    const rows = (json.result?.rows || []) as RoomHistoryEntry[];
    return NextResponse.json({ rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return bad(`ดึงประวัติไม่สำเร็จ: ${msg}`, 502);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  const role = session.user.role;
  if (!canAddTask(role)) return bad("ไม่มีสิทธิ์เพิ่มประวัติ", 403);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("invalid JSON");
  }

  const building = String(body.building || "").trim();
  const room = String(body.room || "").trim();
  if (!building || !room) return bad("building/room required");

  // Stamp creator from session (defense in depth: ignore any client value)
  body.creator = session.user.email;
  body.building = building;
  body.room = room;

  try {
    const res = await appsScript("addRoomHistory", body);
    if (!res.ok) return bad(`upstream HTTP ${res.status}`, 502);
    const json = await res.json().catch(() => null);
    if (!json) return bad("invalid upstream JSON", 502);
    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return bad(`บันทึกประวัติไม่สำเร็จ: ${msg}`, 502);
  }
}
