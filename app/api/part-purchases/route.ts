import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canPerform } from "@/lib/permissions";
import { appsScriptCall, AppsScriptError } from "@/lib/appsScriptFetch";
import { etagJsonResponse } from "@/lib/etagJsonResponse";
import { partsSlot } from "@/lib/partsCache";
import type { Purchase } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// r27: Vercel default (10-15s) สั้นกว่า timeout ของ appsScriptCall → function
// ถูกฆ่าก่อนโค้ดจับ error ผู้ใช้เจอ 504 เปล่าๆ. 60s = เพดาน Hobby.
export const maxDuration = 60;

/**
 * Purchase log (v3.28.0) — จดการซื้อของเข้าสต๊อกพร้อมราคาที่จ่ายจริง
 * ต่อครั้ง เพื่อดูแนวโน้มต้นทุนของสิ้นเปลืองรายเดือน (ทริปแมคโคร ฯลฯ).
 *
 * GET  /api/part-purchases?partId=...  → { rows: Purchase[] } (ใหม่สุดก่อน)
 * POST /api/part-purchases { action: "add", partId, quantity,
 *                            totalPrice?, store?, date? }
 *
 * Server stamps `user` from session — client cannot spoof.
 * Permission: view = part.view (เจ้าของเคาะ: ทุก role เห็นราคา/แนวโน้ม),
 * write = part.edit (เกทเดียวกับเติมสต๊อก).
 *
 * Apps Script `addPurchase` ทำ บวกสต๊อก + จดบันทึก + อัปเดตราคา/หน่วย
 * ใต้ write lock เดียว — ยิงพร้อมกันไม่ทับกัน.
 */

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  if (!canPerform(session.user.roles, "part.view")) {
    return bad("ไม่มีสิทธิ์ดูบันทึกการซื้อ", 403);
  }
  const url = new URL(req.url);
  const partId = url.searchParams.get("partId") || "";
  try {
    const json = await appsScriptCall<{ rows?: Purchase[] }>(
      "getPurchases", { partId }, { idempotent: true },
    );
    if (!json.ok) return bad(json.error || "backend error", 502);
    // Code.gs คืน ok_({rows}) = rows อยู่ระดับบน (ไม่ห่อ result เหมือน
    // getRequisitions) — อ่านได้ทั้งสองแบบ (audit r27 HIGH: เดิมอ่านแต่
    // result.rows → ประวัติซื้อว่างตลอด ▲▼ ไม่เคยโชว์)
    const j = json as { result?: { rows?: Purchase[] }; rows?: Purchase[] };
    const rows = (j.result?.rows ?? j.rows ?? []) as Purchase[];
    return etagJsonResponse({ rows }, req, { tag: "purchases" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = e instanceof AppsScriptError ? e.status : 502;
    return bad(`ดึงบันทึกการซื้อไม่สำเร็จ: ${msg}`, status);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  if (!canPerform(session.user.roles, "part.edit")) {
    return bad("ไม่มีสิทธิ์บันทึกการซื้อ", 403);
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
  // ราคา optional (ลูกน้องบางคนไม่มีบิลในมือ) แต่ถ้าใส่ต้องเป็นเลข ≥ 0
  if (body.totalPrice !== undefined && body.totalPrice !== null && body.totalPrice !== "") {
    const tp = Number(body.totalPrice);
    if (!Number.isFinite(tp) || tp < 0) return bad("totalPrice ต้องเป็นตัวเลข");
    body.totalPrice = tp;
  }
  body.partId = partId;
  body.quantity = quantity;
  body.store = String(body.store || "").trim().slice(0, 80);
  body.user = session.user.email;

  try {
    // Non-idempotent append (เหมือน addRequisition) — ไม่ auto-retry
    const json = await appsScriptCall("addPurchase", body);
    // สต๊อกเปลี่ยนแล้ว — บัสต์ cache ของ /api/parts เหมือน requisition
    partsSlot.invalidate();
    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = e instanceof AppsScriptError ? e.status : 502;
    return bad(`บันทึกการซื้อไม่สำเร็จ: ${msg}`, status);
  }
}
