import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAddEngTask } from "@/lib/permissions";
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

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  if (!canAddEngTask(session.user.role)) {
    return bad("ไม่มีสิทธิ์ดูแผนบำรุง (เฉพาะ engineer และ management)", 403);
  }

  try {
    const res = await appsScript("getAllEquipment", {});
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
    return bad(`ดึงแผนบำรุงไม่สำเร็จ: ${msg}`, 502);
  }
}
