/**
 * คลัง "pattern" แบบ Fabric (danielmiessler/Fabric) — r31.
 *
 * prompt แต่ละงานเป็นไฟล์ .md ใน lib/ai/patterns/ โครง IDENTITY / STEPS /
 * OUTPUT แยกจากโค้ด: เจ้าของแก้ถ้อยคำ/กติกาได้เองโดยไม่ต้องแตะ TypeScript
 * และทุกฟีเจอร์ AI ใช้ตัวโหลด + ตัวแปล error ชุดเดียวกัน.
 *
 * Server-only (อ่านไฟล์ด้วย fs) — ห้าม import จาก client component.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

export type PatternName = "line_to_task" | "daily_report" | "receipt_scan";

const cache = new Map<PatternName, string>();

export function loadPattern(name: PatternName): string {
  const hit = cache.get(name);
  if (hit) return hit;
  const text = readFileSync(join(process.cwd(), "lib", "ai", "patterns", `${name}.md`), "utf8");
  cache.set(name, text);
  return text;
}

/** โมเดลเดียวทุก pattern — เปลี่ยนที่นี่ที่เดียว */
export const AI_MODEL = "claude-opus-5";

export class AiSetupError extends Error {
  status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.name = "AiSetupError";
    this.status = status;
  }
}

/** client พร้อมใช้ หรือ throw AiSetupError (ไม่มี key) ให้ route ตอบ 503 พร้อมวิธีตั้งค่า */
export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiSetupError(
      "ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY ใน Vercel (Settings → Environment Variables) — ตั้งแล้ว redeploy ครั้งเดียว",
    );
  }
  return new Anthropic();
}

/** แปล error จาก SDK/setup เป็น {message, status} ภาษาคน ใช้ร่วมทุก route */
export function describeAiError(e: unknown, what = "ประมวลผล"): { message: string; status: number } {
  if (e instanceof AiSetupError) return { message: e.message, status: e.status };
  if (e instanceof Anthropic.AuthenticationError) {
    return { message: "ANTHROPIC_API_KEY ไม่ถูกต้อง — ตรวจค่าที่ตั้งใน Vercel", status: 503 };
  }
  if (e instanceof Anthropic.RateLimitError) {
    return { message: `ระบบ AI ถูกใช้งานถี่เกินไป — รอสักครู่แล้วลอง${what}ใหม่`, status: 429 };
  }
  if (e instanceof Anthropic.APIError) {
    return { message: `${what}ไม่สำเร็จ (${e.status}): ${e.message}`, status: 502 };
  }
  return { message: `${what}ไม่สำเร็จ: ${e instanceof Error ? e.message : "unknown"}`, status: 502 };
}
