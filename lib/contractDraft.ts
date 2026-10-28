import { bankFor } from "@/lib/bookingConfig";
import { formatThaiPhone } from "@/lib/phoneFormat";
import { thaiBahtText } from "@/lib/thaiBahtText";

/**
 * Draft lease ("ร่างสัญญา") for a customer to read after booking.
 *
 * The wording lives in a Google Doc per building that the owner edits
 * (sheet "แม่แบบสัญญา", Code.gs v3.40). The Doc holds blanks like
 * {{ชื่อผู้เช่า}}; Apps Script copies it, fills the blanks, stamps it
 * "ฉบับร่าง" and returns a PDF the staff member shares to LINE.
 *
 * This file is the app's half: which buildings have it switched on, and
 * the values the app fills in from the booking form. Rates (ค่าไฟ/ค่าน้ำ)
 * are filled by Apps Script from the "อัตราค่าบริการ" sheet.
 */

/** Pilot: buildings where staff see "ร่างสัญญา". Add a name to switch it on. */
export const CONTRACT_PILOT_BUILDINGS = ["มีทอง"];

export function isContractPilot(building: string): boolean {
  const b = (building || "").trim().toLowerCase();
  return !!b && CONTRACT_PILOT_BUILDINGS.some((x) => x.toLowerCase() === b);
}

/** Every blank a template may use, and who fills it. Code.gs's starter
 *  template and rate filler use the same names (contract-tested). */
export const CONTRACT_PLACEHOLDERS: { key: string; label: string; source: "app" | "sheet" }[] = [
  { key: "ชื่อหอ", label: "ชื่อหอเต็ม เช่น มีทองเรสซิเด้นท์", source: "app" },
  { key: "ตึก", label: "ชื่อตึกในชีต", source: "app" },
  { key: "ห้อง", label: "เลขห้อง", source: "app" },
  { key: "ชื่อผู้เช่า", label: "ชื่อผู้เช่า", source: "app" },
  { key: "เบอร์โทร", label: "เบอร์ผู้เช่า", source: "app" },
  { key: "ค่าเช่า", label: "ค่าเช่าต่อเดือน (ตัวเลข)", source: "app" },
  { key: "ค่าเช่าตัวอักษร", label: "ค่าเช่าเป็นตัวหนังสือ", source: "app" },
  { key: "เงินประกัน", label: "เงินประกัน (ตัวเลข)", source: "app" },
  { key: "เงินประกันตัวอักษร", label: "เงินประกันเป็นตัวหนังสือ", source: "app" },
  { key: "มัดจำที่รับแล้ว", label: "มัดจำจองที่รับแล้ว", source: "app" },
  { key: "วันเริ่มสัญญา", label: "วันเข้าพัก", source: "app" },
  { key: "เงื่อนไขสัญญา", label: "เงื่อนไขสัญญาจากฟอร์มจอง เช่น ขั้นต่ำ 6 เดือน", source: "app" },
  { key: "สัตว์เลี้ยง", label: "สัตว์เลี้ยง (ไม่มี = \"ไม่มี\")", source: "app" },
  { key: "ธนาคาร", label: "ธนาคารรับโอนของตึก", source: "app" },
  { key: "เลขบัญชี", label: "เลขบัญชีรับโอนของตึก", source: "app" },
  { key: "ชื่อบัญชี", label: "ชื่อบัญชีรับโอนของตึก", source: "app" },
  { key: "วันที่ทำร่าง", label: "วันที่ทำร่างนี้", source: "app" },
  { key: "ค่าไฟต่อหน่วย", label: "จากแท็บอัตราในหน้าบิล", source: "sheet" },
  { key: "ค่าน้ำต่อหน่วย", label: "จากแท็บอัตราในหน้าบิล", source: "sheet" },
  { key: "ค่าน้ำขั้นต่ำ", label: "จากแท็บอัตราในหน้าบิล", source: "sheet" },
  { key: "ชำระภายในวันที่", label: "วันครบกำหนดจ่ายของเดือน", source: "sheet" },
];

const THAI_MONTH_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** "1 พฤศจิกายน 2569" */
export function thaiLongDate(d: Date): string {
  return `${d.getDate()} ${THAI_MONTH_FULL[d.getMonth()]} ${d.getFullYear() + 543}`;
}

export interface ContractInput {
  building: string;
  room: string;
  apartmentName: string;
  tenant: string;
  phone: string;
  rent: number;
  deposit: number;
  bookingPaid: number;
  /** yyyy-MM-dd */
  moveInIso: string;
  contractTerms: string;
  pet: string;
}

const money = (n: number) => n.toLocaleString("th-TH");

function isoToDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

/** The app-side blanks, filled from the booking form. Braces are removed
 *  from typed text so a value can never look like another blank. */
export function buildContractFields(i: ContractInput, today: Date = new Date()): Record<string, string> {
  const clean = (s: string) => (s || "").replace(/[{}]/g, "").trim();
  const bank = bankFor(i.building);
  const moveIn = isoToDate(i.moveInIso);
  return {
    "ชื่อหอ": clean(i.apartmentName) || clean(i.building),
    "ตึก": clean(i.building),
    "ห้อง": clean(i.room),
    "ชื่อผู้เช่า": clean(i.tenant),
    "เบอร์โทร": formatThaiPhone(clean(i.phone)),
    "ค่าเช่า": money(i.rent),
    "ค่าเช่าตัวอักษร": thaiBahtText(i.rent),
    "เงินประกัน": money(i.deposit),
    "เงินประกันตัวอักษร": thaiBahtText(i.deposit),
    "มัดจำที่รับแล้ว": money(i.bookingPaid),
    "วันเริ่มสัญญา": moveIn ? thaiLongDate(moveIn) : "",
    "เงื่อนไขสัญญา": clean(i.contractTerms),
    "สัตว์เลี้ยง": clean(i.pet) || "ไม่มี",
    "ธนาคาร": bank.bank,
    "เลขบัญชี": bank.accountNo,
    "ชื่อบัญชี": bank.accountName,
    "วันที่ทำร่าง": thaiLongDate(today),
  };
}

/** "ร่างสัญญา มีทอง 401 สมใจ.pdf" — no characters a phone's file sheet chokes on. */
export function contractFileName(i: Pick<ContractInput, "building" | "room" | "tenant">): string {
  const safe = (s: string) => (s || "").replace(/[\\/:*?"<>|{}]/g, "").replace(/\s+/g, " ").trim();
  return `ร่างสัญญา ${safe(i.building)} ${safe(i.room)} ${safe(i.tenant)}`.replace(/\s+/g, " ").trim() + ".pdf";
}
