import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { canAccess, canPerform } from "@/lib/permissions";
import { appsScriptCall, AppsScriptError } from "@/lib/appsScriptFetch";
import {
  computeBill, isMonthKey,
  type BillingRate, type MeterRow,
} from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Billing (v3.39) — meter readings → bill → payment.
 *
 * GET  /api/billing?month=yyyy-MM
 *   → { month, rows, prevRows, rates }. Roles without finance.view get
 *     readings and units only: no baht, no payment dates, no rates.
 *
 * POST { action: "saveReadings", month, items[] }   any billing role
 *      { action: "setPaid", month, building, room, paidDate }   finance
 *      { action: "setRate", building, elecRate, waterRate, waterMin, dueDay }   finance
 *
 * Amounts are computed HERE with lib/billing from the rates stored in the
 * sheet — a client can send readings, never totals. Rent: a manager's
 * edit, else what the row already has, else the room's listed price.
 */

interface BillingData {
  month: string;
  rows: MeterRow[];
  prevRows: Pick<MeterRow, "building" | "room" | "elecCur" | "waterCur">[];
  rates: BillingRate[];
}

const Money = z.number().min(0).max(10_000_000);
const Reading = z.number().min(0).max(100_000_000).nullable();
const Month = z.string().refine(isMonthKey, "month ต้องเป็น yyyy-MM");
const Name = z.string().trim().min(1).max(60);

const ReadingItem = z.object({
  building: Name,
  room: Name,
  elecPrev: Reading.optional(),
  elecCur: Reading.optional(),
  waterPrev: Reading.optional(),
  waterCur: Reading.optional(),
  /** The room's listed price — rent when the row has none yet. */
  roomPrice: Money.nullable().optional(),
  // finance-only fields (ignored for other roles)
  rent: Money.nullable().optional(),
  keyFee: Money.nullable().optional(),
  parking: Money.nullable().optional(),
  other: Money.nullable().optional(),
  note: z.string().max(300).optional(),
}).strip();

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("saveReadings"), month: Month, items: z.array(ReadingItem).min(1).max(400) }).strip(),
  z.object({
    action: z.literal("setPaid"), month: Month, building: Name, room: Name,
    paidDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "paidDate ต้องเป็น yyyy-MM-dd หรือว่าง"),
  }).strip(),
  z.object({
    action: z.literal("setRate"), building: Name,
    elecRate: Money, waterRate: Money, waterMin: Money,
    dueDay: z.number().int().min(1).max(31),
  }).strip(),
]);

const MONEY_FIELDS = ["elecCost", "waterCost", "rent", "keyFee", "parking", "other", "total"] as const;

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

async function fetchBilling(month: string, forWrite = false): Promise<BillingData> {
  // Before a write the read gets one short try: read + write must fit in
  // maxDuration (60s) together.
  const j = await appsScriptCall<BillingData>("getBilling", { month },
    forWrite ? { idempotent: true, timeoutMs: 15_000, maxRetries: 0 } : { idempotent: true, timeoutMs: 20_000 });
  if (!j.ok || !j.result) throw new Error(j.error || "backend error");
  return j.result;
}

/** Building match: exact, then case-insensitive ("KL" vs "Kl"). */
export function rateFor(rates: BillingRate[], building: string): BillingRate | null {
  const b = building.trim();
  return rates.find((r) => r.building === b)
    ?? rates.find((r) => r.building.toLowerCase() === b.toLowerCase())
    ?? null;
}

function stripMoney(d: BillingData): BillingData {
  return {
    ...d,
    rows: d.rows.map((r) => {
      const o = { ...r, paidDate: "" } as MeterRow;
      for (const f of MONEY_FIELDS) (o as unknown as Record<string, unknown>)[f] = null;
      return o;
    }),
    rates: [],
  };
}

function upstreamError(e: unknown) {
  if (e instanceof AppsScriptError) {
    return bad(e.status === 504 ? "หลังบ้าน Google ตอบช้า — อาจบันทึกไปแล้ว รีเฟรชดูก่อน" : `บันทึกไม่สำเร็จ: ${e.message}`, e.status);
  }
  return bad(e instanceof Error ? e.message : "unknown", 502);
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  if (!canAccess(session.user.roles, "billing")) return bad("ไม่มีสิทธิ์เข้าหน้าบิล", 403);
  const month = new URL(req.url).searchParams.get("month") || "";
  if (!isMonthKey(month)) return bad("month ต้องเป็น yyyy-MM");
  try {
    const data = await fetchBilling(month);
    const finance = canPerform(session.user.roles, "finance.view");
    return NextResponse.json({ ok: true, finance, ...(finance ? data : stripMoney(data)) });
  } catch (e) {
    return upstreamError(e);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  const roles = session.user.roles;
  if (!canAccess(roles, "billing")) return bad("ไม่มีสิทธิ์เข้าหน้าบิล", 403);
  const finance = canPerform(roles, "finance.view");

  let raw: unknown;
  try { raw = await req.json(); } catch { return bad("invalid JSON"); }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return bad(parsed.error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง");
  const body = parsed.data;
  const creator = session.user.email;

  try {
    if (body.action === "setPaid" || body.action === "setRate") {
      if (!finance) return bad("เฉพาะผู้จัดการ", 403);
      const { action, ...rest } = body;
      // Code.gs action names (v3.39): setBillPaid / setRate
      const upstream = action === "setPaid" ? "setBillPaid" : "setRate";
      const j = await appsScriptCall(upstream, { ...rest, creator }, { idempotent: true, timeoutMs: 20_000, maxRetries: 1 });
      return NextResponse.json(j, { status: j.ok ? 200 : 400 });
    }

    // saveReadings — merge with what the sheet has, compute, write.
    const data = await fetchBilling(body.month, true);
    const existing = new Map(data.rows.map((r) => [`${r.building}|${r.room}`, r]));
    const prev = new Map(data.prevRows.map((r) => [`${r.building}|${r.room}`, r]));
    const items = body.items.map((it) => {
      const key = `${it.building.trim()}|${it.room.trim()}`;
      const ex = existing.get(key);
      const pv = prev.get(key);
      const pick = (v: number | null | undefined, fallback: number | null | undefined): number | null =>
        v !== undefined ? v : (fallback ?? null);
      const elecPrev = pick(it.elecPrev, ex?.elecPrev ?? pv?.elecCur);
      const waterPrev = pick(it.waterPrev, ex?.waterPrev ?? pv?.waterCur);
      const elecCur = pick(it.elecCur, ex?.elecCur);
      const waterCur = pick(it.waterCur, ex?.waterCur);
      const rent = finance && it.rent !== undefined ? it.rent : (ex?.rent ?? it.roomPrice ?? null);
      const keyFee = finance && it.keyFee !== undefined ? it.keyFee : (ex?.keyFee ?? null);
      const parking = finance && it.parking !== undefined ? it.parking : (ex?.parking ?? null);
      const other = finance && it.other !== undefined ? it.other : (ex?.other ?? null);
      const bill = computeBill({ elecPrev, elecCur, waterPrev, waterCur, rent, keyFee, parking, other }, rateFor(data.rates, it.building));
      // Only what we know: an amount we can't compute is NOT written (it
      // would clear a figure someone put in the sheet by hand).
      const out: Record<string, unknown> = { building: it.building.trim(), room: it.room.trim(), elecPrev, waterPrev };
      if (elecCur !== null) out.elecCur = elecCur;
      if (waterCur !== null) out.waterCur = waterCur;
      for (const [k, v] of Object.entries({
        elecUnits: bill.elecUnits, elecCost: bill.elecCost, waterUnits: bill.waterUnits,
        waterCost: bill.waterCost, total: bill.total, rent,
      })) if (v !== null) out[k] = v;
      if (finance) {
        if (it.keyFee !== undefined) out.keyFee = it.keyFee;
        if (it.parking !== undefined) out.parking = it.parking;
        if (it.other !== undefined) out.other = it.other;
        if (it.note !== undefined) out.note = it.note;
      }
      return { out, bill };
    });
    const j = await appsScriptCall("saveMeterReadings", {
      month: body.month, items: items.map((x) => x.out), creator,
    }, { timeoutMs: 40_000 });
    if (!j.ok) return NextResponse.json(j, { status: 400 });
    return NextResponse.json({
      ok: true,
      saved: (j as unknown as { saved?: number }).saved ?? items.length,
      // Per room: what was computed, so the screen shows the stored truth.
      results: items.map(({ out, bill }) => ({
        building: out.building, room: out.room,
        elecUnits: bill.elecUnits, waterUnits: bill.waterUnits,
        ...(finance ? { elecCost: bill.elecCost, waterCost: bill.waterCost, total: bill.total } : {}),
        problems: finance ? bill.problems : bill.problems.filter((p) => !p.includes("อัตรา") && !p.includes("ค่าเช่า")),
      })),
    });
  } catch (e) {
    return upstreamError(e);
  }
}
