import Papa from "papaparse";
import { SheetRow, RoomRow } from "@/types";

// ===== TASKS sheet (ชีต "งาน") =====
const TASK_HEADER_MAP: Record<string, keyof SheetRow> = {
  วันที่: "date",
  ประเภท: "type",
  ตึก: "building",
  ห้อง: "room",
  ลูกค้า: "customer",
  เบอร์: "phone",
  หมายเหตุ: "note",
  สถานะ: "status",
};

export function parseCSV(csvText: string): SheetRow[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  return result.data
    .map((raw) => {
      const row: Partial<SheetRow> = {};
      for (const [thaiKey, fieldName] of Object.entries(TASK_HEADER_MAP)) {
        row[fieldName] = (raw[thaiKey] ?? "").trim();
      }
      return row as SheetRow;
    })
    .filter((r) => r.date && r.type && r.building);
}

// ===== ROOMS sheet (ชีต "ห้อง") =====
const ROOM_HEADER_MAP: Record<string, keyof RoomRow> = {
  ตึก: "building",
  ห้อง: "room",
  ชั้น: "floor",
  "ราคา/เดือน": "price",
  สถานะ: "status",
  ผู้เช่าปัจจุบัน: "tenant",
  เบอร์: "phone",
  วันสัญญาหมด: "contractEnd",
};

export function parseRoomsCSV(csvText: string): RoomRow[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  return result.data
    .map((raw) => {
      const row: Partial<RoomRow> = {};
      for (const [thaiKey, fieldName] of Object.entries(ROOM_HEADER_MAP)) {
        row[fieldName] = (raw[thaiKey] ?? "").trim();
      }
      return row as RoomRow;
    })
    .filter((r) => r.building && r.room);
}
