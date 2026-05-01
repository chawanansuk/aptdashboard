import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const writeUrl = process.env.SHEET_WRITE_URL;
  if (!writeUrl) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "ยังไม่ได้ตั้งค่า SHEET_WRITE_URL (ดู docs/SETUP.md)",
      },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(writeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Apps Script Web App often redirects 302 → follow
      redirect: "follow",
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {
      // Apps Script may return HTML on permission failure
      return NextResponse.json(
        {
          ok: false,
          error:
            "ตอบกลับไม่ใช่ JSON (ตรวจสิทธิ์ Apps Script: Anyone)",
          raw: text.slice(0, 200),
        },
        { status: 502 }
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { ok: false, error: `write failed: ${message}` },
      { status: 502 }
    );
  }
}
