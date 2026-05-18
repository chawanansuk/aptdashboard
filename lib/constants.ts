import type { RoomStatus, EquipmentType, EquipmentStatus, FacilityType, FacilityStatus } from "@/types";

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
  occupied: "#1E293B",
  ready: "#22C55E",
  pending: "#A855F7",
  moveout: "#EF4444",
  qc: "#F97316",
  repair: "#EAB308",
  inactive: "#E2E8F0",
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

export const RAW_STATUS_OPTIONS = ["มีคนอยู่", "ว่าง", "รอสัญญา", "แจ้งย้ายออก", "ปรับปรุง"];

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
};

export function isDoneStatus(s: string): boolean {
  const t = (s || "").trim();
  return t === "เสร็จ" || t === "done" || t === "ปิดแล้ว";
}

export function isCancelledStatus(s: string): boolean {
  const t = (s || "").trim();
  return t === "ยกเลิก" || t === "cancelled";
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
  ปกติ:       "#16A34A",
  ต้องซ่อม:    "#EAB308",
  กำลังซ่อม:   "#F97316",
  ใช้ไม่ได้:   "#DC2626",
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
  ok:        "#16A34A",
  "due-soon": "#EAB308",
  overdue:   "#DC2626",
  unknown:   "#94A3B8",
};

export const MAINTENANCE_STATUS_LABEL: Record<string, string> = {
  ok:         "ตามรอบ",
  "due-soon": "ใกล้ครบรอบ",
  overdue:    "เลยกำหนด",
  unknown:    "ไม่กำหนดรอบ",
};

// ===== Facility (v3.8.0) =====
export const FACILITY_TYPES: FacilityType[] = [
  "ลิฟต์", "สระว่ายน้ำ", "เครื่องปั่นไฟ", "ปั๊มน้ำ",
  "WiFi", "CCTV", "อื่นๆ",
];

export const FACILITY_STATUS_LIST: FacilityStatus[] = [
  "ใช้งานได้", "ต้องซ่อม", "กำลังซ่อม", "ปิดใช้งาน",
];

export const FACILITY_TYPE_ICON: Record<string, string> = {
  ลิฟต์: "🛗",
  สระว่ายน้ำ: "🏊",
  เครื่องปั่นไฟ: "⚡",
  ปั๊มน้ำ: "💧",
  WiFi: "📶",
  CCTV: "📹",
  อื่นๆ: "🏢",
};

export const FACILITY_STATUS_COLOR: Record<string, string> = {
  ใช้งานได้:  "#16A34A",
  ต้องซ่อม:    "#EAB308",
  กำลังซ่อม:   "#F97316",
  ปิดใช้งาน:   "#DC2626",
};

export const FACILITY_DEFAULT_INTERVAL_DAYS: Record<string, number> = {
  ลิฟต์: 90,
  สระว่ายน้ำ: 30,
  เครื่องปั่นไฟ: 180,
  ปั๊มน้ำ: 180,
  WiFi: 0,
  CCTV: 365,
  อื่นๆ: 0,
};
