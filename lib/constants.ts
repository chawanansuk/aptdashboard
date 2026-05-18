import type { RoomStatus, EquipmentType, EquipmentStatus } from "@/types";

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
