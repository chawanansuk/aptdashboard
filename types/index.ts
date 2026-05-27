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
  /**
   * มีงาน "ทำสะอาด" ค้างอยู่ แต่ headline status ไม่ใช่ qc — ใช้โชว์ตัวบ่งชี้รอง
   * 🧹 บนการ์ด เช่นห้องที่ "รอสัญญา" (จองแล้ว) แต่ยังต้องทำสะอาดก่อนลูกค้าเข้า
   * จะได้ไม่ลืม (headline ยังเป็นรอสัญญาเพื่อกันจองซ้ำ).
   */
  needsCleaning: boolean;
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
export type MaintenanceStatus = "ok" | "due-soon" | "overdue" | "needs-date" | "unknown";

// ===== Facility (v3.8.0) — building-level สาธารณูปโภค =====
export type FacilityType =
  | "รอบล้างแอร์"
  | "รอบล้างเครื่องซักผ้า"
  | "ปั๊มน้ำ"
  | "ไฟส่วนกลาง"
  | "ต้นไม้"
  | "ทางเดินส่วนกลาง"
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
  name: string;           // ชื่อ/รุ่น เช่น "แอร์ล็อบบี้ #1"
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

/**
 * Vehicle linked to a room (motorcycle, car, etc.). Multiple vehicles
 * per room are supported — FK is the composite {building, room}.
 * License plate is treated as the natural identifier the user
 * remembers; `id` exists for API consistency.
 */
export interface Vehicle {
  id: string;
  building: string;
  room: string;
  plate: string;
  model: string;        // ยี่ห้อ/รุ่น เช่น "Honda Click 125"
  color: string;
  note: string;
  creator: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lead CRM entry (Task 26) — potential renter tracked through a sales
 * funnel. Stage moves left-to-right in the Kanban view; loss/win at
 * end columns close the lead.
 */
export const LEAD_STAGES = [
  "ใหม่", "นัดดูแล้ว", "กำลังคุย", "ทำสัญญา", "ปิดดีล", "ปิดเลิก",
] as const;
export type LeadStage = typeof LEAD_STAGES[number];

export const LEAD_SOURCES = [
  "Facebook", "LINE", "ป้ายหน้าหอ", "แนะนำ", "Walk-in", "อื่นๆ",
] as const;
export type LeadSource = typeof LEAD_SOURCES[number];

export interface Lead {
  id: string;
  name: string;
  phone: string;
  source: LeadSource | string;
  /** Free-text: ตึก / ช่วงราคา / ความต้องการอื่น */
  interest: string;
  stage: LeadStage | string;
  note: string;
  creator: string;
  createdAt: string;
  updatedAt: string;
}

/** Group leads by stage in insertion order. Returns Map preserving stage order. */
export function groupLeadsByStage(leads: Lead[]): Map<LeadStage, Lead[]> {
  const map = new Map<LeadStage, Lead[]>();
  for (const s of LEAD_STAGES) map.set(s, []);
  for (const l of leads) {
    const s = (LEAD_STAGES as readonly string[]).includes(l.stage)
      ? (l.stage as LeadStage)
      : "ใหม่";
    map.get(s)!.push(l);
  }
  return map;
}

/**
 * Parts requisition log entry (v3.16.0). Records each "เบิก" event:
 * who took what part, how many, for which room, and when. The
 * `partName` is a snapshot at the time of requisition so historical
 * records stay meaningful even if the part is renamed/deleted.
 *
 * `taskKey` (optional) links the requisition to a specific task
 * row using the same composite key as time-tracking.
 */
export interface Requisition {
  id: string;
  partId: string;
  partName: string;
  quantity: number;
  building: string;
  room: string;
  taskKey: string;
  user: string;
  note: string;
  createdAt: string;
}

/**
 * Audit log entry (Task 18) — append-only "who did what when" trail.
 * Sourced from the `audit_log` sheet in Google Sheets.
 */
export interface AuditEntry {
  id: string;
  timestamp: string;     // yyyy-MM-dd HH:mm:ss
  user: string;          // email
  action: string;        // e.g. "updateRoomStatus", "deleteTask", "addRequisition"
  entity: string;        // e.g. "room", "task", "part", "recurring"
  entityId: string;      // composite ID (varies per entity)
  details: string;       // free-text human description
}

/**
 * Recurring task template (v3.17.0). Defines a task that should be
 * created on a schedule (every N days). The "runRecurringCheck" API
 * walks active templates and creates due tasks.
 */
export interface RecurringTemplate {
  id: string;
  name: string;
  type: string;          // task type (ทำสะอาด/ซ่อม/etc.)
  building: string;
  room: string;
  intervalDays: number;
  lastRunDate: string;   // yyyy-MM-dd or ""
  nextRunDate: string;   // yyyy-MM-dd
  active: boolean;
  note: string;
  creator: string;
  createdAt: string;
}
