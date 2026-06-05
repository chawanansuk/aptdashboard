import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isManagement } from "@/lib/permissions";
import { appsScriptCall, AppsScriptError } from "@/lib/appsScriptFetch";
import { etagJsonResponse } from "@/lib/etagJsonResponse";
import type { AuditEntry } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Audit log read-only API (v3.17.0 — Task 18). Management-only because
 * the log includes user emails + write history of every privileged op.
 *
 * GET /api/audit?limit=200 → { rows: AuditEntry[] }
 *   - rows are returned newest-first (Apps Script reads bottom-up)
 *   - default limit 200; max 1000
 */

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  if (!isManagement(session.user.roles)) {
    return bad("ไม่มีสิทธิ์ดู audit log (เฉพาะ management)", 403);
  }
  const url = new URL(req.url);
  const limitRaw = parseInt(url.searchParams.get("limit") || "200", 10);
  const limit = Math.min(1000, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 200));
  try {
    const json = await appsScriptCall<{ rows?: AuditEntry[] }>(
      "getAudit", { limit }, { idempotent: true },
    );
    if (!json.ok) return bad(json.error || "backend error", 502);
    const rows = (json.result?.rows || []) as AuditEntry[];
    return etagJsonResponse({ rows }, req, { tag: "audit" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = e instanceof AppsScriptError ? e.status : 502;
    return bad(`ดึง audit log ไม่สำเร็จ: ${msg}`, status);
  }
}
