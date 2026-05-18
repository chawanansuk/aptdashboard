import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAddEngTask } from "@/lib/permissions";
import { appsScriptCall, AppsScriptError } from "@/lib/appsScriptFetch";
import type { RoomEquipment } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cross-project maintenance list. Returns ALL equipment across all rooms
 * so the UI can compute next-service-date + status badges client-side.
 *
 * GET /api/maintenance-plan → { rows: RoomEquipment[] }
 *
 * Permissions: engineer + management only.
 */

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  if (!canAddEngTask(session.user.role)) {
    return bad("ไม่มีสิทธิ์ดูแผนบำรุง (เฉพาะ engineer และ management)", 403);
  }

  try {
    const json = await appsScriptCall<{ rows?: RoomEquipment[] }>(
      "getAllEquipment", {}, { idempotent: true }
    );
    if (!json.ok) return bad(json.error || "backend error", 502);
    const rows = (json.result?.rows || []) as RoomEquipment[];
    return NextResponse.json({ rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = e instanceof AppsScriptError ? e.status : 502;
    return bad(`ดึงแผนบำรุงไม่สำเร็จ: ${msg}`, status);
  }
}
