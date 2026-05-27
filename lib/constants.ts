import type { RoomStatus, EquipmentType, EquipmentStatus, FacilityType, FacilityStatus } from "@/types";
import { TOKEN } from "@/lib/statusTokens";

export const STATUS_LABEL: Record<RoomStatus, string> = {
  occupied: "มีผู้เช่า",
  ready: "พร้อมขาย",
  pending: "รอสัญญา",
  moveout: "แจ้งย้ายออก",
  qc: "รอตรวจ/QC",
  repair: "รอเข้าซ่อม",
  inactive: "ไม่ได้ใช้งาน",
};

export const STATUS_DOT: Record<RoomStatus, string> = {
  occupied: TOKEN.occupied,
  ready:    TOKEN.okBright,
  pending:  TOKEN.info,
  moveout:  TOKEN.alert,
  qc:       TOKEN.action,
  repair:   TOKEN.warn,
  inactive: TOKEN.inactive,
};

export const STATUS_KEYS: RoomStatus[] = [
  "occupied", "ready", "pending", "moveout", "qc", "repair", "inactive",
];

export const FILTER_CHIPS: { key: "all" | RoomStatus; label: string }[] = [
  { key: "all", label: "ทุกสถานะ" },
  { key: "ready", label: "ว่าง" },
  { key: "moveout", label: "แจ้งย้ายออก" },
  { key: "repair", label: "รอซ่อม" },
];

export const RAW_STATUS_OPTIONS = ["มีคนอยู่", "ว่าง", "รอสัญญา", "แจ้งย้ายออก", "ปรับปรุง", "ไม่ได้ใช้งาน"];

export const VIEW_TO_TASK_TYPE: Partial<Record<RoomStatus, string[]>> = {
  moveout: ["ย้ายออก"],
  qc: ["ทำสะอาด"],
  repair: ["ซ่อม"],
};

export const VIEW_LABEL: Record<string, string> = {
  today: "งานวันนี้",
  moveout: "งานย้ายออก",
  qc: "งานทำสะอาด/QC",
  repair: "งานรอซ่อม",
  salespipeline: "ภาพรวมขาย",
  engineerkanban: "กระดานงานช่าง",
};

export function isDoneStatus(s: string): boolean {
  const t = (s || "").trim();
  return t === "เสร็จ" || t === "done" || t === "ปิดแล้ว";
}

export function isCancelledStatus(s: string): boolean {
  const t = (s || "").trim();
  return t === "ยกเลิก" || t === "cancelled";
}

/** Viewing outcome "ไม่สนใจ" — a closed/lost result that frees the room
 *  again. Kept distinct from a plain cancellation for audit/reporting. */
export function isNotInterestedStatus(s: string): boolean {
  return (s || "").trim() === "ไม่สนใจ";
}

/** Closed = done OR cancelled OR not-interested. Convenience helper to
 *  avoid duplicated checks scattered through views. */
export function isClosedStatus(s: string): boolean {
  return isDoneStatus(s) || isCancelledStatus(s) || isNotInterestedStatus(s);
}

// ===== Equipment (v3.6.0) =====
export const EQUIPMENT_TYPES: EquipmentType[] = [
  "แอร์", "เครื่องซักผ้า", "ตู้เย็น", "เครื่องทำน้ำอุ่น",
  "โทรทัศน์", "ไมโครเวฟ", "อื่นๆ",
];

export const EQUIPMENT_STATUS_LIST: EquipmentStatus[] = [
  "ปกติ", "ต้องซ่อม", "กำลังซ่อม", "ใช้ไม่ได้",
];

export const EQUIPMENT_TYPE_ICON: Record<string, string> = {
  แอร์: "❄",
  เครื่องซักผ้า: "🌀",
  ตู้เย็น: "🧊",
  เครื่องทำน้ำอุ่น: "🚿",
  โทรทัศน์: "📺",
  ไมโครเวฟ: "🔥",
  อื่นๆ: "🔧",
};

export const EQUIPMENT_STATUS_COLOR: Record<string, string> = {
  ปกติ:       TOKEN.ok,
  ต้องซ่อม:    TOKEN.warn,
  กำลังซ่อม:   TOKEN.action,
  ใช้ไม่ได้:   TOKEN.danger,
};

// ===== Maintenance schedule (v3.7.0) =====
// Default service interval (days) per equipment type. Used to pre-fill
// the interval dropdown when the user selects a type in AddEquipmentModal.
export const DEFAULT_INTERVAL_DAYS: Record<string, number> = {
  แอร์: 180,
  เครื่องซักผ้า: 365,
  ตู้เย็น: 365,
  เครื่องทำน้ำอุ่น: 365,
  โทรทัศน์: 0,
  ไมโครเวฟ: 0,
  อื่นๆ: 0,
};

export const INTERVAL_OPTIONS: { value: number; label: string }[] = [
  { value: 0,   label: "ไม่กำหนด" },
  { value: 90,  label: "ทุก 3 เดือน" },
  { value: 180, label: "ทุก 6 เดือน" },
  { value: 365, label: "ทุก 1 ปี" },
  { value: 730, label: "ทุก 2 ปี" },
];

export const MAINTENANCE_STATUS_COLOR: Record<string, string> = {
  ok:          TOKEN.ok,
  "due-soon":  TOKEN.warn,
  overdue:     TOKEN.danger,
  "needs-date": TOKEN.info,
  unknown:     TOKEN.neutral,
};

export const MAINTENANCE_STATUS_LABEL: Record<string, string> = {
  ok:          "ตามรอบ",
  "due-soon":  "ใกล้ครบรอบ",
  overdue:     "เลยกำหนด",
  "needs-date": "รอระบุวันที่",
  unknown:     "ไม่กำหนดรอบ",
};

// ===== Facility (v3.8.0) =====
export const FACILITY_TYPES: FacilityType[] = [
  "รอบล้างแอร์", "รอบล้างเครื่องซักผ้า", "ปั๊มน้ำ", "ไฟส่วนกลาง",
  "ต้นไม้", "ทางเดินส่วนกลาง", "อื่นๆ",
];

export const FACILITY_STATUS_LIST: FacilityStatus[] = [
  "ใช้งานได้", "ต้องซ่อม", "กำลังซ่อม", "ปิดใช้งาน",
];

export const FACILITY_TYPE_ICON: Record<string, string> = {
  รอบล้างแอร์: "❄️",
  รอบล้างเครื่องซักผ้า: "🧺",
  ปั๊มน้ำ: "💧",
  ไฟส่วนกลาง: "💡",
  ต้นไม้: "🌳",
  ทางเดินส่วนกลาง: "🚶",
  อื่นๆ: "🏢",
};

export const FACILITY_STATUS_COLOR: Record<string, string> = {
  ใช้งานได้:  TOKEN.ok,
  ต้องซ่อม:    TOKEN.warn,
  กำลังซ่อม:   TOKEN.action,
  ปิดใช้งาน:   TOKEN.danger,
};

export const FACILITY_DEFAULT_INTERVAL_DAYS: Record<string, number> = {
  รอบล้างแอร์: 90,
  รอบล้างเครื่องซักผ้า: 90,
  ปั๊มน้ำ: 180,
  ไฟส่วนกลาง: 0,
  ต้นไม้: 30,
  ทางเดินส่วนกลาง: 0,
  อื่นๆ: 0,
};
