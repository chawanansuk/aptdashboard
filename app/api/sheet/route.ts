import { NextResponse } from "next/server";
import { parseCSV } from "@/lib/parseSheet";

export const revalidate = 60; // cache 60 วินาที

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SHEET_CSV_URL;
  if (!url) {
    return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า NEXT_PUBLIC_SHEET_CSV_URL" }, { status: 503 });
  }

  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv = await res.text();
    const rows = parseCSV(csv);
    return NextResponse.json({ rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: `ดึงข้อมูลไม่สำเร็จ: ${message}` }, { status: 502 });
  }
}
