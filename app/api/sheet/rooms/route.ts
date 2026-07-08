import { NextResponse } from "next/server";
import { parseRoomsCSV } from "@/lib/parseSheet";
import { auth } from "@/auth";
import { canViewTenant } from "@/lib/permissions";
import type { RoomRow } from "@/types";

export const dynamic = "force-dynamic"; // CSV cache อยู่ที่ Google ฝั่ง publish; เราไม่ cache ซ้ำ

/**
 * Try Apps Script `getRooms` first (real-time, requires Code.gs v3.4.3+).
 * Falls back to CSV publish (subject to ~5 minute Google cache) so older
 * Apps Script deployments still work without redeployment.
 */
async function tryAppsScriptRooms(): Promise<RoomRow[] | null> {
  const url = process.env.SHEET_WRITE_URL;
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getRooms" }),
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    if (!json || !json.ok) return null;
    const rows = json.result?.rows;
    if (!Array.isArray(rows)) return null;
    return rows as RoomRow[];
  } catch {
    return null;
  }
}

async function fetchCsvRooms(): Promise<RoomRow[]> {
  // Prefer the server-only name; NEXT_PUBLIC_* fallback kept for existing
  // deployments. The publish-to-web CSV carries tenant PII, so the env
  // must never actually be NEXT_PUBLIC-exposed in client code — rename
  // the Vercel var to SHEET_ROOMS_CSV_URL when convenient (.env.example).
  const url = process.env.SHEET_ROOMS_CSV_URL || process.env.NEXT_PUBLIC_SHEET_ROOMS_CSV_URL;
  if (!url) throw new Error("ยังไม่ได้ตั้งค่า NEXT_PUBLIC_SHEET_ROOMS_CSV_URL (ชีตห้อง)");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const csv = await res.text();
  return parseRoomsCSV(csv);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  // This endpoint returns RAW rooms incl. tenant name + phone (PII). Unlike
  // /api/dashboard/rooms it does not strip — its only caller is the
  // management backup — so gate it on tenant.view. Non-management get 403
  // (backupZip treats that as an empty CSV).
  if (!canViewTenant(session.user.roles)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    // Real-time path
    const fromAppsScript = await tryAppsScriptRooms();
    if (fromAppsScript) {
      return NextResponse.json({ rooms: fromAppsScript, source: "apps-script" });
    }
    // Fallback (older Code.gs without `getRooms` — Google CSV cache ~5min)
    const fromCsv = await fetchCsvRooms();
    return NextResponse.json({ rooms: fromCsv, source: "csv" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { error: `ดึงข้อมูลห้องไม่สำเร็จ: ${message}` },
      { status: 502 }
    );
  }
}
