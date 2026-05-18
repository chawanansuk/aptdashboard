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
}

export type TaskType = "ทำสะอาด" | "ย้ายเข้า" | "ย้ายออก" | "ชมห้อง";
export const TASK_ORDER: TaskType[] = ["ทำสะอาด", "ย้ายเข้า", "ย้ายออก", "ชมห้อง"];

export const BUILDINGS = ["Kl", "มายทรี48", "G48", "มั่งมี", "มีทรัพย์"] as const;

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
}
