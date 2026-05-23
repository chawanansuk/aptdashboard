import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canPerform } from "@/lib/permissions";
import { appsScriptCall, AppsScriptError } from "@/lib/appsScriptFetch";
import type { Requisition } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Parts requisition log (v3.16.0).
 *
 * GET  /api/part-requisitions?partId=...  → { rows: Requisition[] }
 *      query optional; without it returns all
 * POST /api/part-requisitions { action: "add", partId, quantity,
 *                               building?, room?, taskKey?, note? }
 *
 * Server stamps `user` from session — client cannot spoof.
 * Permission: `part.edit` (engineer + management); same gate as
 * adjustStockPart since both deduct from inventory.
 *
 * Apps Script `addRequisition` atomically decrements part stock AND
 * appends the log row under the same `withWriteLock`, so concurrent
 * requisitions cannot double-deduct.
 */

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  if (!canPerform(session.user.roles, "part.view")) {
    return bad("ไม่มีสิทธิ์ดูบันทึกการเบิก", 403);
  }
  const url = new URL(req.url);
  const partId = url.searchParams.get("partId") || "";
  try {
    const json = await appsScriptCall<{ rows?: Requisition[] }>(
      "getRequisitions", { partId }, { idempotent: true },
    );
    if (!json.ok) return bad(json.error || "backend error", 502);
    return NextResponse.json({ rows: (json.result?.rows || []) as Requisition[] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = e instanceof AppsScriptError ? e.status : 502;
    return bad(`ดึงบันทึกการเบิกไม่สำเร็จ: ${msg}`, status);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  if (!canPerform(session.user.roles, "part.edit")) {
    return bad("ไม่มีสิทธิ์เบิกอะไหล่", 403);
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("invalid JSON");
  }
  const action = String(body.action || "").trim();
  if (action !== "add") return bad("action ต้องเป็น 'add'");

  const partId = String(body.partId || "").trim();
  const quantity = Number(body.quantity);
  if (!partId) return bad("partId required");
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return bad("quantity ต้องเป็นจำนวนบวก");
  }
  body.partId = partId;
  body.quantity = quantity;
  body.user = session.user.email;

  try {
    const json = await appsScriptCall("addRequisition", body);
    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = e instanceof AppsScriptError ? e.status : 502;
    return bad(`บันทึกการเบิกไม่สำเร็จ: ${msg}`, status);
  }
}
