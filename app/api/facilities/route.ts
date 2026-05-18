import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAddEngTask } from "@/lib/permissions";
import { appsScriptCall, AppsScriptError } from "@/lib/appsScriptFetch";
import type { Facility } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Building-level facility tracking (v3.8.0).
 *
 * GET  /api/facilities → { rows: Facility[] }
 * POST /api/facilities { action: "add" | "update", ...fields }
 *
 * Permissions:
 *   - GET:  ทุก authenticated user (read-only)
 *   - POST: engineer + management only (canAddEngTask)
 *
 * Server stamps `creator` from session.user.email for any write.
 */

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);

  try {
    const json = await appsScriptCall<{ rows?: Facility[] }>(
      "getFacilities", {}, { idempotent: true }
    );
    if (!json.ok) return bad(json.error || "backend error", 502);
    const rows = (json.result?.rows || []) as Facility[];
    return NextResponse.json({ rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = e instanceof AppsScriptError ? e.status : 502;
    return bad(`ดึงข้อมูลสาธารณูปโภคไม่สำเร็จ: ${msg}`, status);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  if (!canAddEngTask(session.user.role)) {
    return bad("ไม่มีสิทธิ์เพิ่ม/แก้สาธารณูปโภค (เฉพาะ engineer และ management)", 403);
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

  if (action === "add") {
    const building = String(body.building || "").trim();
    const type = String(body.type || "").trim();
    if (!building) return bad("building required");
    if (!type) return bad("type required");
    body.building = building;
    body.type = type;
  } else {
    const id = String(body.id || "").trim();
    if (!id) return bad("id required for update");
    body.id = id;
  }

  body.creator = session.user.email;

  const upstreamAction = action === "add" ? "addFacility" : "updateFacility";

  try {
    const json = await appsScriptCall(upstreamAction, body);
    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = e instanceof AppsScriptError ? e.status : 502;
    return bad(`บันทึกสาธารณูปโภคไม่สำเร็จ: ${msg}`, status);
  }
}
