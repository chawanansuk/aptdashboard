import type { RoomStatus, RoomHistoryType } from "@/types";

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

// ===== Room history (NEW v3.5.0) =====
export const HISTORY_TYPES: RoomHistoryType[] = [
  "ซ่อม",
  "เปลี่ยนผู้เช่า",
  "ทำสะอาด",
  "ตรวจสภาพ",
  "ปรับปรุง",
  "อื่นๆ",
];

export const HISTORY_TYPE_COLOR: Record<string, string> = {
  ซ่อม:           "#F97316",
  เปลี่ยนผู้เช่า: "#A855F7",
  ทำสะอาด:        "#EAB308",
  ตรวจสภาพ:       "#06B6D4",
  ปรับปรุง:       "#16A34A",
  อื่นๆ:           "#94A3B8",
};
