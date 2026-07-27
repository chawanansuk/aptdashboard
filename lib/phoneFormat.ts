import { normalizePhone } from "@/lib/leadLink";

/**
 * เบอร์โทรฟอร์แมตสำหรับข้อความส่งลูกค้า — "0924561642" → "092-4561642"
 * (ขีดเดียวหลังเลข 3 ตัวแรก — ฟอร์แมตเดียวกับที่แอดมินพิมพ์ส่ง LINE จริง).
 *
 * เก็บใน state เป็นเลขดิบเสมอ (tel: link / จับคู่ lead ใช้เลขดิบ);
 * ฟังก์ชันนี้ใช้เฉพาะตอน "แสดง" — ในช่อง input ขณะพิมพ์ และในข้อความ.
 */
export function formatThaiPhone(raw: string): string {
  const d = normalizePhone(raw);
  if (d.length <= 3) return d;
  return `${d.slice(0, 3)}-${d.slice(3)}`;
}

/** Digits only, capped at 10 (เบอร์ไทย) — ใช้เป็นตัวเก็บลง state.
 *  เบอร์รูปแบบสากล +66 92... ถูกแปลงกลับเป็น 092... ก่อน (ไม่งั้นการตัด
 *  10 หลักจะกินเลขตัวท้ายหาย — audit r12). */
export function phoneDigits(raw: string): string {
  let d = normalizePhone(raw);
  if (d.length >= 11 && d.startsWith("66")) d = "0" + d.slice(2);
  return d.slice(0, 10);
}
