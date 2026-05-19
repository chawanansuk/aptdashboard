import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { Role } from "@/auth";
import { canPerform, type Action } from "@/lib/permissions";
import { invalidateDashboardCache } from "@/lib/dashboardCache";
import { appsScriptCall, AppsScriptError } from "@/lib/appsScriptFetch";

export const runtime = "nodejs";

type Body = {
  action?: string;
  type?: string;
  [key: string]: unknown;
};

const SALES_TYPES = new Set(["ย้ายเข้า", "ย้ายออก", "ชมห้อง"]);
const ENG_TYPES   = new Set(["ทำสะอาด", "ซ่อม"]);

/** Map Apps Script action → permission Action. Null = not authorized. */
function actionToPermission(action: string): Action | null {
  switch (action) {
    case "addTask":          return "task.add";
    case "updateTask":       return "task.edit";
    case "updateTaskStatus": return "task.edit";
    case "deleteTask":       return "task.delete";
    case "updateRoomStatus": return "room.editStatus";
    case "debugFindTask":    return "task.edit";
    default:                 return null;
  }
}

/**
 * Defense in depth: even if client UI hides certain task types, refuse
 * server-side if role isn't allowed to create that type. Returns null
 * when ok, or an error message string when forbidden.
 */
function checkTaskTypePermission(action: string, type: string | undefined, roles: Role[] | undefined): string | null {
  if (action !== "addTask") return null;
  if (!type) return null; // ปล่อย Apps Script ตรวจ schema เอง
  const label = (roles || []).join("+") || "none";
  if (SALES_TYPES.has(type) && !canPerform(roles, "task.add.sales")) {
    return `role "${label}" ไม่มีสิทธิ์เพิ่มงานประเภท "${type}" (งานฝ่ายเซลส์)`;
  }
  if (ENG_TYPES.has(type) && !canPerform(roles, "task.add.eng")) {
    return `role "${label}" ไม่มีสิทธิ์เพิ่มงานประเภท "${type}" (งานฝ่ายช่าง)`;
  }
  return null;
}

export async function POST(req: Request) {
  // 1. Auth — all writes require login
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 }
    );
  }
  const roles = session.user.roles;
  const email = session.user.email;

  // 2. Parse body
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400 }
    );
  }

  const action = typeof body.action === "string" ? body.action : "";
  if (!action) {
    return NextResponse.json(
      { ok: false, error: "missing action" },
      { status: 400 }
    );
  }

  // 3. Role check (action-level) — via canPerform single source of truth
  const permAction = actionToPermission(action);
  if (!permAction || !canPerform(roles, permAction)) {
    const label = (roles || []).join("+") || "none";
    return NextResponse.json(
      { ok: false, error: `ไม่มีสิทธิ์สำหรับการกระทำนี้ (action=${action}, roles=${label})` },
      { status: 403 }
    );
  }

  // 3b. Role check (task-type level) — sales ห้ามส่ง type="ซ่อม", ฯลฯ
  const typeError = checkTaskTypePermission(action, typeof body.type === "string" ? body.type : undefined, roles);
  if (typeError) {
    return NextResponse.json({ ok: false, error: typeError }, { status: 403 });
  }

  // 4. Stamp creator from session — overrides anything client sent
  body.creator = email;

  // 5. Forward to Apps Script (retry + timeout via shared client)
  const { action: actionField, ...rest } = body;
  void actionField; // already captured in `action`
  try {
    const data = await appsScriptCall(action, rest as Record<string, unknown>);
    // Successful write → invalidate function-local dashboard cache so the
    // next /api/dashboard call refetches fresh data
    if (data && data.ok !== false) {
      invalidateDashboardCache();
    }
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof AppsScriptError) {
      return NextResponse.json(
        { ok: false, error: `write failed: ${err.message}` },
        { status: err.status }
      );
    }
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { ok: false, error: `write failed: ${message}` },
      { status: 502 }
    );
  }
}
