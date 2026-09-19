import { createHash } from "node:crypto";

/**
 * Server-Timing header value: `name;desc="..."; dur=<ms>`. Quotes in
 * `desc` are downgraded to single quotes so the header stays well-formed.
 *
 * r37 (บั๊กจาก log production — 50 ครั้ง/7 วัน, 6 คน): HTTP header เป็น
 * ByteString (latin1) ตัวอักษรเกิน U+00FF ใส่ไม่ได้. ตั้งแต่ r27 ที่ error
 * ของ Apps Script เป็นภาษาไทย ("หลังบ้าน Google ตอบช้าเกินไป") ผู้เรียกส่ง
 * ข้อความนั้นมาเป็น desc → NextResponse.json โยน TypeError → 500 ทั้งที่
 * body เป็น emergency-stale ที่ใช้ได้. ตัวหนังสือที่ไม่ใช่ ASCII จึงถูกแทน
 * ด้วย "?" ตรงนี้จุดเดียว (ทุก route ผ่านฟังก์ชันนี้) — header เป็นข้อมูล
 * debug ฝั่ง devtools ส่วนข้อความจริงอยู่ใน body อยู่แล้ว.
 */
function headerSafe(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[^\x20-\x7E]/g, "?");
}

export function timing(name: string, ms: number, desc?: string): string {
  const d = desc ? `;desc="${headerSafe(desc).replace(/"/g, "'")}"` : "";
  return `${headerSafe(name)}${d};dur=${ms.toFixed(0)}`;
}

/**
 * Hash a value into a short weak ETag, namespaced by `prefix`. Computed
 * over the PROJECTED rows the caller will send so a non-admin's 304
 * cannot be satisfied by an admin's cached body. Md5 is cheap; collisions
 * just send the body anyway.
 */
export function makeEtag(prefix: string, value: unknown): string {
  const hash = createHash("md5").update(JSON.stringify(value)).digest("hex");
  return `W/"${prefix}-${hash.slice(0, 16)}"`;
}
