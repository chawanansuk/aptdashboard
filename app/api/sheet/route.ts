import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canViewTenant } from "@/lib/permissions";
import { appsScriptCall, AppsScriptError } from "@/lib/appsScriptFetch";
import type { SheetRow } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // ไม่ cache
export const maxDuration = 60;

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  // Returns raw task rows incl. customer name + phone (PII), unstripped.
  // Gate on tenant.view so non-management can't pull the customer list.
  if (!canViewTenant(session.user.roles)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    // audit r27 HIGH: เดิม fetch ตรง ไม่ส่ง secret/ไม่มี timeout — พอเปิด
    // SHARED_SECRET หลังบ้านตอบ unauthorized → backup ZIP ได้ tasks.csv ว่าง
    // แต่ toast บอก "สำเร็จ". ใช้ตัวเรียกกลางเหมือนทุก route.
    const json = await appsScriptCall<{ rows?: SheetRow[] }>("getTasks", {}, { idempotent: true });
    if (!json.ok) throw new AppsScriptError(json.error || "backend error", 502);
    return NextResponse.json({ rows: json.result?.rows ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    const status = err instanceof AppsScriptError ? err.status : 502;
    return NextResponse.json(
      { error: `ดึงข้อมูลไม่สำเร็จ: ${message}` },
      { status }
    );
  }
}
