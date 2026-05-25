import Papa from "papaparse";
import { SheetRow, RoomRow } from "@/types";

// ===== TASKS sheet (ชีต "งาน") =====
// Keys of SheetRow whose value is a string (excludes the numeric `cost`),
// so the header map can only target string fields — the parse loop assigns
// trimmed strings into them.
type StringSheetKey = {
  [K in keyof SheetRow]-?: SheetRow[K] extends string | undefined ? K : never;
}[keyof SheetRow];

const TASK_HEADER_MAP: Record<string, StringSheetKey> = {
  วันที่: "date",
  ประเภท: "type",
  ตึก: "building",
  ห้อง: "room",
  ลูกค้า: "customer",
  เบอร์: "phone",
  หมายเหตุ: "note",
  สถานะ: "status",
  ผู้สร้าง: "creator",
  วันที่สร้าง: "createdAt",
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
// Each field can be matched against multiple Thai header names (aliases)
// to tolerate different sheet schemas without breaking.
const ROOM_HEADER_ALIASES: Record<keyof RoomRow, string[]> = {
  building: ["ตึก", "อาคาร"],
  room: ["ห้อง", "เลขห้อง"],
  floor: ["ชั้น"],
  price: ["ค่าเช่า", "ราคา/เดือน", "ราคา", "ค่าเช่ารายเดือน"],
  status: ["สถานะ"],
  tenant: ["ผู้เช่า", "ผู้เช่าปัจจุบัน", "ชื่อผู้เช่า"],
  phone: ["เบอร์", "เบอร์ติดต่อ", "เบอร์โทร"],
  contractEnd: ["สัญญา", "วันสัญญาหมด", "สัญญาหมด", "วันหมดสัญญา"],
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
      for (const [fieldName, aliases] of Object.entries(ROOM_HEADER_ALIASES) as [keyof RoomRow, string[]][]) {
        for (const alias of aliases) {
          const v = raw[alias];
          if (v != null && String(v).trim() !== "") {
            row[fieldName] = String(v).trim();
            break;
          }
        }
        if (row[fieldName] == null) row[fieldName] = "";
      }
      return row as RoomRow;
    })
    .filter((r) => r.building && r.room);
}
