export interface SheetRow {
  date: string;
  type: string;
  building: string;
  room: string;
  customer: string;
  phone: string;
  note: string;
  status: string;
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
