import { redisRateLimit } from "@/lib/redisCache";

/** Calls to the AI routes allowed per user per hour (all AI features
 *  together). Generous for real use — a busy day is a few dozen — while
 *  a stuck loop or a scripted caller stops at the cap. */
export const AI_CALLS_PER_HOUR = 40;

/** true when this user may make another AI call this hour (audit r37 M4). */
export async function aiCallAllowed(email: string): Promise<boolean> {
  const hour = Math.floor(Date.now() / 3_600_000);
  return redisRateLimit(`apt:v1:ai:${email.toLowerCase()}:${hour}`, AI_CALLS_PER_HOUR, 3600);
}

export const AI_LIMIT_MESSAGE = "ใช้ผู้ช่วย AI ครบโควตาชั่วโมงนี้แล้ว — ลองใหม่ในชั่วโมงถัดไป";
