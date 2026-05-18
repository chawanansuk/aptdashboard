import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAddEngTask } from "@/lib/permissions";
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
    const res = await appsScript("getRoomEquipment", { building, room });
    if (!res.ok) return bad(`upstream HTTP ${res.status}`, 502);
    const text = await res.text();
    let json: { ok?: boolean; error?: string; result?: { rows?: unknown } } | null = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    if (!json || !json.ok) {
      return bad(json?.error || "backend error", 502);
    }
    const rows = (json.result?.rows || []) as RoomEquipment[];
    return NextResponse.json({ rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return bad(`ดึงข้อมูลอุปกรณ์ไม่สำเร็จ: ${msg}`, 502);
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
    const res = await appsScript(upstreamAction, body);
    if (!res.ok) return bad(`upstream HTTP ${res.status}`, 502);
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch {
      return bad("ตอบกลับไม่ใช่ JSON (ตรวจ Apps Script access setting)", 502);
    }
    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return bad(`บันทึกอุปกรณ์ไม่สำเร็จ: ${msg}`, 502);
  }
}
