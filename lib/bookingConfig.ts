/**
 * ค่าคงที่ของ flow การจอง — แก้ที่ไฟล์นี้ไฟล์เดียว (ไม่ผูกกับชีท:
 * ค่าพวกนี้เปลี่ยนปีละครั้ง ไม่คุ้มค่า redeploy + fetch + cache path).
 *
 * Per-building overrides: เติม key ชื่อตึกตรงกับคอลัมน์ "ตึก" ในชีท
 * เช่น BANK_BY_BUILDING = { "มีทอง": {...} } — ตึกที่ไม่มี key ใช้ค่า DEFAULT.
 */

export interface BankAccount {
  bank: string;
  accountNo: string;
  accountName: string;
}

/** บัญชีรับโอนหลักของบริษัท — โชว์ในข้อความโหมด "ขอมัดจำ" และ
 *  "สิ่งที่ต้องเตรียม" (ค่าที่ใช้ส่งลูกค้าจริง). */
export const DEFAULT_BANK: BankAccount = {
  bank: "กรุงไทย",
  accountNo: "017-0-46047-9",
  accountName: "บริษัท ม.ทวีทอง จำกัด",
};

export const BANK_BY_BUILDING: Record<string, BankAccount> = {};

export function bankFor(building: string): BankAccount {
  return BANK_BY_BUILDING[building] || DEFAULT_BANK;
}

/** ค่าประกันเริ่มต้น — prefill ช่องค่าประกันตอนเปิดโมดัล (บั๊กเดิม:
 *  placeholder โชว์ 10,000 แต่ state เป็น 0 → ข้อความส่งลูกค้าผิดหมื่นนึง). */
export const DEFAULT_DEPOSIT = 10000;
export const DEPOSIT_BY_BUILDING: Record<string, number> = {};

export function defaultDepositFor(building: string): number {
  return DEPOSIT_BY_BUILDING[building] ?? DEFAULT_DEPOSIT;
}

/** วิธีหารค่าเช่าตามวัน (ใช้จริงเฟส P1):
 *  actual-days = หารด้วยจำนวนวันจริงของเดือนนั้น (พฤติกรรมปัจจุบัน)
 *  fixed-30 / fixed-31 = หารด้วยตัวเลขคงที่ (บางหอคิดแบบนี้). */
export type ProrateMode = "actual-days" | "fixed-30" | "fixed-31";
export const PRORATE_MODE: ProrateMode = "actual-days";

/** Chips หมายเหตุเพิ่มเติม (เฟส P1) — line คือบรรทัดที่ต่อท้ายบล็อก
 *  ข้อมูลเพิ่มเติมในข้อความ. */
export interface NoteChip {
  id: string;
  label: string;
  line: string;
}
export const NOTE_CHIPS: NoteChip[] = [
  { id: "moto-covered", label: "ที่จอดมอไซค์ในร่ม +200", line: "• ที่จอดมอเตอร์ไซค์ในร่ม +200 บาท/เดือน" },
  { id: "moto-second", label: "มอไซค์คันที่ 2 +100", line: "• มอเตอร์ไซค์คันที่ 2 +100 บาท/เดือน" },
  { id: "no-car", label: "ไม่มีที่จอดรถยนต์", line: "• ไม่มีที่จอดรถยนต์" },
  { id: "no-washer", label: "ห้ามติดตั้งเครื่องซักผ้า", line: "• ห้ามติดตั้งเครื่องซักผ้า" },
];

/** เวลาทำการ (เฟส P1 — เตือนอย่างเดียว ไม่ block). closedDay: 0 = อาทิตย์ */
export const BUSINESS_HOURS = {
  blocks: [
    ["08:30", "12:00"],
    ["13:00", "17:00"],
  ] as [string, string][],
  closedDay: 0,
};

/** เตรียมห้องเร็วสุดกี่วัน (เฟส P1 — เตือนอย่างเดียว). */
export const MIN_PREP_DAYS = 4;

/** เข้าพักตั้งแต่วันที่นี้ของเดือน → auto-tick เก็บค่าเช่าเดือนถัดไป (เฟส P1). */
export const AUTO_CHARGE_NEXT_MONTH_FROM_DAY = 25;
