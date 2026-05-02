import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // ไม่ cache

export async function GET() {
  const url = process.env.SHEET_WRITE_URL;
  if (!url) {
    return NextResponse.json(
      { error: "ยังไม่ได้ตั้งค่า SHEET_WRITE_URL" },
      { status: 503 }
    );
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getTasks" }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "backend error");
    return NextResponse.json({ rows: json.result.rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { error: `ดึงข้อมูลไม่สำเร็จ: ${message}` },
      { status: 502 }
    );
  }
}
