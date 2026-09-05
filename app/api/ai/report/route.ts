import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAccess } from "@/lib/permissions";
import { AI_MODEL, describeAiError, getAnthropic, loadPattern } from "@/lib/ai/patterns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/ai/report (r31 — pattern "daily_report")
 * body: { periodLabel: string, digestMarkdown: string }
 * → { ok, text }  ข้อความไทยพร้อมวาง LINE ส่งเจ้าของ
 *
 * ต้นทางคือ digestToMarkdown ของหน้าบันทึกซ่อมบำรุง (ข้อมูลที่โหลดอยู่แล้ว
 * ในเบราว์เซอร์ — ไม่ดึงชีทเพิ่ม). โมเดลแค่ "เขียนให้คนอ่าน" ห้ามแต่งข้อมูล
 * (กติกาใน pattern) และผู้ใช้แก้ข้อความก่อนคัดลอกได้เสมอ.
 */

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  if (!canAccess(session.user.roles, "maintlog")) return bad("ไม่มีสิทธิ์ดูบันทึกซ่อมบำรุง", 403);

  let body: { periodLabel?: unknown; digestMarkdown?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid JSON");
  }
  const periodLabel = typeof body.periodLabel === "string" ? body.periodLabel.trim().slice(0, 60) : "";
  const digest = typeof body.digestMarkdown === "string" ? body.digestMarkdown.trim() : "";
  if (!digest) return bad("ไม่มีข้อมูลงานในช่วงนี้ให้สรุป");
  if (digest.length > 40_000) return bad("ข้อมูลช่วงนี้ยาวเกินไป — เลือกช่วงที่สั้นกว่า (เช่น สัปดาห์นี้)");

  try {
    const client = getAnthropic();
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 1200,
      system: loadPattern("daily_report"),
      messages: [
        {
          role: "user",
          content: `ช่วงเวลา: ${periodLabel || "ช่วงที่เลือก"}\n\nข้อมูลสรุป (markdown):\n${digest}`,
        },
      ],
    });
    if (response.stop_reason === "refusal") {
      return bad("ระบบไม่สร้างรายงานนี้ — ลองเลือกช่วงอื่น", 422);
    }
    const text = response.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) return bad("สร้างรายงานไม่สำเร็จ (ไม่มีข้อความตอบกลับ)", 502);
    return NextResponse.json({ ok: true, text });
  } catch (e) {
    const { message, status } = describeAiError(e, "สร้างรายงาน");
    return bad(message, status);
  }
}
