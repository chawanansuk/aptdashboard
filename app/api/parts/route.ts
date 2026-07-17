import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAddEngTask } from "@/lib/permissions";
import { appsScriptCall, AppsScriptError } from "@/lib/appsScriptFetch";
import { serveCachedRows } from "@/lib/serverSwr";
import { partsSlot } from "@/lib/partsCache";
import type { Part } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fetchParts(): Promise<Part[]> {
  const json = await appsScriptCall<{ rows?: Part[] }>(
    "getParts", {}, { idempotent: true },
  );
  if (!json.ok) throw new Error(json.error || "backend error");
  return (json.result?.rows || []) as Part[];
}

/**
 * Spare-parts inventory (v3.11.0 — Task 37).
 *
 * GET  /api/parts → { rows: Part[] }
 * POST /api/parts { action: "add" | "update" | "adjust", ...fields }
 *
 * Permissions:
 *   - GET:  authenticated users (read-only)
 *   - POST: engineer + management only (canAddEngTask)
 *
 * Server stamps `creator` from session.user.email on writes.
 *
 * "adjust" is the common-case stock change — pass { id, delta } where
 * delta is a signed integer (e.g. -1 used, +5 restocked). Atomic
 * under withWriteLock in Apps Script so concurrent edits don't lose
 * updates.
 */

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  // INTENTIONALLY auth-only (audit r7 considered gating this to
  // part.view and backed out): sales files quick-repairs on behalf of
  // engineers (ทิศ B) and the repair form's parts picker reads this
  // list — a role gate here would silently remove parts logging from
  // the sales flow. The inventory carries no PII; the requisition LOG
  // (/api/part-requisitions) stays gated to part.view.
  return serveCachedRows(partsSlot, fetchParts, "ดึงข้อมูลอะไหล่ไม่สำเร็จ", { req, etagTag: "parts" });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  if (!canAddEngTask(session.user.roles)) {
    return bad("ไม่มีสิทธิ์เพิ่ม/แก้อะไหล่ (เฉพาะ engineer และ management)", 403);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("invalid JSON");
  }

  const action = String(body.action || "").trim();
  if (action !== "add" && action !== "update" && action !== "adjust") {
    return bad("action ต้องเป็น 'add', 'update' หรือ 'adjust'");
  }

  let upstreamAction: string;
  if (action === "add") {
    const name = String(body.name || "").trim();
    if (!name) return bad("name required");
    body.name = name;
    upstreamAction = "addPart";
  } else if (action === "update") {
    const id = String(body.id || "").trim();
    if (!id) return bad("id required for update");
    body.id = id;
    upstreamAction = "updatePart";
  } else {
    const id = String(body.id || "").trim();
    if (!id) return bad("id required for adjust");
    const delta = Number(body.delta);
    if (!Number.isFinite(delta) || delta === 0) {
      return bad("delta required (non-zero number)");
    }
    body.id = id;
    body.delta = delta;
    upstreamAction = "adjustStockPart";
  }

  body.creator = session.user.email;

  try {
    const json = await appsScriptCall(upstreamAction, body);
    partsSlot.invalidate(); // next GET refetches the just-written data
    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = e instanceof AppsScriptError ? e.status : 502;
    return bad(`บันทึกอะไหล่ไม่สำเร็จ: ${msg}`, status);
  }
}
