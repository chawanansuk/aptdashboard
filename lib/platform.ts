/**
 * Platform helpers (UI audit r20).
 *
 * modKey(): ป้ายคีย์ลัดที่ถูกต้องตามเครื่องผู้ใช้ — เดิม UI hardcode "⌘"
 * ทุกจุด ทั้งที่ผู้ใช้จริงส่วนใหญ่อยู่บน Windows (ปุ่มจริงคือ Ctrl).
 * ตัว handler รองรับทั้ง metaKey/ctrlKey อยู่แล้ว — แก้เฉพาะป้ายที่โชว์.
 *
 * SSR-safe: ฝั่ง server (ไม่มี navigator) คืน "Ctrl" — คอมโพเนนต์ที่
 * เรนเดอร์ตั้งแต่ SSR ควรอ่านผ่าน useModKey() เพื่อกัน hydration mismatch;
 * ส่วน modal ที่ mount หลัง interaction เรียก modKey() ตรงๆ ได้เลย.
 */

import { useEffect, useState } from "react";

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const plat =
    (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    navigator.platform ||
    "";
  return /mac|iphone|ipad|ipod/i.test(plat);
}

/** "⌘" บน macOS/iOS, "Ctrl" ที่อื่น (รวมตอน SSR). */
export function modKey(): string {
  return isMac() ? "⌘" : "Ctrl";
}

/** เวอร์ชัน hook สำหรับคอมโพเนนต์ที่ SSR — เริ่มด้วยค่า server ("Ctrl")
 *  แล้วอัปเดตหลัง mount เพื่อไม่ให้ hydration mismatch. */
export function useModKey(): string {
  const [key, setKey] = useState("Ctrl");
  useEffect(() => { setKey(modKey()); }, []);
  return key;
}
