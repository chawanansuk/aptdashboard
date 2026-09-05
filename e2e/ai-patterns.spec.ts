import { test, expect } from "@playwright/test";
import { storageStatePath } from "./paths";
import { mockDashboard, room, type MockTask } from "./fixtures";

test.use({ storageState: storageStatePath("management") });

/**
 * AI patterns (r31, แนว Fabric):
 *  1. line_to_task — แปะข้อความ LINE ในฟอร์มเพิ่มงาน → /api/ai/parse-task (mock)
 *     → เติมประเภท/ตึก/ห้อง/วัน/ชื่อ/เบอร์/หมายเหตุ + ป้าย "เช็คช่อง" สำหรับที่ AI เดา
 *  2. daily_report — หน้าบันทึกซ่อมบำรุง "✨ สรุปส่ง LINE" → /api/ai/report (mock)
 *     → โมดัลข้อความแก้ได้ + คัดลอก
 * ไม่มีการเรียก Claude จริง — mock ที่ขอบ API เท่านั้น.
 */

function ymd(offsetDays: number): string {
  const x = new Date(Date.now() + offsetDays * 864e5);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

async function openAddTaskViaQuickMenu(page: import("@playwright/test").Page, item: string) {
  await page.goto("/");
  await page.addStyleTag({ content: "nextjs-portal{display:none} .ac-health-banner{display:none}" });
  await page.locator(".ac-add-btn").first().evaluate((el) => (el as HTMLElement).click());
  await page.getByRole("menuitem", { name: item }).click();
  await expect(page.locator("#ac-addtask-title")).toBeVisible();
}

test("paste LINE text → AI fills the add-task form and flags guessed fields", async ({ page }) => {
  const posted: Record<string, unknown>[] = [];
  const tomorrow = ymd(1);
  await mockDashboard(page, {
    rooms: [room({ building: "มีทอง", room: "204", status: "ว่าง" }), room({ building: "มั่งมี", room: "101", status: "ว่าง" })],
    tasks: [],
  });
  await page.route("**/api/ai/parse-task", (r) => {
    posted.push(r.request().postDataJSON() as Record<string, unknown>);
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, task: {
      type: "ชมห้อง", building: "มีทอง", room: "204", date: tomorrow, time: "14:00",
      customer: "คุณนก", phone: "0812345678", note: "ขอดูห้องมุม", unsure: ["date"],
    } }) });
  });

  await openAddTaskViaQuickMenu(page, "นัดชมห้อง");
  const modal = page.locator(".ac-modal");
  await modal.locator(".ac-ai-paste summary").click();
  const readBtn = modal.getByRole("button", { name: "✨ ให้ AI อ่าน" });
  await expect(readBtn).toBeDisabled(); // ยังไม่มีข้อความ
  await modal.locator('textarea[aria-label="ข้อความ LINE"]').fill("ห้อง 204 มีทอง คุณนก ขอชมห้องพรุ่งนี้บ่ายสอง 081-234-5678 อยากดูห้องมุม");
  await readBtn.click();

  await expect(modal.locator("#ac-addtask-type")).toHaveValue("ชมห้อง");
  await expect(modal.locator("#ac-addtask-building")).toHaveValue("มีทอง");
  await expect(modal.locator("#ac-addtask-room")).toHaveValue("204");
  await expect(modal.locator("#ac-addtask-date")).toHaveValue(tomorrow);
  await expect(modal.locator("#ac-addtask-customer")).toHaveValue("คุณนก");
  await expect(modal.locator("#ac-addtask-phone")).toHaveValue("0812345678");
  await expect(modal.locator("#ac-addtask-note")).toHaveValue("เวลา 14:00 · ขอดูห้องมุม");
  await expect(modal.locator(".ac-ai-unsure")).toContainText("เช็คช่อง: วันที่");

  // ส่งข้อความ + รายชื่อตึกจริงให้ API (ไม่มี "ทั้งหมด")
  expect(posted).toHaveLength(1);
  expect(posted[0].text).toContain("ห้อง 204 มีทอง");
  expect(posted[0].buildings).toEqual(expect.arrayContaining(["มีทอง", "มั่งมี"]));
  expect(posted[0].buildings).not.toContain("ทั้งหมด");
});

test("parse-task error (no API key) shows the server message as a toast; form untouched", async ({ page }) => {
  await mockDashboard(page, { rooms: [room({ building: "มีทอง", room: "204", status: "ว่าง" })], tasks: [] });
  await page.route("**/api/ai/parse-task", (r) =>
    r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY ใน Vercel" }) }));
  await openAddTaskViaQuickMenu(page, "นัดซ่อม");
  const modal = page.locator(".ac-modal");
  await modal.locator(".ac-ai-paste summary").click();
  await modal.locator('textarea[aria-label="ข้อความ LINE"]').fill("ห้อง 204 แอร์ไม่เย็น");
  await modal.getByRole("button", { name: "✨ ให้ AI อ่าน" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "ANTHROPIC_API_KEY" })).toBeVisible();
  await expect(modal.locator("#ac-addtask-type")).toHaveValue("ซ่อม");
  await expect(modal.locator("#ac-addtask-room")).toHaveValue("");
  await expect(modal.getByRole("button", { name: "✨ ให้ AI อ่าน" })).toBeEnabled();
});

const TASKS: MockTask[] = [
  { date: ymd(0), type: "ซ่อม", building: "มั่งมี", room: "101", customer: "", phone: "", note: "เปลี่ยนหลอดไฟทางเดิน", status: "เสร็จ" },
  { date: ymd(0), type: "ทำสะอาด", building: "มั่งมี", room: "102", customer: "", phone: "", note: "ล้างแอร์ประจำปี", status: "เสร็จ" },
];

test("maintlog → ✨ สรุปส่ง LINE → AI report modal is editable and copies", async ({ page, context }) => {
  const posted: Record<string, unknown>[] = [];
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await mockDashboard(page, { rooms: [room({ building: "มั่งมี", room: "101", status: "ว่าง" })], tasks: TASKS });
  await page.route("**/api/ai/report", (r) => {
    posted.push(r.request().postDataJSON() as Record<string, unknown>);
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, text: "📋 สรุปงานวันนี้\n• เปลี่ยนหลอดไฟทางเดิน ห้อง 101 ✅\n• ล้างแอร์ประจำปี ห้อง 102 ✅" }) });
  });

  await page.goto("/");
  await page.addStyleTag({ content: "nextjs-portal{display:none} .ac-health-banner{display:none}" });
  await page.locator('button[aria-label="บันทึกซ่อมบำรุง"]').evaluate((el) => (el as HTMLElement).click());
  await expect(page.locator(".ac-mlog")).toBeVisible();
  await page.getByRole("button", { name: "✨ สรุปส่ง LINE" }).click();

  const modal = page.locator(".ac-ai-report");
  await expect(modal).toBeVisible();
  const box = modal.locator('textarea[aria-label="ข้อความรายงาน"]');
  await expect(box).toHaveValue(/เปลี่ยนหลอดไฟทางเดิน/);
  // แก้ถ้อยคำได้ก่อนคัดลอก
  await box.fill("ข้อความที่แก้แล้ว");
  await modal.getByRole("button", { name: "📋 คัดลอกไปวาง LINE" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "คัดลอก" })).toBeVisible();

  // ส่ง digest ของหน้านี้ (ไม่ดึงชีทเพิ่ม) พร้อมป้ายช่วงเวลา
  expect(posted).toHaveLength(1);
  expect(String(posted[0].digestMarkdown)).toContain("เปลี่ยนหลอดไฟทางเดิน");
  expect(String(posted[0].periodLabel)).not.toBe("");
});

test("report error shows the server message inside the modal", async ({ page }) => {
  await mockDashboard(page, { rooms: [room({ building: "มั่งมี", room: "101", status: "ว่าง" })], tasks: TASKS });
  await page.route("**/api/ai/report", (r) =>
    r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY ใน Vercel" }) }));
  await page.goto("/");
  await page.addStyleTag({ content: "nextjs-portal{display:none} .ac-health-banner{display:none}" });
  await page.locator('button[aria-label="บันทึกซ่อมบำรุง"]').evaluate((el) => (el as HTMLElement).click());
  await page.getByRole("button", { name: "✨ สรุปส่ง LINE" }).click();
  const modal = page.locator(".ac-ai-report");
  await expect(modal.locator(".ac-banner-warn")).toContainText("ANTHROPIC_API_KEY");
  await expect(modal.getByRole("button", { name: "📋 คัดลอกไปวาง LINE" })).toBeDisabled();
});
