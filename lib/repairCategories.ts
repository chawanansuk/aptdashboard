/**
 * Repair categories ("หมวด") for ซ่อม tasks — รอบ 1 งานซ่อมจุกจิก.
 *
 * Until now a repair was free text only, so nothing could answer "what
 * breaks most", "which room keeps breaking" or "how much do we spend on
 * plumbing". The category is a sheet column (Code.gs v3.36 TASK_COL
 * CATEGORY) chosen from this fixed list — fixed so reports can group on
 * it, editable HERE in one place when the team wants different buckets.
 *
 * The list and the keywords come from what the app already talks about
 * (its placeholders, equipment types, the LINE-parsing prompt) and the
 * usual apartment repairs; the real sheet wasn't reachable from the dev
 * box. Staff rarely have to pick: `suggestRepairCategory` reads the note
 * they typed ("หลอดไฟห้องน้ำขาด" → ไฟฟ้า) and the form pre-selects it.
 */

export const REPAIR_CATEGORIES = [
  "ไฟฟ้า",
  "ประปา",
  "แอร์",
  "เครื่องใช้ไฟฟ้า",
  "ประตู-หน้าต่าง",
  "เฟอร์นิเจอร์",
  "ผนัง-พื้น-เพดาน",
  "อื่นๆ",
] as const;

export type RepairCategory = (typeof REPAIR_CATEGORIES)[number];

export function isRepairCategory(v: unknown): v is RepairCategory {
  return typeof v === "string" && (REPAIR_CATEGORIES as readonly string[]).includes(v);
}

/** Keywords per category. A longer keyword outweighs a shorter one, so
 *  "น้ำยาแอร์" lands on แอร์ (น้ำยา + แอร์) and not ประปา (น้ำ). */
const KEYWORDS: Record<Exclude<RepairCategory, "อื่นๆ">, string[]> = {
  "ไฟฟ้า": ["หลอดไฟ", "หลอด", "ไฟดับ", "ไฟ", "สวิตช์", "สวิทช์", "ปลั๊ก", "เบรกเกอร์", "สายไฟ", "พัดลม", "ไฟฟ้า", "มิเตอร์", "โคมไฟ", "ไฟตก", "ช็อต"],
  "ประปา": ["ก๊อก", "ก็อก", "น้ำรั่ว", "น้ำไหล", "น้ำไม่ไหล", "ท่อ", "ฝักบัว", "ชักโครก", "สายน้ำดี", "สายฉีด", "ปั๊มน้ำ", "ปั๊ม", "ตัน", "อ่าง", "สุขภัณฑ์", "วาล์ว", "น้ำซึม", "น้ำ", "รั่ว", "ซิลิโคน"],
  "แอร์": ["แอร์", "น้ำยาแอร์", "น้ำยา", "คอมเพรสเซอร์", "ล้างแอร์", "คอยล์", "ไม่เย็น", "รีโมทแอร์"],
  "เครื่องใช้ไฟฟ้า": ["ตู้เย็น", "เครื่องซักผ้า", "ซักผ้า", "เครื่องทำน้ำอุ่น", "น้ำอุ่น", "ทีวี", "โทรทัศน์", "ไมโครเวฟ", "กาต้มน้ำ", "เตาไฟฟ้า", "ตู้", "เครื่องดูดควัน", "ไดร์"],
  "ประตู-หน้าต่าง": ["ประตู", "หน้าต่าง", "กลอน", "ลูกบิด", "กุญแจ", "แม่กุญแจ", "บานพับ", "มุ้งลวด", "กระจก", "คีย์การ์ด", "ล็อก", "ล็อค", "โช๊ค", "โช้ค"],
  "เฟอร์นิเจอร์": ["เตียง", "ที่นอน", "โต๊ะ", "เก้าอี้", "ตู้เสื้อผ้า", "ชั้นวาง", "ผ้าม่าน", "ราวม่าน", "ราวตากผ้า", "โซฟา", "ลิ้นชัก", "เฟอร์", "เฟอร์นิเจอร์"],
  "ผนัง-พื้น-เพดาน": ["ผนัง", "ทาสี", "สีลอก", "พื้น", "กระเบื้อง", "เพดาน", "ฝ้า", "รอยร้าว", "ร้าว", "ปูน", "เชื้อรา", "ขึ้นรา", "ลามิเนต", "บวม", "ยาแนว"],
};

/** Best-guess category from free text; null when nothing matches. */
export function suggestRepairCategory(text: string): RepairCategory | null {
  const t = (text || "").toLowerCase();
  if (!t.trim()) return null;
  let best: RepairCategory | null = null;
  let bestScore = 0;
  for (const [cat, words] of Object.entries(KEYWORDS) as [RepairCategory, string[]][]) {
    let score = 0;
    for (const w of words) if (t.includes(w)) score += w.length;
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  return best;
}

/** Category for a repair logged from an equipment / facility record
 *  ("ซ่อมแล้ว" on แอร์ → แอร์; on a pump → ประปา; anything unknown → เครื่องใช้ไฟฟ้า). */
export function categoryForEquipment(typeOrName: string): RepairCategory {
  return suggestRepairCategory(typeOrName) ?? "เครื่องใช้ไฟฟ้า";
}
