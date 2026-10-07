import { THAI_MONTHS } from "@/lib/dateUtils";

/**
 * Monthly billing — meter readings → bill → payment (roadmap item 2).
 *
 * The owner already keeps a "มิเตอร์" sheet (docs/SHEET_GUIDE.md part 5):
 * one row per month × room with electricity/water readings, the computed
 * charges, rent, extras, total and the transfer date. The app reads and
 * writes that same sheet (Code.gs v3.39 getBilling / saveMeterReadings /
 * setBillPaid), so the sheet keeps working exactly as before.
 *
 * Rates are per building, set in the app (sheet "อัตราค่าบริการ"). A
 * building without rates gets NO amounts — never a guessed price.
 *
 * This file is the single place the money is calculated: the screen uses
 * it for the live preview, the API route uses it again on save (so a
 * client can't send its own totals).
 */

export interface BillingRate {
  building: string;
  /** ฿ per kWh. 0 = electricity not charged separately. */
  elecRate: number;
  /** ฿ per m³. 0 with waterMin > 0 = flat water fee. */
  waterRate: number;
  /** Minimum water charge per month (฿). */
  waterMin: number;
  /** Day of the FOLLOWING month the bill is due. */
  dueDay: number;
}

/** One row of the มิเตอร์ sheet (null = empty cell). */
export interface MeterRow {
  month: string;      // yyyy-MM
  building: string;
  room: string;
  elecPrev: number | null;
  elecCur: number | null;
  elecUnits: number | null;
  elecCost: number | null;
  waterPrev: number | null;
  waterCur: number | null;
  waterUnits: number | null;
  waterCost: number | null;
  rent: number | null;
  keyFee: number | null;
  parking: number | null;
  other: number | null;
  total: number | null;
  /** yyyy-MM-dd when paid, "" when not. */
  paidDate: string;
  note: string;
}

export interface BillInput {
  elecPrev: number | null;
  elecCur: number | null;
  waterPrev: number | null;
  waterCur: number | null;
  rent: number | null;
  keyFee?: number | null;
  parking?: number | null;
  other?: number | null;
}

export interface BillResult {
  elecUnits: number | null;
  elecCost: number | null;
  waterUnits: number | null;
  waterCost: number | null;
  /** null until every part is known — an incomplete bill is not sent. */
  total: number | null;
  /** Thai, user-facing: why a part is missing or suspicious. */
  problems: string[];
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A reading/amount typed by a person: "1,234.5" → 1234.5, "" → null. */
export function parseReading(v: unknown): number | null {
  if (isNum(v)) return v;
  if (typeof v !== "string") return null;
  const s = v.replace(/,/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function units(prev: number | null, cur: number | null, label: string, problems: string[]): number | null {
  if (prev === null || cur === null) return null;
  if (cur < prev) {
    problems.push(`มิเตอร์${label}ใหม่ (${cur}) น้อยกว่าเดิม (${prev}) — ตรวจตัวเลข หรือมิเตอร์ถูกเปลี่ยน/วนรอบ`);
    return null;
  }
  // Readings can carry one decimal; keep the units tidy (12.3, not 12.299999).
  return Math.round((cur - prev) * 100) / 100;
}

/**
 * Charges for one room. Amounts are whole baht (Math.round) — the bill is
 * paid by transfer, and the sheet formulas the owner used round the same
 * way in practice.
 */
export function computeBill(input: BillInput, rate: BillingRate | null): BillResult {
  const problems: string[] = [];
  const elecUnits = units(input.elecPrev, input.elecCur, "ไฟ", problems);
  const waterUnits = units(input.waterPrev, input.waterCur, "น้ำ", problems);

  let elecCost: number | null = null;
  let waterCost: number | null = null;
  if (!rate) {
    problems.push("ยังไม่ได้ตั้งอัตราค่าไฟ/ค่าน้ำของตึกนี้ — ตั้งที่แท็บ \"อัตรา\"");
  } else {
    if (rate.elecRate === 0) elecCost = 0;
    else if (elecUnits !== null) elecCost = Math.round(elecUnits * rate.elecRate);
    if (rate.waterRate === 0 && rate.waterMin > 0) waterCost = rate.waterMin;       // flat fee
    else if (rate.waterRate === 0) waterCost = 0;
    else if (waterUnits !== null) waterCost = Math.max(rate.waterMin, Math.round(waterUnits * rate.waterRate));
  }
  if (rate && elecCost === null && !problems.some((p) => p.includes("ไฟใหม่"))) problems.push("ยังไม่ได้จดมิเตอร์ไฟ");
  if (rate && waterCost === null && !problems.some((p) => p.includes("น้ำใหม่"))) problems.push("ยังไม่ได้จดมิเตอร์น้ำ");
  if (input.rent === null) problems.push("ไม่รู้ค่าเช่าของห้องนี้ — ใส่ค่าเช่าในหน้าต่างห้อง");

  const extras = (input.keyFee ?? 0) + (input.parking ?? 0) + (input.other ?? 0);
  const total = elecCost !== null && waterCost !== null && input.rent !== null
    ? input.rent + elecCost + waterCost + extras
    : null;
  return { elecUnits, elecCost, waterUnits, waterCost, total, problems };
}

/** A building's rate: exact name, then case-insensitive ("KL" vs "Kl"). */
export function rateFor(rates: BillingRate[], building: string): BillingRate | null {
  const b = building.trim();
  return rates.find((r) => r.building === b)
    ?? rates.find((r) => r.building.toLowerCase() === b.toLowerCase())
    ?? null;
}

/* ---------------------------------------------------------------- months */

const MONTH_RE = /^(\d{4})-(\d{2})$/;

export function isMonthKey(v: string): boolean {
  const m = MONTH_RE.exec(v);
  return !!m && +m[2] >= 1 && +m[2] <= 12;
}

/** This month in Bangkok as yyyy-MM. */
export function currentMonthKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" })
    .format(now).slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const m = MONTH_RE.exec(month);
  if (!m) return month;
  const idx = +m[1] * 12 + (+m[2] - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** "2026-10" → "ต.ค. 2569" */
export function monthLabel(month: string): string {
  const m = MONTH_RE.exec(month);
  if (!m) return month;
  return `${THAI_MONTHS[+m[2] - 1]} ${+m[1] + 543}`;
}

/** Due date of a month's bill: `dueDay` of the following month, clamped
 *  to that month's length (31 → 30 Nov). */
export function dueDateOf(month: string, dueDay: number): Date | null {
  const m = MONTH_RE.exec(month);
  if (!m) return null;
  const y = +m[1], mo = +m[2]; // next month index = mo (0-based)
  const last = new Date(y, mo + 1, 0).getDate();
  return new Date(y, mo, Math.min(Math.max(1, Math.round(dueDay) || 1), last));
}

function thaiDate(d: Date): string {
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/* ------------------------------------------------------------ message */

const baht = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
const num = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });

export interface BillMessageInput {
  month: string;
  room: string;
  apartmentName: string;
  input: BillInput;
  bill: BillResult;
  rate: BillingRate;
  bank: { bank: string; accountNo: string; accountName: string };
}

/** The LINE message for one room's bill (copied, never sent by the app). */
export function billMessage(p: BillMessageInput): string {
  const { input, bill, rate } = p;
  const lines = [`🧾 บิลรอบ ${monthLabel(p.month)} — ห้อง ${p.room}`, p.apartmentName, ""];
  if (input.rent !== null) lines.push(`ค่าเช่า ${baht(input.rent)} บาท`);
  // The working ("56 หน่วย × 8 = 448") is shown only when it adds up to
  // the amount on the bill — a figure the owner typed into the sheet by
  // hand is sent as a plain amount instead of a sum that doesn't match.
  if (bill.elecCost !== null) {
    const showWork = rate.elecRate > 0 && bill.elecUnits !== null && input.elecPrev !== null && input.elecCur !== null
      && Math.round(bill.elecUnits * rate.elecRate) === bill.elecCost;
    lines.push(!showWork
      ? `ค่าไฟ ${baht(bill.elecCost)} บาท`
      : `ค่าไฟ ${num(input.elecPrev!)} → ${num(input.elecCur!)} = ${num(bill.elecUnits!)} หน่วย × ${num(rate.elecRate)} = ${baht(bill.elecCost)} บาท`);
  }
  if (bill.waterCost !== null) {
    const byUnits = bill.waterUnits !== null ? Math.round(bill.waterUnits * rate.waterRate) : null;
    const flat = rate.waterRate === 0 || byUnits === null || input.waterPrev === null || input.waterCur === null
      || Math.max(rate.waterMin, byUnits) !== bill.waterCost;
    const minNote = !flat && rate.waterMin > 0 && byUnits! < rate.waterMin ? ` (ขั้นต่ำ ${baht(rate.waterMin)})` : "";
    lines.push(flat
      ? `ค่าน้ำ ${baht(bill.waterCost)} บาท`
      : `ค่าน้ำ ${num(input.waterPrev!)} → ${num(input.waterCur!)} = ${num(bill.waterUnits!)} หน่วย × ${num(rate.waterRate)} = ${baht(bill.waterCost)} บาท${minNote}`);
  }
  if (input.keyFee) lines.push(`กุญแจสำรอง ${baht(input.keyFee)} บาท`);
  if (input.parking) lines.push(`ค่าจอดรถ ${baht(input.parking)} บาท`);
  if (input.other) lines.push(`อื่นๆ ${baht(input.other)} บาท`);
  if (bill.total !== null) lines.push("", `รวม ${baht(bill.total)} บาท`);
  const due = dueDateOf(p.month, rate.dueDay);
  if (due) lines.push(`กรุณาชำระภายในวันที่ ${thaiDate(due)}`);
  lines.push(`โอนเข้า ${p.bank.bank} ${p.bank.accountNo}`, `ชื่อบัญชี ${p.bank.accountName}`, "", "โอนแล้วส่งสลิปในแชทนี้ได้เลย ขอบคุณ 🙏");
  return lines.join("\n");
}

/* ------------------------------------------------------------ summary */

export interface BillingSummary {
  billed: number;
  collected: number;
  outstanding: number;
  rooms: number;
  paidRooms: number;
}

export function summarize(rows: Pick<MeterRow, "total" | "paidDate">[]): BillingSummary {
  let billed = 0, collected = 0, rooms = 0, paidRooms = 0;
  for (const r of rows) {
    if (r.total === null) continue;
    rooms++;
    billed += r.total;
    if (r.paidDate) { collected += r.total; paidRooms++; }
  }
  return { billed, collected, outstanding: billed - collected, rooms, paidRooms };
}
