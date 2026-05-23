import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAddEngTask } from "@/lib/permissions";
import { appsScriptCall, AppsScriptError } from "@/lib/appsScriptFetch";
import type { RecurringTemplate } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Recurring task templates (v3.17.0). Engineer + management can
 * CRUD these; runCheck creates tasks for any template whose
 * `nextRunDate <= today`.
 *
 * GET  /api/recurring → { rows: RecurringTemplate[] }
 * POST /api/recurring { action: "add" | "delete" | "run", ...fields }
 *   - add: name, type, building, room, intervalDays, note?
 *   - delete: id
 *   - run: no body — runs the check, returns { created, skipped }
 */

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  if (!canAddEngTask(session.user.roles)) {
    return bad("ไม่มีสิทธิ์ดูงานประจำ", 403);
  }
  try {
    const json = await appsScriptCall<{ rows?: RecurringTemplate[] }>(
      "getRecurring", {}, { idempotent: true },
    );
    if (!json.ok) return bad(json.error || "backend error", 502);
    return NextResponse.json({ rows: (json.result?.rows || []) as RecurringTemplate[] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = e instanceof AppsScriptError ? e.status : 502;
    return bad(`ดึงงานประจำไม่สำเร็จ: ${msg}`, status);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  if (!canAddEngTask(session.user.roles)) {
    return bad("ไม่มีสิทธิ์แก้งานประจำ", 403);
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("invalid JSON");
  }
  const action = String(body.action || "").trim();
  if (action !== "add" && action !== "delete" && action !== "run") {
    return bad("action ต้องเป็น 'add', 'delete' หรือ 'run'");
  }
  let upstream: string;
  if (action === "add") {
    const name = String(body.name || "").trim();
    const type = String(body.type || "").trim();
    const interval = Number(body.intervalDays);
    if (!name) return bad("name required");
    if (!type) return bad("type required");
    if (!Number.isFinite(interval) || interval <= 0) {
      return bad("intervalDays must be a positive number");
    }
    body.name = name;
    body.type = type;
    body.intervalDays = interval;
    upstream = "addRecurring";
  } else if (action === "delete") {
    const id = String(body.id || "").trim();
    if (!id) return bad("id required");
    body.id = id;
    upstream = "deleteRecurring";
  } else {
    upstream = "runRecurringCheck";
  }
  body.creator = session.user.email;
  body.user = session.user.email;

  try {
    const json = await appsScriptCall(upstream, body);
    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = e instanceof AppsScriptError ? e.status : 502;
    return bad(`บันทึก/รันงานประจำไม่สำเร็จ: ${msg}`, status);
  }
}
