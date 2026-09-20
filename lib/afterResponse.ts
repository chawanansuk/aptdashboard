import { after } from "next/server";

/**
 * "งานที่ทำต่อหลังส่ง response แล้ว" — r37.
 *
 * ปัญหาที่ log production เปิดเผย: Vercel แช่แข็ง (freeze) instance ทันทีที่
 * response ถูกส่งออก งาน fire-and-forget ที่ยังค้างอยู่ (`void doSomething()`)
 * จึงถูกตัดกลางคัน แล้วไปเดินต่อตอนมี request ถัดไปมาปลุก — หรือไม่ได้เดินเลย
 * ถ้า instance ถูกรีไซเคิลก่อน. อาการที่เห็นคือ `[redis] SET not stored
 * { ms: 296607 }` (เวลาเดิน 5 นาที ทั้งที่ timeout 8 วินาที) และ L2 ว่างตลอด.
 *
 * `after()` บอก Vercel ว่ายังมีงานค้าง ให้รอจนเสร็จก่อนแช่แข็ง โดยที่ผู้ใช้
 * ได้ response ไปแล้ว (ไม่ได้รอ). ใช้กับงานที่ "ควรเสร็จ แต่ไม่ควรถ่วงผู้ใช้":
 * เขียนแคชกลาง, revalidate เบื้องหลัง.
 *
 * นอก request scope (เทส, สคริปต์, งานที่ detach ไปแล้วจริงๆ) after() จะ throw
 * — กลืนแล้วปล่อยเป็น floating promise ตามพฤติกรรมเดิม ไม่ทำให้อะไรพัง.
 */
export function runAfterResponse<T>(work: Promise<T>): Promise<T> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    after(work);
  } catch {
    /* no request scope — best effort */
  }
  return work;
}
