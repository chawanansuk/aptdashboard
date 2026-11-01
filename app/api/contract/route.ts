import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { canPerform } from "@/lib/permissions";
import { appsScriptCall, AppsScriptError } from "@/lib/appsScriptFetch";
import { bankFor } from "@/lib/bookingConfig";
import { buildContractFields, contractFileName, isContractPilot } from "@/lib/contractDraft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Draft lease for a customer to read after booking (Code.gs v3.40).
 *
 * GET  /api/contract?building=   → { pilot, template: { docUrl } | null }
 *      (docUrl only for managers — they edit the wording)
 * POST { action: "draft", …booking form }   → application/pdf
 *      header X-Contract-Sample: 1 while the template is still the sample
 * POST { action: "createTemplate", building } → { docUrl, created }   managers
 *
 * Who: anyone who can take a booking (room.editStatus) drafts; the
 * template is the owner's (tenant.edit = management). Only buildings in
 * CONTRACT_PILOT_BUILDINGS for now.
 */

const Name = z.string().trim().min(1).max(80);
const Money = z.number().min(0).max(10_000_000);

const Draft = z.object({
  action: z.literal("draft"),
  building: Name,
  room: Name,
  apartmentName: z.string().max(120).default(""),
  tenant: Name,
  phone: z.string().max(40).default(""),
  rent: Money,
  deposit: Money,
  bookingPaid: Money,
  moveInIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "moveInIso ต้องเป็น yyyy-MM-dd"),
  contractTerms: z.string().max(200).default(""),
  pet: z.string().max(200).default(""),
}).strip();

const CreateTemplate = z.object({ action: z.literal("createTemplate"), building: Name }).strip();
const Body = z.discriminatedUnion("action", [Draft, CreateTemplate]);

function bad(msg: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: msg, ...extra }, { status });
}

function upstream(e: unknown) {
  if (e instanceof AppsScriptError) {
    return bad(e.status === 504 ? "Google ตอบช้า — ลองกดอีกครั้ง" : `ทำร่างสัญญาไม่สำเร็จ: ${e.message}`, e.status);
  }
  return bad(e instanceof Error ? e.message : "unknown", 502);
}

/** Apps Script says NO_TEMPLATE when the building has no Doc yet. */
function noTemplate(error: string | undefined) {
  return bad((error || "").replace(/^NO_TEMPLATE:\s*/, "") || "ยังไม่มีแม่แบบสัญญาของตึกนี้", 404, { code: "no_template" });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  const roles = session.user.roles;
  if (!canPerform(roles, "room.editStatus")) return bad("ไม่มีสิทธิ์", 403);
  const building = new URL(req.url).searchParams.get("building")?.trim() || "";
  if (!building) return bad("building required");
  if (!isContractPilot(building)) return NextResponse.json({ ok: true, pilot: false, template: null });
  const manage = canPerform(roles, "tenant.edit");
  try {
    const j = await appsScriptCall<{ building: string; docUrl: string } | null>(
      "getContractTemplate", { building }, { idempotent: true, timeoutMs: 20_000 });
    if (!j.ok) return bad(j.error || "backend error", 502);
    const t = j.result ?? null;
    return NextResponse.json({
      ok: true, pilot: true, manage,
      template: t ? (manage ? { docUrl: t.docUrl } : {}) : null,
    });
  } catch (e) {
    return upstream(e);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  const roles = session.user.roles;
  if (!canPerform(roles, "room.editStatus")) return bad("ไม่มีสิทธิ์", 403);

  let raw: unknown;
  try { raw = await req.json(); } catch { return bad("invalid JSON"); }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return bad(parsed.error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง");
  const body = parsed.data;
  if (!isContractPilot(body.building)) return bad("ตึกนี้ยังไม่เปิดใช้ร่างสัญญา", 403);

  try {
    if (body.action === "createTemplate") {
      if (!canPerform(roles, "tenant.edit")) return bad("เฉพาะผู้จัดการ", 403);
      const j = await appsScriptCall<{ docUrl: string; created: boolean }>("createContractTemplate", {
        building: body.building,
        // The starter names the lessor after the building's account holder;
        // the owner corrects it in the Doc if that's not who signs.
        lessor: bankFor(body.building).accountName,
        creator: session.user.email,
      }, { timeoutMs: 45_000, maxRetries: 0 });
      if (!j.ok || !j.result) return bad(j.error || "สร้างแม่แบบไม่สำเร็จ", 502);
      return NextResponse.json({ ok: true, ...j.result });
    }

    const fields = buildContractFields(body);
    const j = await appsScriptCall<{ pdfBase64: string; sample: boolean }>("draftContract", {
      building: body.building, room: body.room, fields,
    }, { idempotent: true, timeoutMs: 50_000, maxRetries: 0 });
    if (!j.ok) return /NO_TEMPLATE/.test(j.error || "") ? noTemplate(j.error) : bad(j.error || "ทำร่างสัญญาไม่สำเร็จ", 502);
    if (!j.result?.pdfBase64) return bad("ไม่ได้ไฟล์ PDF กลับมา", 502);
    const pdf = Buffer.from(j.result.pdfBase64, "base64");
    const name = contractFileName(body);
    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
        "X-Contract-Sample": j.result.sample ? "1" : "0",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof AppsScriptError && /NO_TEMPLATE/.test(e.message)) return noTemplate(e.message);
    return upstream(e);
  }
}
