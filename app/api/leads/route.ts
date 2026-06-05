import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canPerform } from "@/lib/permissions";
import { appsScriptCall, AppsScriptError } from "@/lib/appsScriptFetch";
import { SwrSlot, serveCachedRows } from "@/lib/serverSwr";
import type { Lead } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-side SWR slot for the lead pipeline. Invalidated on every
// add / update / delete write.
const leadSlot = new SwrSlot<Lead[]>();

async function fetchLeads(): Promise<Lead[]> {
  const json = await appsScriptCall<{ rows?: Lead[] }>(
    "getLeads", {}, { idempotent: true },
  );
  if (!json.ok) throw new Error(json.error || "backend error");
  return (json.result?.rows || []) as Lead[];
}

/**
 * Lead CRM (v3.15.0 — Task 26).
 *
 * GET  /api/leads → { rows: Lead[] }
 * POST /api/leads { action: "add" | "update" | "delete", ...fields }
 *
 * Permissions: sales + management (`lead.edit`). Engineer doesn't see
 * the pipeline; route is also gated `leads: ["sales","management"]`.
 *
 * Server stamps `creator` from session email on writes.
 */

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  if (!canPerform(session.user.roles, "lead.edit")) {
    return bad("ไม่มีสิทธิ์เข้าถึงผู้สนใจเช่า", 403);
  }
  return serveCachedRows(leadSlot, fetchLeads, "ดึงข้อมูล Lead ไม่สำเร็จ", { req, etagTag: "leads" });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  if (!canPerform(session.user.roles, "lead.edit")) {
    return bad("ไม่มีสิทธิ์แก้ผู้สนใจเช่า", 403);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("invalid JSON");
  }

  const action = String(body.action || "").trim();
  if (action !== "add" && action !== "update" && action !== "delete") {
    return bad("action ต้องเป็น 'add', 'update' หรือ 'delete'");
  }

  let upstream: string;
  if (action === "add") {
    const name = String(body.name || "").trim();
    if (!name) return bad("name required");
    body.name = name;
    upstream = "addLead";
  } else if (action === "update") {
    const id = String(body.id || "").trim();
    if (!id) return bad("id required for update");
    body.id = id;
    upstream = "updateLead";
  } else {
    const id = String(body.id || "").trim();
    if (!id) return bad("id required for delete");
    body.id = id;
    upstream = "deleteLead";
  }
  body.creator = session.user.email;

  try {
    const json = await appsScriptCall(upstream, body);
    leadSlot.invalidate(); // next GET refetches the just-written data
    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = e instanceof AppsScriptError ? e.status : 502;
    return bad(`บันทึก Lead ไม่สำเร็จ: ${msg}`, status);
  }
}
