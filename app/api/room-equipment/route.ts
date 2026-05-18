import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAddEngTask } from "@/lib/permissions";
import { appsScriptCall, AppsScriptError } from "@/lib/appsScriptFetch";
import type { RoomEquipment } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-room equipment endpoint.
 *
 * GET  /api/room-equipment?building=X&room=Y → { rows: RoomEquipment[] }
 * POST /api/room-equipment { action: "add" | "update", ...fields }
 *
 * Forwards to Apps Script. Apps Script auto-creates the 'อุปกรณ์' tab
 * on first write.
 *
 * Permissions:
 *   - GET (read):  ทุก authenticated user
 *   - POST (write): engineer + management only (canAddEngTask)
 *
 * Server stamps `creator` from session.user.email for any write.
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

  try {
    const json = await appsScriptCall<{ rows?: RoomEquipment[] }>(
      "getRoomEquipment", { building, room }, { idempotent: true }
    );
    if (!json.ok) return bad(json.error || "backend error", 502);
    const rows = (json.result?.rows || []) as RoomEquipment[];
    return NextResponse.json({ rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = e instanceof AppsScriptError ? e.status : 502;
    return bad(`ดึงข้อมูลอุปกรณ์ไม่สำเร็จ: ${msg}`, status);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  const role = session.user.role;
  if (!canAddEngTask(role)) {
    return bad("ไม่มีสิทธิ์เพิ่ม/แก้อุปกรณ์ (เฉพาะ engineer และ management)", 403);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("invalid JSON");
  }

  const action = String(body.action || "").trim();
  if (action !== "add" && action !== "update") {
    return bad("action ต้องเป็น 'add' หรือ 'update'");
  }

  // Common validation
  if (action === "add") {
    const building = String(body.building || "").trim();
    const room = String(body.room || "").trim();
    const type = String(body.type || "").trim();
    if (!building || !room) return bad("building/room required");
    if (!type) return bad("type required");
    body.building = building;
    body.room = room;
    body.type = type;
  } else if (action === "update") {
    const id = String(body.id || "").trim();
    if (!id) return bad("id required for update");
    body.id = id;
  }

  // Stamp creator from session (defense in depth)
  body.creator = session.user.email;

  const upstreamAction = action === "add" ? "addEquipment" : "updateEquipment";

  try {
    const json = await appsScriptCall(upstreamAction, body);
    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = e instanceof AppsScriptError ? e.status : 502;
    return bad(`บันทึกอุปกรณ์ไม่สำเร็จ: ${msg}`, status);
  }
}
