import { NextResponse } from "next/server";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { auth } from "@/auth";
import { canAddCleanTask, canAddEngTask, canAddSalesTask } from "@/lib/permissions";
import { AI_MODEL, describeAiError, getAnthropic, loadPattern } from "@/lib/ai/patterns";
import { cleanParsedTask, TASK_TYPES_ALL } from "@/lib/ai/taskParse";
import { bangkokTodayYmd } from "@/lib/dateUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/ai/parse-task (r31 — pattern "line_to_task")
 * body: { text, buildings: string[], rooms?: {building,room}[] }
 * → { ok, task: CleanParsedTask }  — ผลไปเติมฟอร์มเพิ่มงาน ผู้ใช้ตรวจก่อนบันทึก
 *
 * แปะข้อความ LINE ("ห้อง 204 แอร์ไม่เย็น มาดูพรุ่งนี้บ่ายได้ไหม") →
 * ประเภท/ตึก/ห้อง/วัน/เวลา/ชื่อ/เบอร์/หมายเหตุ. วันแบบพูด ("พรุ่งนี้",
 * "ศุกร์หน้า") อิง "วันนี้" ตามเวลาไทยที่ส่งให้โมเดล.
 */

const Schema = z.object({
  type: z.enum(TASK_TYPES_ALL),
  building: z.string().describe("ชื่อตึกจากรายชื่อที่ให้ — ว่างถ้าไม่ระบุ"),
  room: z.string().describe("เลขห้อง — ว่างถ้าไม่ระบุ"),
  date: z.string().describe("yyyy-MM-dd"),
  time: z.string().describe("HH:mm หรือว่าง"),
  customer: z.string(),
  phone: z.string().describe("ตัวเลขล้วน หรือว่าง"),
  note: z.string(),
  unsure: z.array(z.string()).describe("ชื่อช่องที่เดา: type, building, room, date, time, customer, phone, note"),
});

const THAI_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  const roles = session.user.roles;
  if (!canAddSalesTask(roles) && !canAddEngTask(roles) && !canAddCleanTask(roles)) {
    return bad("ไม่มีสิทธิ์เพิ่มงาน", 403);
  }

  let body: { text?: unknown; buildings?: unknown; rooms?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid JSON");
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return bad("ใส่ข้อความก่อน");
  if (text.length > 4000) return bad("ข้อความยาวเกินไป (เกิน 4,000 ตัวอักษร)");
  const buildings = Array.isArray(body.buildings)
    ? (body.buildings as unknown[]).filter((b): b is string => typeof b === "string" && b.trim() !== "" && b !== "ทั้งหมด")
    : [];
  const rooms = Array.isArray(body.rooms)
    ? (body.rooms as { building?: unknown; room?: unknown }[])
        .filter((r) => typeof r?.building === "string" && typeof r?.room === "string")
        .map((r) => ({ building: String(r.building), room: String(r.room) }))
    : [];

  const today = bangkokTodayYmd();
  const weekday = THAI_DAYS[new Date(`${today}T00:00:00+07:00`).getDay()];

  try {
    const client = getAnthropic();
    const response = await client.messages.parse({
      model: AI_MODEL,
      max_tokens: 1500,
      system: loadPattern("line_to_task"),
      messages: [
        {
          role: "user",
          content:
            `วันนี้: ${today} (วัน${weekday})\n` +
            `รายชื่อตึก: ${buildings.length ? buildings.join(", ") : "(ไม่ระบุ)"}\n\n` +
            `ข้อความ LINE:\n"""\n${text}\n"""`,
        },
      ],
      output_config: { format: zodOutputFormat(Schema) },
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return bad("อ่านข้อความนี้ไม่ได้ — ลองพิมพ์สั้นๆ ว่า ห้องไหน เรื่องอะไร วันไหน", 422);
    }
    const task = cleanParsedTask(response.parsed_output, { today, buildings, rooms });
    return NextResponse.json({ ok: true, task });
  } catch (e) {
    const { message, status } = describeAiError(e, "อ่านข้อความ");
    return bad(message, status);
  }
}
