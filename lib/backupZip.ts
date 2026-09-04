/**
 * Backup ZIP — fetches all entity endpoints in parallel, builds a
 * single ZIP containing one CSV per entity, downloads it.
 *
 * Skips endpoints the user can't access (403 → empty CSV not
 * included). Useful for monthly archives or migration prep.
 */

import JSZip from "jszip";
import { toCsv, type CsvColumn } from "./csvExport";

interface BackupEntity<T> {
  /** Filename inside the zip (no extension). */
  name: string;
  /** API endpoint to fetch. */
  url: string;
  /**
   * Key the endpoint nests its array under. Most return `{ rows: [...] }`;
   * /api/sheet/rooms returns `{ rooms: [...] }`. Defaults to "rows".
   */
  responseKey?: string;
  /** Column spec for CSV rows. */
  columns: CsvColumn<T>[];
}

/** audit r27 HIGH: เดิมล้มเงียบเป็น [] → ZIP มี tasks.csv ว่าง แต่ toast บอก
 *  "สำเร็จ" — ต้องรายงานว่า entity ไหนดึงไม่สำเร็จ */
async function fetchRows<T>(url: string, key = "rows"): Promise<{ rows: T[]; error: string | null }> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { rows: [], error: data?.error || `HTTP ${res.status}` };
    const arr = data?.[key];
    if (!Array.isArray(arr)) return { rows: [], error: data?.error || "รูปแบบข้อมูลไม่ถูกต้อง" };
    return { rows: arr as T[], error: null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : "network error" };
  }
}

interface MinimalRoom {
  building: string; room: string; floor: string; price: string;
  status: string; tenant: string; phone: string; contractEnd: string;
}
interface MinimalTask {
  date: string; type: string; building: string; room: string;
  customer: string; phone: string; note: string; status: string;
  creator?: string; createdAt?: string; cost?: number;
}
interface MinimalEquipment {
  building: string; room: string; type: string; brand: string;
  installDate: string; lastService: string; status: string;
  note: string; intervalDays?: number;
}
interface MinimalFacility {
  building: string; type: string; name: string; installDate: string;
  lastService: string; status: string; note: string; intervalDays?: number;
}
interface MinimalPart {
  name: string; category: string; stock: number; unit: string;
  threshold: number; note: string; creator: string;
  createdAt: string; updatedAt: string;
}
interface MinimalVehicle {
  building: string; room: string; plate: string; model: string;
  color: string; note: string; creator: string;
  createdAt: string; updatedAt: string;
}
interface MinimalLead {
  name: string; phone: string; source: string; interest: string;
  stage: string; note: string; creator: string;
  createdAt: string; updatedAt: string;
}
interface MinimalTimeLog {
  taskKey: string; startedAt: string; endedAt: string;
  durationMin: number; user: string; note: string; createdAt: string;
}

/**
 * Run all fetches in parallel + assemble ZIP. Returns blob ready to
 * download. Each CSV file uses UTF-8 BOM so Excel opens Thai correctly.
 */
export interface BackupResult {
  blob: Blob;
  /** entity ที่ดึงข้อมูลไม่สำเร็จ (CSV ในไฟล์มีแต่หัวตาราง) */
  failed: { name: string; error: string }[];
}

export async function buildBackupZip(): Promise<BackupResult> {
  const entities: BackupEntity<unknown>[] = [
    {
      name: "rooms",
      url: "/api/sheet/rooms",
      responseKey: "rooms", // this endpoint returns { rooms: [...] }, not { rows }
      columns: ([
        { header: "ตึก", value: (r) => r.building },
        { header: "ห้อง", value: (r) => r.room },
        { header: "ชั้น", value: (r) => r.floor },
        { header: "ราคา", value: (r) => r.price },
        { header: "สถานะ", value: (r) => r.status },
        { header: "ผู้เช่า", value: (r) => r.tenant },
        { header: "เบอร์โทร", value: (r) => r.phone },
        { header: "วันสิ้นสุดสัญญา", value: (r) => r.contractEnd },
      ] as CsvColumn<MinimalRoom>[]) as CsvColumn<unknown>[],
    },
    {
      name: "tasks",
      url: "/api/sheet", // getTasks → { rows: SheetRow[] }; /api/sheet/tasks doesn't exist
      columns: ([
        { header: "วันที่", value: (t) => t.date },
        { header: "ประเภท", value: (t) => t.type },
        { header: "ตึก", value: (t) => t.building },
        { header: "ห้อง", value: (t) => t.room },
        { header: "ลูกค้า", value: (t) => t.customer },
        { header: "โทร", value: (t) => t.phone },
        { header: "หมายเหตุ", value: (t) => t.note },
        { header: "สถานะ", value: (t) => t.status },
        { header: "ผู้สร้าง", value: (t) => t.creator ?? "" },
        { header: "วันที่สร้าง", value: (t) => t.createdAt ?? "" },
        { header: "ค่าใช้จ่าย", value: (t) => t.cost ?? "" },
      ] as CsvColumn<MinimalTask>[]) as CsvColumn<unknown>[],
    },
    {
      name: "equipment",
      url: "/api/maintenance-plan",
      columns: ([
        { header: "ตึก", value: (e) => e.building },
        { header: "ห้อง", value: (e) => e.room },
        { header: "ประเภท", value: (e) => e.type },
        { header: "ยี่ห้อ/รุ่น", value: (e) => e.brand },
        { header: "วันติดตั้ง", value: (e) => e.installDate },
        { header: "วันซ่อมล่าสุด", value: (e) => e.lastService },
        { header: "สถานะ", value: (e) => e.status },
        { header: "หมายเหตุ", value: (e) => e.note },
        { header: "รอบบำรุง(วัน)", value: (e) => e.intervalDays ?? "" },
      ] as CsvColumn<MinimalEquipment>[]) as CsvColumn<unknown>[],
    },
    {
      name: "facilities",
      url: "/api/facilities",
      columns: ([
        { header: "ตึก", value: (f) => f.building },
        { header: "ประเภท", value: (f) => f.type },
        { header: "ชื่อ/รุ่น", value: (f) => f.name },
        { header: "วันติดตั้ง", value: (f) => f.installDate },
        { header: "วันบริการล่าสุด", value: (f) => f.lastService },
        { header: "สถานะ", value: (f) => f.status },
        { header: "รอบบำรุง", value: (f) => f.intervalDays ?? "" },
        { header: "หมายเหตุ", value: (f) => f.note },
      ] as CsvColumn<MinimalFacility>[]) as CsvColumn<unknown>[],
    },
    {
      name: "parts",
      url: "/api/parts",
      columns: ([
        { header: "ชื่อ", value: (p) => p.name },
        { header: "หมวด", value: (p) => p.category },
        { header: "คงเหลือ", value: (p) => p.stock },
        { header: "หน่วย", value: (p) => p.unit },
        { header: "จุดสั่งซื้อ", value: (p) => p.threshold || "" },
        { header: "หมายเหตุ", value: (p) => p.note },
        { header: "ผู้บันทึก", value: (p) => p.creator },
        { header: "วันที่บันทึก", value: (p) => p.createdAt },
        { header: "วันที่ปรับปรุง", value: (p) => p.updatedAt },
      ] as CsvColumn<MinimalPart>[]) as CsvColumn<unknown>[],
    },
    {
      name: "vehicles",
      url: "/api/vehicles",
      columns: ([
        { header: "ตึก", value: (v) => v.building },
        { header: "ห้อง", value: (v) => v.room },
        { header: "ทะเบียน", value: (v) => v.plate },
        { header: "ยี่ห้อ/รุ่น", value: (v) => v.model },
        { header: "สี", value: (v) => v.color },
        { header: "หมายเหตุ", value: (v) => v.note },
        { header: "ผู้บันทึก", value: (v) => v.creator },
        { header: "วันที่บันทึก", value: (v) => v.createdAt },
        { header: "วันที่ปรับปรุง", value: (v) => v.updatedAt },
      ] as CsvColumn<MinimalVehicle>[]) as CsvColumn<unknown>[],
    },
    {
      name: "leads",
      url: "/api/leads",
      columns: ([
        { header: "ชื่อ", value: (l) => l.name },
        { header: "เบอร์โทร", value: (l) => l.phone },
        { header: "ช่องทาง", value: (l) => l.source },
        { header: "สนใจ", value: (l) => l.interest },
        { header: "stage", value: (l) => l.stage },
        { header: "หมายเหตุ", value: (l) => l.note },
        { header: "ผู้บันทึก", value: (l) => l.creator },
        { header: "วันที่บันทึก", value: (l) => l.createdAt },
        { header: "วันที่ปรับปรุง", value: (l) => l.updatedAt },
      ] as CsvColumn<MinimalLead>[]) as CsvColumn<unknown>[],
    },
    {
      name: "time-logs",
      url: "/api/time-logs",
      columns: ([
        { header: "taskKey", value: (t) => t.taskKey },
        { header: "เริ่ม", value: (t) => t.startedAt },
        { header: "หยุด", value: (t) => t.endedAt },
        { header: "นาที", value: (t) => t.durationMin },
        { header: "user", value: (t) => t.user },
        { header: "หมายเหตุ", value: (t) => t.note },
        { header: "วันที่บันทึก", value: (t) => t.createdAt },
      ] as CsvColumn<MinimalTimeLog>[]) as CsvColumn<unknown>[],
    },
  ];

  const zip = new JSZip();
  const today = new Date().toISOString().slice(0, 10);
  const folder = zip.folder(`apartcloud-backup-${today}`)!;

  // Fetch all in parallel; failures → header-only CSV + รายงานกลับให้ผู้ใช้
  const results = await Promise.all(
    entities.map(async (e) => {
      const { rows, error } = await fetchRows<unknown>(e.url, e.responseKey);
      return { name: e.name, csv: toCsv(rows, e.columns), error };
    }),
  );
  const failed = results.filter((r) => r.error).map((r) => ({ name: r.name, error: r.error as string }));
  for (const r of results) {
    // UTF-8 BOM for Excel Thai support — same as csvExport.downloadCsv
    folder.file(`${r.name}.csv`, "﻿" + r.csv);
  }

  // Minimal README so the user knows what they're looking at
  folder.file(
    "README.txt",
    `ApartCloud Backup — ${today}\n\n` +
      `Entities included:\n` +
      entities.map((e) => `  - ${e.name}.csv`).join("\n") +
      (failed.length
        ? `\n\n⚠ ดึงข้อมูลไม่สำเร็จ (ไฟล์มีแต่หัวตาราง):\n` +
          failed.map((f) => `  - ${f.name}.csv: ${f.error}`).join("\n")
        : "") +
      `\n\nEach CSV is UTF-8 with BOM (opens correctly in Excel).\n`,
  );

  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, failed };
}

/** Trigger browser download of the backup ZIP. */
/** คืนรายชื่อ entity ที่ดึงไม่สำเร็จ — ผู้เรียกใช้เตือนผู้ใช้ (ว่าง = ครบ) */
export async function downloadBackupZip(): Promise<BackupResult["failed"]> {
  const { blob, failed } = await buildBackupZip();
  const today = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `apartcloud-backup-${today}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return failed;
}
