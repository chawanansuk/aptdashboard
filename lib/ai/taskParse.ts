/**
 * Post-processing ของ pattern line_to_task (pure — เทสได้): ทำความสะอาดสิ่งที่
 * โมเดลตอบให้ตรงกับข้อมูลจริงในแอป (ตึกต้องมีจริง, ห้องต้องมีในตึก, วันที่
 * ต้องเป็น yyyy-MM-dd) และรวมช่องที่ต้องให้คนตรวจไว้ใน unsure.
 * ไม่มีอะไร auto-save — ฟอร์มยังเป็นด่านสุดท้ายเสมอ.
 */

export const TASK_TYPES_ALL = ["ชมห้อง", "ย้ายเข้า", "ย้ายออก", "ทำสะอาด", "ซ่อม", "อื่นๆ"] as const;
export type ParsedTaskType = (typeof TASK_TYPES_ALL)[number];

export interface RawParsedTask {
  type: string;
  building: string;
  room: string;
  date: string;
  time: string;
  customer: string;
  phone: string;
  note: string;
  unsure: string[];
}

export interface CleanParsedTask {
  type: ParsedTaskType;
  building: string;
  room: string;
  date: string;       // yyyy-MM-dd
  time: string;       // HH:mm หรือ ""
  customer: string;
  phone: string;      // ตัวเลขล้วน ≤ 10 หลัก
  note: string;
  unsure: string[];
}

/** ตัดคำนำหน้าที่คนพิมพ์สลับกันบ่อย (ตึก/บ้าน/หอ/อาคาร) + ช่องว่าง เพื่อเทียบ "ชื่อจริง" */
function buildingCore(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/^(ตึก|บ้าน|หอพัก|หอ|อาคาร|อพาร์ทเม้นท์|อพาร์ตเมนต์)\s*/u, "")
    .replace(/\s+/g, "");
}

/** จับคู่ชื่อตึกแบบยืดหยุ่น (ตรงเป๊ะ → ชื่อหลักตรงกัน → มีคำนั้นอยู่ข้างใน ไม่สนตัวพิมพ์) */
export function resolveBuilding(input: string, buildings: string[]): string {
  const q = (input || "").trim().toLowerCase();
  if (!q) return "";
  const exact = buildings.find((b) => b.toLowerCase() === q);
  if (exact) return exact;
  const qc = buildingCore(q);
  if (!qc) return "";
  const core = buildings.find((b) => buildingCore(b) === qc);
  if (core) return core;
  const partial = buildings.find((b) => {
    const k = buildingCore(b);
    return k.includes(qc) || qc.includes(k);
  });
  return partial || "";
}

export function cleanParsedTask(
  raw: RawParsedTask,
  ctx: { today: string; buildings: string[]; rooms?: { building: string; room: string }[] },
): CleanParsedTask {
  const unsure = new Set<string>((raw.unsure || []).map((u) => String(u)));

  const type = (TASK_TYPES_ALL as readonly string[]).includes(raw.type)
    ? (raw.type as ParsedTaskType)
    : "อื่นๆ";
  if (type !== raw.type) unsure.add("type");

  const building = resolveBuilding(raw.building, ctx.buildings);
  if (raw.building && !building) unsure.add("building");

  const room = (raw.room || "").trim();
  if (room && building && ctx.rooms && ctx.rooms.length > 0) {
    const exists = ctx.rooms.some((r) => r.building === building && r.room === room);
    if (!exists) unsure.add("room");
  }

  let date = (raw.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    date = ctx.today;
    unsure.add("date");
  }

  let time = (raw.time || "").trim();
  if (time && !/^\d{2}:\d{2}$/.test(time)) time = "";

  const phone = (raw.phone || "").replace(/\D/g, "").slice(0, 10);

  return {
    type,
    building,
    room,
    date,
    time,
    customer: (raw.customer || "").trim().slice(0, 80),
    phone,
    note: (raw.note || "").trim().slice(0, 200),
    unsure: [...unsure],
  };
}

/** ป้ายไทยของช่องที่ไม่แน่ใจ — โชว์ให้คนตรวจ */
export const FIELD_LABELS: Record<string, string> = {
  type: "ประเภทงาน",
  building: "ตึก",
  room: "ห้อง",
  date: "วันที่",
  time: "เวลา",
  customer: "ชื่อลูกค้า",
  phone: "เบอร์โทร",
  note: "หมายเหตุ",
};
