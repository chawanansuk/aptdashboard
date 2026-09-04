import { test, expect } from "@playwright/test";
import { storageStatePath } from "./paths";
import { mockDashboard, room } from "./fixtures";

test.use({ storageState: storageStatePath("management") });

/**
 * สแกนใบเสร็จ (r28): เลือกรูป → /api/receipt-scan (mock Claude) → ตาราง
 * ตรวจสอบจับคู่ของในคลังอัตโนมัติ → แก้/ข้ามได้ → บันทึกยิง
 * /api/part-purchases ต่อบรรทัดพร้อมร้าน/วันที่จากบิล.
 */

const PARTS = [
  { id: "p1", name: "ทิชชู่ม้วนใหญ่ สก็อตต์", category: "ของสิ้นเปลือง", stock: 4, threshold: 6, unit: "แพ็ค", price: 189, note: "", creator: "e2e", createdAt: "2026-07-01 09:00", updatedAt: "2026-08-20 09:00" },
  { id: "p2", name: "น้ำยาถูพื้น 5 ลิตร", category: "ของสิ้นเปลือง", stock: 3, threshold: 2, unit: "แกลลอน", price: 145, note: "", creator: "e2e", createdAt: "2026-07-01 09:00", updatedAt: "2026-08-28 09:00" },
];

const TINY = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("scan → review with auto-match → save posts purchases", async ({ page }) => {
  const posted: Record<string, unknown>[] = [];
  await mockDashboard(page, { rooms: [room({ building: "มีทอง", room: "101", status: "ว่าง" })], tasks: [] });
  await page.route("**/api/parts", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: PARTS }) }));
  await page.route("**/api/part-requisitions**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [] }) }));
  await page.route("**/api/part-purchases**", (r) => {
    if (r.request().method() === "POST") {
      posted.push(r.request().postDataJSON() as Record<string, unknown>);
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, result: { appended: true, unitPrice: 199, prevUnitPrice: 189 } }) });
    }
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [] }) });
  });
  await page.route("**/api/receipt-scan", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, scan: {
      store: "แมคโคร", date: "2026-08-25", total: 1487,
      items: [
        { name: "SCOTT ทิชชู่ม้วนใหญ่ 24R", quantity: 6, totalPrice: 1194 },
        { name: "MAGIC CLEAN น้ำยาถูพื้น 5L", quantity: 2, totalPrice: 290 },
        { name: "กาแฟ 3in1 ถุงใหญ่", quantity: 1, totalPrice: 120 }, // ไม่มีในคลัง → ข้าม
      ],
    } }) }));

  await page.goto("/");
  await page.addStyleTag({ content: "nextjs-portal{display:none} .ac-health-banner{display:none}" });
  await page.locator('button[aria-label="อะไหล่"]').evaluate((el) => (el as HTMLElement).click());
  await page.getByRole("button", { name: "📷 สแกนใบเสร็จ" }).click();

  const modal = page.locator(".ac-receipt-modal");
  await expect(modal).toBeVisible();
  // ปุ่มอ่านถูกล็อกจนกว่าจะมีรูป
  await expect(modal.getByRole("button", { name: "อ่านใบเสร็จ" })).toBeDisabled();
  await modal.locator('input[type="file"]').setInputFiles({ name: "bill.png", mimeType: "image/png", buffer: Buffer.from(TINY, "base64") });
  await expect(modal.locator(".ac-receipt-preview")).toBeVisible();
  await modal.getByRole("button", { name: "อ่านใบเสร็จ" }).click();

  // ตารางตรวจสอบ: ร้าน/วันที่จากบิล, 2 บรรทัดจับคู่ได้, 1 บรรทัดข้าม
  await expect(modal.locator("#rc-store")).toHaveValue("แมคโคร");
  await expect(modal.locator("#rc-date")).toHaveValue("2026-08-25");
  const rows = modal.locator(".ac-receipt-table tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).locator("select")).toHaveValue("p1");
  await expect(rows.nth(1).locator("select")).toHaveValue("p2");
  await expect(rows.nth(2).locator("select")).toHaveValue("");
  await expect(rows.nth(0)).toContainText("▲5%"); // 199 vs 189 เดิม
  await expect(modal.locator(".ac-receipt-sum")).toContainText("จะบันทึก 2 รายการ");

  // แก้จำนวนบรรทัดแรกก่อนบันทึก
  await rows.nth(0).locator('input[aria-label="จำนวน"]').fill("5");
  await modal.getByRole("button", { name: "บันทึกซื้อ 2 รายการ" }).click();
  await expect(modal).toBeHidden();

  expect(posted).toHaveLength(2);
  expect(posted[0]).toMatchObject({ action: "add", partId: "p1", quantity: 5, totalPrice: 1194, store: "แมคโคร", date: "2026-08-25" });
  expect(posted[1]).toMatchObject({ action: "add", partId: "p2", quantity: 2, totalPrice: 290 });
});

test("missing API key surfaces the setup hint instead of a generic error", async ({ page }) => {
  await mockDashboard(page, { rooms: [room({ building: "มีทอง", room: "101", status: "ว่าง" })], tasks: [] });
  await page.route("**/api/parts", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: PARTS }) }));
  await page.route("**/api/part-requisitions**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [] }) }));
  await page.route("**/api/part-purchases**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [] }) }));
  await page.route("**/api/receipt-scan", (r) =>
    r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY ใน Vercel" }) }));
  await page.goto("/");
  await page.addStyleTag({ content: "nextjs-portal{display:none} .ac-health-banner{display:none}" });
  await page.locator('button[aria-label="อะไหล่"]').evaluate((el) => (el as HTMLElement).click());
  await page.getByRole("button", { name: "📷 สแกนใบเสร็จ" }).click();
  const modal = page.locator(".ac-receipt-modal");
  await modal.locator('input[type="file"]').setInputFiles({ name: "bill.png", mimeType: "image/png", buffer: Buffer.from(TINY, "base64") });
  await modal.getByRole("button", { name: "อ่านใบเสร็จ" }).click();
  await expect(modal.locator(".ac-banner-warn")).toContainText("ANTHROPIC_API_KEY");
  // ยังอยู่หน้าเลือกรูป กดอ่านใหม่ได้
  await expect(modal.getByRole("button", { name: "อ่านใบเสร็จ" })).toBeEnabled();
});
