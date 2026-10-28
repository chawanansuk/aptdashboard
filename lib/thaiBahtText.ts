/**
 * Amount in Thai words, the way contracts and receipts spell it:
 * 5200 → "ห้าพันสองร้อยบาทถ้วน", 10335.5 → "หนึ่งหมื่นสามร้อยสามสิบห้าบาทห้าสิบสตางค์".
 *
 * Same conventions as Excel/Sheets BAHTTEXT: 1 in the tens is "สิบ",
 * 2 in the tens is "ยี่สิบ", and a trailing 1 after any higher digit is
 * "เอ็ด" (11 สิบเอ็ด, 101 หนึ่งร้อยเอ็ด, 1,000,001 หนึ่งล้านเอ็ด).
 */

const DIGIT = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const PLACE = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

/** Words for 0 < n < 1,000,000. `afterHigher` = a higher group precedes it. */
function group(n: number, afterHigher: boolean): string {
  const digits = String(n).split("").map(Number);
  const len = digits.length;
  let out = "";
  digits.forEach((d, i) => {
    if (d === 0) return;
    const place = len - 1 - i;
    if (place === 1) out += d === 1 ? "สิบ" : d === 2 ? "ยี่สิบ" : `${DIGIT[d]}สิบ`;
    else if (place === 0) out += d === 1 && (len > 1 || afterHigher) ? "เอ็ด" : DIGIT[d];
    else out += DIGIT[d] + PLACE[place];
  });
  return out;
}

/** Whole number in words (no unit). */
export function thaiNumberText(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  n = Math.floor(n);
  if (n === 0) return DIGIT[0];
  const parts: string[] = [];
  let rest = n;
  const groups: number[] = [];
  while (rest > 0) { groups.unshift(rest % 1_000_000); rest = Math.floor(rest / 1_000_000); }
  groups.forEach((g, i) => {
    const higher = i > 0;
    if (g > 0) parts.push(group(g, higher && groups.slice(0, i).some((x) => x > 0)));
    if (i < groups.length - 1) parts.push("ล้าน");
  });
  return parts.join("");
}

/** "ห้าพันสองร้อยบาทถ้วน"; "" for a negative or non-number. */
export function thaiBahtText(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return "";
  const satang = Math.round((amount - Math.floor(amount)) * 100);
  const baht = Math.floor(amount) + (satang === 100 ? 1 : 0);
  const s = satang === 100 ? 0 : satang;
  const bahtWords = baht > 0 || s === 0 ? `${thaiNumberText(baht)}บาท` : "";
  return s === 0 ? `${bahtWords}ถ้วน` : `${bahtWords}${thaiNumberText(s)}สตางค์`;
}
