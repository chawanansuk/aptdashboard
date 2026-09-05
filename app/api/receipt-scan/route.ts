import { NextResponse } from "next/server";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { auth } from "@/auth";
import { canPerform } from "@/lib/permissions";
import { AI_MODEL, describeAiError, getAnthropic, loadPattern } from "@/lib/ai/patterns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/receipt-scan (r28) — อ่านใบเสร็จ (แมคโคร/โฮมโปร/ฯลฯ) ด้วย Claude
 * vision → รายการสินค้า/จำนวน/ราคา เป็น JSON ตายตัว (structured output).
 *
 * body: { imageBase64: string (bare base64, ไม่มี data: prefix), mimeType }
 * ฝั่ง client บีบรูปเป็น JPEG ขอบยาว 1600px ก่อนส่ง (lib/roomPhotos.compressImageFile)
 * → ~200-400KB ต่อใบ. ผลลัพธ์ไม่ถูก commit อัตโนมัติ — ผู้ใช้ตรวจ/จับคู่กับ
 * ของในคลังในโมดัลก่อนกดบันทึกเสมอ.
 *
 * Permission: part.edit (เกทเดียวกับบันทึกซื้อ). ต้องตั้ง ANTHROPIC_API_KEY
 * ใน Vercel — ไม่มี = 503 พร้อมข้อความบอกวิธี.
 */

const ReceiptSchema = z.object({
  store: z.string().describe("ชื่อร้าน เช่น แมคโคร, โฮมโปร, ไทวัสดุ — ว่างถ้าไม่เห็น"),
  date: z.string().describe("วันที่ในใบเสร็จรูปแบบ yyyy-MM-dd (ค.ศ.) — ว่างถ้าไม่เห็น"),
  items: z.array(z.object({
    name: z.string().describe("ชื่อสินค้าตามที่พิมพ์ในใบเสร็จ"),
    quantity: z.number().describe("จำนวนชิ้น/แพ็ค (ตัวเลข) — 1 ถ้าไม่ระบุ"),
    totalPrice: z.number().describe("ราคารวมของบรรทัดนี้เป็นบาท (หลังส่วนลดถ้ามี)"),
    unit: z.string().describe("หน่วยถ้าอ่านได้ เช่น แพ็ค ขวด ลัง — ว่างถ้าไม่มี"),
  })),
  total: z.number().describe("ยอดรวมสุทธิท้ายใบเสร็จ — 0 ถ้าไม่เห็น"),
});

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BASE64_CHARS = 6_000_000; // ~4.5MB — เกินนี้ client ควรบีบก่อน

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  if (!canPerform(session.user.roles, "part.edit")) {
    return bad("ไม่มีสิทธิ์บันทึกการซื้อ", 403);
  }
  let body: { imageBase64?: unknown; mimeType?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid JSON");
  }
  const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64.trim() : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg";
  if (!imageBase64) return bad("imageBase64 required");
  if (imageBase64.length > MAX_BASE64_CHARS) return bad("รูปใหญ่เกินไป — บีบรูปก่อนส่ง");
  if (!ALLOWED_MIME.has(mimeType)) return bad("รองรับเฉพาะ JPEG/PNG/WebP");

  try {
    // r31: prompt อยู่ใน lib/ai/patterns/receipt_scan.md (คลัง pattern แบบ Fabric)
    const client = getAnthropic();
    const response = await client.messages.parse({
      model: AI_MODEL,
      max_tokens: 4096,
      system: loadPattern("receipt_scan"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType as "image/jpeg" | "image/png" | "image/webp",
                data: imageBase64,
              },
            },
            { type: "text", text: "อ่านใบเสร็จนี้แล้วดึงรายการสินค้าทั้งหมด" },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(ReceiptSchema) },
    });

    if (response.stop_reason === "refusal") {
      return bad("ระบบอ่านรูปนี้ไม่ได้ — ลองถ่ายใหม่ให้เห็นเฉพาะใบเสร็จชัดๆ", 422);
    }
    const parsed = response.parsed_output;
    if (!parsed) {
      return bad("อ่านใบเสร็จไม่สำเร็จ (รูปแบบผลลัพธ์ไม่ถูกต้อง) — ลองถ่ายใหม่ให้ชัดขึ้น", 502);
    }
    const items = parsed.items
      .filter((it) => it.name.trim())
      .map((it) => ({
        name: it.name.trim(),
        quantity: Number.isFinite(it.quantity) && it.quantity > 0 ? it.quantity : 1,
        totalPrice: Number.isFinite(it.totalPrice) && it.totalPrice >= 0 ? it.totalPrice : 0,
        unit: it.unit?.trim() || undefined,
      }));
    return NextResponse.json({
      ok: true,
      scan: { store: parsed.store.trim(), date: parsed.date.trim(), items, total: parsed.total },
      usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
    });
  } catch (e) {
    const { message, status } = describeAiError(e, "อ่านใบเสร็จ");
    return bad(message, status);
  }
}
