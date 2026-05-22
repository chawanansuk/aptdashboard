// ===== TASKS sheet (ชีต "งาน") =====
export interface SheetRow {
  date: string;
  type: string;
  building: string;
  room: string;
  customer: string;
  phone: string;
  note: string;
  status: string;
  creator?: string;
  createdAt?: string;
  /** v3.10.0 — ค่าใช้จ่าย (THB). 0 หรือ undefined = ไม่ระบุ */
  cost?: number;
}

export type TaskType = "ทำสะอาด" | "ย้ายเข้า" | "ย้ายออก" | "ชมห้อง";
export const TASK_ORDER: TaskType[] = ["ทำสะอาด", "ย้ายเข้า", "ย้ายออก", "ชมห้อง"];

// BUILDINGS — single source of truth lives in `lib/taskSchema.ts` (zod
// enum needs it there). Re-exported here for backward-compat consumers.
// Previous duplicate had "G48"/no "มีทอง" and silently drifted from
// taskSchema's "มีทอง"/no "G48", causing CleaningChart to render the
// wrong building set (Task 12).
export { BUILDINGS } from "@/lib/taskSchema";

export interface CapacityWarning {
  building: string;
  date: Date;
  count: number;
}

export interface BuildingLoad {
  building: string;
  count: number;
}

// ===== ROOMS sheet (ชีต "ห้อง") =====
export interface RoomRow {
  building: string;
  room: string;
  floor: string;
  price: string;
  status: string;       // มีคนอยู่ | ว่าง | ปรับปรุง
  tenant: string;
  phone: string;
  contractEnd: string;  // dd/MM/yyyy
}

// ===== Unified room status (UI level) =====
export type RoomStatus =
  | "occupied"
  | "ready"
  | "pending"
  | "moveout"
  | "qc"
  | "repair"
  | "inactive";

export interface RoomView {
  building: string;
  room: string;
  floor: string;
  price: string;
  status: RoomStatus;
  rawStatus: string;
  tenant: string;
  phone: string;
  contractEnd: string;
  today: boolean;       // มีงานรอทำวันนี้
  todayTasks: SheetRow[];
  upcomingTasks: SheetRow[];
  pastTasks: SheetRow[];
}

// ===== ROOM EQUIPMENT sheet (ชีต "อุปกรณ์") — v3.6.0 =====
export type EquipmentType =
  | "แอร์"
  | "เครื่องซักผ้า"
  | "ตู้เย็น"
  | "เครื่องทำน้ำอุ่น"
  | "โทรทัศน์"
  | "ไมโครเวฟ"
  | "อื่นๆ";

export type EquipmentStatus =
  | "ปกติ"
  | "ต้องซ่อม"
  | "กำลังซ่อม"
  | "ใช้ไม่ได้";

export interface RoomEquipment {
  id: string;
  building: string;
  room: string;
  type: EquipmentType | string;
  brand: string;          // ยี่ห้อ/รุ่น
  installDate: string;    // yyyy-MM-dd
  lastService: string;    // yyyy-MM-dd
  status: EquipmentStatus | string;
  note: string;
  creator: string;        // email
  createdAt: string;
  intervalDays?: number;  // v3.7.0 — รอบบำรุง (วัน); 0/undefined = ไม่กำหนด
}

// ===== Maintenance schedule (v3.7.0) =====
export type MaintenanceStatus = "ok" | "due-soon" | "overdue" | "unknown";

// ===== Facility (v3.8.0) — building-level สาธารณูปโภค =====
export type FacilityType =
  | "ลิฟต์"
  | "สระว่ายน้ำ"
  | "เครื่องปั่นไฟ"
  | "ปั๊มน้ำ"
  | "WiFi"
  | "CCTV"
  | "อื่นๆ";

export type FacilityStatus =
  | "ใช้งานได้"
  | "ต้องซ่อม"
  | "กำลังซ่อม"
  | "ปิดใช้งาน";

export interface Facility {
  id: string;
  building: string;
  type: FacilityType | string;
  name: string;           // ชื่อ/รุ่น เช่น "ลิฟต์ Mitsubishi #1"
  installDate: string;    // yyyy-MM-dd
  lastService: string;    // yyyy-MM-dd
  status: FacilityStatus | string;
  note: string;
  creator: string;
  createdAt: string;
  intervalDays?: number;
}

/**
 * Spare-parts inventory entry (Task 37). One row per SKU; stock is the
 * current count, threshold is the "warn" point for the UI badge.
 * unit defaults to "ชิ้น" but can be any unit ("ม.", "ลิตร", "ลูก").
 */
export const PART_CATEGORIES = [
  "ประปา", "ไฟฟ้า", "แอร์", "ของใช้ในห้องน้ำ", "ทั่วไป", "อื่นๆ",
] as const;
export type PartCategory = typeof PART_CATEGORIES[number];

export interface Part {
  id: string;
  name: string;
  category: PartCategory | string;
  stock: number;
  threshold: number;       // reorder point; 0 = no alert
  unit: string;            // default "ชิ้น"
  note: string;
  creator: string;
  createdAt: string;
  updatedAt: string;
}

/** True iff stock has dropped to or below the reorder threshold. */
export function isLowStock(p: Pick<Part, "stock" | "threshold">): boolean {
  return p.threshold > 0 && p.stock <= p.threshold;
}

/**
 * Time-tracking log entry (Task 35). One row per start/stop pair.
 * `endedAt === ""` means the timer is still running. `durationMin`
 * is computed server-side on stop, never client-side, to avoid
 * clock-skew between users.
 */
export interface TimeLog {
  id: string;
  /** Composite key: "date|building|room|type" — matches client taskKey(). */
  taskKey: string;
  startedAt: string;       // yyyy-MM-dd HH:mm:ss
  endedAt: string;         // empty while running
  durationMin: number;     // 0 while running, set on stop
  user: string;            // email
  note: string;
  createdAt: string;
}

/** Lightweight payload for "is there a running timer?" check. */
export interface ActiveTimer {
  id: string;
  taskKey: string;
  startedAt: string;
  user: string;
}

/** True iff the timer hasn't been stopped yet (endedAt empty). */
export function isRunningTimer(t: Pick<TimeLog, "endedAt">): boolean {
  return !t.endedAt;
}

/**
 * Sum durations (minutes) for closed timers in the list. Running
 * timers contribute 0 — UI overlays the live ticking elsewhere.
 */
export function totalDurationMin(logs: TimeLog[]): number {
  return logs.reduce((s, l) => s + (l.durationMin || 0), 0);
}
