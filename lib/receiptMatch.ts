/**
 * จับคู่รายการในใบเสร็จ (ที่ Claude อ่านออกมา) กับของในคลังอะไหล่ (r28).
 *
 * ใบเสร็จแมคโครเขียนชื่อสินค้าแบบย่อ/มีรหัส/ตัวพิมพ์ใหญ่ ("SCOTT TISSUE 24R",
 * "ทิชชู่สก็อตต์ 24ม.") ส่วนชื่อในคลังเป็นภาษาคนพิมพ์เอง — ใช้ token overlap
 * แบบหลวมๆ ให้คะแนน แล้วให้ผู้ใช้ยืนยัน/แก้ในตารางก่อนบันทึก (ไม่มีทาง
 * auto-commit เงียบๆ). Pure functions → เทสได้ตรง.
 */

export interface ReceiptItem {
  /** ชื่อสินค้าตามที่อ่านได้จากใบเสร็จ */
  name: string;
  quantity: number;
  /** ราคารวมของบรรทัดนี้ (บาท) */
  totalPrice: number;
  /** หน่วยถ้าอ่านได้ (แพ็ค/ขวด/ลัง) */
  unit?: string;
}

export interface ReceiptScan {
  store: string;
  /** yyyy-MM-dd ถ้าอ่านได้ ไม่งั้นว่าง */
  date: string;
  items: ReceiptItem[];
  /** ยอดรวมท้ายบิลถ้าอ่านได้ */
  total: number;
}

export interface MatchCandidate {
  partId: string;
  score: number; // 0..1
}

/** normalize สำหรับเทียบ: ตัวเล็ก, ตัดวรรณยุกต์/สัญลักษณ์, ยุบช่องว่าง */
export function normalizeName(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[่-๋็์]/g, "") // วรรณยุกต์ + ไม้ไต่คู้ + การันต์
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ") // \p{M} = สระบน/ล่างของไทย ต้องคงไว้
    .replace(/\s+/g, " ")
    .trim();
}

/** token ที่มีความหมาย (ตัดเลขล้วนสั้นๆ กับตัวเชื่อม) */
export function tokens(s: string): string[] {
  return normalizeName(s)
    .split(" ")
    .filter((t) => t.length >= 2 && !/^\d{1,2}$/.test(t));
}

/**
 * คะแนนความคล้าย 0..1: สัดส่วน token ของชื่อในคลังที่ปรากฏในชื่อใบเสร็จ
 * (หรือกลับกัน) + โบนัสถ้า substring ตรงกัน. เอียงไปทาง recall เพราะผู้ใช้
 * ตรวจอีกชั้นอยู่แล้ว.
 */
export function similarity(receiptName: string, partName: string): number {
  const a = normalizeName(receiptName);
  const b = normalizeName(partName);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setA = new Set(ta);
  let hit = 0;
  for (const t of tb) {
    if (setA.has(t)) { hit++; continue; }
    // partial token match (ทิชชู vs ทิชชู่สก็อตต์ ตัดวรรณยุกต์แล้ว)
    if (t.length >= 3 && ta.some((x) => x.includes(t) || t.includes(x))) hit += 0.7;
  }
  return Math.min(1, hit / Math.max(tb.length, 1));
}

const MATCH_THRESHOLD = 0.45;

/** เลือก part ที่คล้ายที่สุดให้แต่ละบรรทัด — คืน null เมื่อไม่ถึงเกณฑ์
 *  (ผู้ใช้เลือกเอง/ข้าม). */
export function bestMatch(
  item: ReceiptItem,
  parts: { id: string; name: string }[],
): MatchCandidate | null {
  let best: MatchCandidate | null = null;
  for (const p of parts) {
    const score = similarity(item.name, p.name);
    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { partId: p.id, score };
    }
  }
  return best;
}

/** ราคา/หน่วยจากบรรทัด (0 ถ้าคำนวณไม่ได้) */
export function unitPriceOf(item: ReceiptItem): number {
  if (!(item.quantity > 0) || !(item.totalPrice > 0)) return 0;
  return Math.round((item.totalPrice / item.quantity) * 100) / 100;
}
