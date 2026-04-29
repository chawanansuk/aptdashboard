import Papa from "papaparse";
import { SheetRow } from "@/types";

// map หัวคอลัมน์ภาษาไทย → field name
const HEADER_MAP: Record<string, keyof SheetRow> = {
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
      for (const [thaiKey, fieldName] of Object.entries(HEADER_MAP)) {
        row[fieldName] = (raw[thaiKey] ?? "").trim();
      }
      return row as SheetRow;
    })
    .filter((r) => r.date && r.type && r.building);
}
