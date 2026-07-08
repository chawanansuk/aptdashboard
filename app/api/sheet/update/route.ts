import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { Role } from "@/auth";
import { canPerform, type Action } from "@/lib/permissions";
import { invalidateDashboardCache } from "@/lib/dashboardCache";
import { appsScriptCall, AppsScriptError } from "@/lib/appsScriptFetch";
import {
  SheetUpdateBodySchema,
  formatSheetUpdateError,
  type SheetUpdateBody,
} from "@/lib/sheetUpdateSchema";

export const runtime = "nodejs";
// Apps Script can take >15s on a cold start while holding the write
// lock; give the function room so our upstream timeout (below) fires
// before the platform kills the route mid-write.
export const maxDuration = 60;

/**
 * Write actions that are SAFE to retry after a timeout/abort: they SET
 * state on an existing row, so replaying one converges to the same
 * result. Appends (addTask etc.) stay non-retryable — replaying those
 * duplicates rows (the bug class fixed in the dup-append guard).
 * This is what un-flakes bulk status updates: a cold-start 15s+ write
 * used to surface as "This operation was aborted (HTTP 502)".
 */
const IDEMPOTENT_WRITE_ACTIONS = new Set([
  "updateTask", "updateTaskStatus",
  "updateRoomStatus", "updateRoomData", "bookRoom", "releaseRoom",
]);

const SALES_TYPES = new Set(["ย้ายเข้า", "ย้ายออก", "ชมห้อง"]);
const CLEAN_TYPES = new Set(["ทำสะอาด"]);
const ENG_TYPES   = new Set(["ซ่อม"]);

/** Map Apps Script action → permission Action. Null = not authorized. */
function actionToPermission(action: SheetUpdateBody["action"]): Action | null {
  switch (action) {
    case "addTask":          return "task.add";
    case "updateTask":       return "task.edit";
    case "updateTaskStatus": return "task.edit";
    case "deleteTask":       return "task.delete";
    // Room writes split three ways (see field guard below + Code.gs):
    //   updateRoomStatus → status/note only (sales+mgmt)
    //   bookRoom         → booking bundle: status+tenant+phone+price (sales+mgmt)
    //   updateRoomData   → free-form room edit incl. contract (management only)
    case "updateRoomStatus": return "room.editStatus";
    case "bookRoom":         return "room.editStatus";
    //   releaseRoom      → ปล่อยขาย: status→ว่าง + server-side tenant blank
    //                      (schema carries no PII; Apps Script forces the
    //                      blanking — sales can erase, never fabricate)
    case "releaseRoom":      return "room.editStatus";
    case "updateRoomData":   return "tenant.edit";
    case "debugFindTask":    return "task.edit";
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
  if (CLEAN_TYPES.has(type) && !canPerform(roles, "task.add.clean")) {
    return `role "${label}" ไม่มีสิทธิ์เพิ่มงานประเภท "${type}" (งานทำสะอาด)`;
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

  // 2. Parse + validate body. The discriminated-union schema covers all
  //    six actions, strips unknown fields, and rejects malformed payloads
  //    before we burn an Apps Script call. `safeParse` keeps the throw
  //    in one place so we can format the issue path Thai-friendly.
  let rawJson: unknown;
  try {
    rawJson = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400 }
    );
  }
  const parsed = SheetUpdateBodySchema.safeParse(rawJson);
  if (!parsed.success) {
    // An unrecognized action lands here too (the union has no match) —
    // safer than the old "missing action" check because it can't get
    // out of sync with the action list above.
    return NextResponse.json(
      { ok: false, error: formatSheetUpdateError(parsed.error) },
      { status: 400 }
    );
  }
  const body = parsed.data;
  const action = body.action;

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
  const typeForPerm = "type" in body && typeof body.type === "string" ? body.type : undefined;
  const typeError = checkTaskTypePermission(action, typeForPerm, roles);
  if (typeError) {
    return NextResponse.json({ ok: false, error: typeError }, { status: 403 });
  }

  // 3c. Field-level guard for room writes (defense in depth — the room
  // edit form is already management-gated in the UI, but the trust
  // boundary is here). Only updateRoomData (tenant.edit / management) may
  // write tenant identity, contract, and price freely. bookRoom (sales)
  // writes the tenant/phone/price booking bundle but never a contract.
  // updateRoomStatus is status+note only, so a raw sales POST can't
  // overwrite tenant PII or rent through the status path.
  if (action === "updateRoomStatus") {
    delete body.tenant;
    delete body.phone;
    delete body.contractEnd;
    delete body.price;
  } else if (action === "bookRoom") {
    delete body.contractEnd;
  }

  // 4. Stamp creator from session — overrides anything client sent
  //    (schema doesn't include `creator`; we attach after validation).
  const { action: actionField, ...rest } = body as SheetUpdateBody & { action: string };
  void actionField;
  const payload: Record<string, unknown> = { ...rest, creator: email };

  // 4b. Bridge the nested `match` identity object to the FLAT names Apps
  //     Script actually reads — updateTask_ looks at b.matchDate/matchType/
  //     matchBuilding/matchRoom, and deleteTask_'s findAllTaskRows_ looks
  //     at b.date/type/building/room. Nothing upstream ever translated
  //     the nested form, so nested-match callers (repair-log drawer,
  //     TasksList delete) silently hit "task not found" while flat-form
  //     callers (EditTaskModal) were rejected by the old schema. The
  //     schema now accepts both; this makes both actually WORK.
  const match = (payload.match ?? null) as
    | { date: string; type: string; building: string; room: string }
    | null;
  if (match) {
    if (action === "updateTask") {
      payload.matchDate = match.date;
      payload.matchType = match.type;
      payload.matchBuilding = match.building;
      payload.matchRoom = match.room;
    } else if (action === "deleteTask") {
      // deleteTask has no separate "new values" — the 4-tuple IS the
      // identity, so map straight onto the top-level keys it matches by.
      payload.date = match.date;
      payload.type = match.type;
      payload.building = match.building;
      payload.room = match.room;
    }
    delete payload.match;
  }

  // 5. Forward to Apps Script (retry + timeout via shared client).
  //    Set-style writes get a longer window + retries (safe to replay);
  //    appends keep the strict single-shot 15s (no dup risk).
  try {
    const data = await appsScriptCall(action, payload, {
      idempotent: IDEMPOTENT_WRITE_ACTIONS.has(action),
      timeoutMs: IDEMPOTENT_WRITE_ACTIONS.has(action) ? 20_000 : undefined,
    });
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
