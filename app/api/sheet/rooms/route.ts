import { NextResponse } from "next/server";
import { parseRoomsCSV } from "@/lib/parseSheet";
import { auth } from "@/auth";

export const revalidate = 60;

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SHEET_ROOMS_CSV_URL;
  if (!url) {
    return NextResponse.json(
      {
        error:
          "ยังไม่ได้ตั้งค่า NEXT_PUBLIC_SHEET_ROOMS_CSV_URL (ชีตห้อง)",
      },
      { status: 503 }
    );
  }

  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv = await res.text();
    const rooms = parseRoomsCSV(csv);
    return NextResponse.json({ rooms });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { error: `ดึงข้อมูลห้องไม่สำเร็จ: ${message}` },
      { status: 502 }
    );
  }
}
