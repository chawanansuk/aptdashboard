import { test, expect } from "@playwright/test";
import { storageStatePath } from "./paths";
import { mockDashboard, room } from "./fixtures";

test.use({ storageState: storageStatePath("management") });

/**
 * บันทึกการซื้อ (v3.28): ปุ่ม "เติม" เปิดโมดัลจดราคาซื้อ, ลูกศรแนวโน้ม
 * ▲▼ ข้างราคา/หน่วย, แบนเนอร์ยอดซื้อเดือนนี้, และแท็บ "ซื้อเข้า" ในประวัติ.
 */

const PART = {
  id: "p1", name: "ทิชชู่ม้วนใหญ่", category: "ของสิ้นเปลือง",
  stock: 4, threshold: 6, unit: "แพ็ค", price: 189,
  note: "", creator: "e2e", createdAt: "2026-07-01 09:00", updatedAt: "2026-08-20 09:00",
};

function ymNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const PURCHASES = [
  { id: "b2", partId: "p1", partName: "ทิชชู่ม้วนใหญ่", quantity: 6, totalPrice: 1134, unitPrice: 189, store: "แมคโคร", creator: "e2e@x", date: `${ymNow()}-05`, createdAt: `${ymNow()}-05 10:00` },
  { id: "b1", partId: "p1", partName: "ทิชชู่ม้วนใหญ่", quantity: 6, totalPrice: 1050, unitPrice: 175, store: "แมคโคร", creator: "e2e@x", date: "2026-07-03", createdAt: "2026-07-03 10:00" },
];

type RouteHandler = Parameters<import("@playwright/test").Page["route"]>[1];

async function openParts(page: import("@playwright/test").Page, purchasesRoute: RouteHandler) {
  await mockDashboard(page, { rooms: [room({ building: "มีทอง", room: "101", status: "ว่าง" })], tasks: [] });
  // ลงทะเบียนหลัง mockDashboard เสมอ — ตัวที่ลงทีหลังชนะ (harness quirk)
  await page.route("**/api/part-purchases**", purchasesRoute);
  await page.route("**/api/parts", (r) =>
    r.request().method() === "GET"
      ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [PART] }) })
      : r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }));
  await page.route("**/api/part-requisitions**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [] }) }));
  await page.goto("/");
  await page.addStyleTag({ content: "nextjs-portal{display:none} .ac-health-banner{display:none}" });
  await page.locator('button[aria-label="อะไหล่"]').evaluate((el) => (el as HTMLElement).click());
  await expect(page.locator(".ac-parts")).toBeVisible();
}

test("trend arrow + month spend banner + purchase history tab", async ({ page }) => {
  await openParts(page, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: PURCHASES }) }));

  // 189 vs 175 ครั้งก่อน = แพงขึ้น 8%
  await expect(page.locator(".ac-buy-up")).toContainText("▲8%");
  // ยอดซื้อเดือนนี้ = เฉพาะรายการเดือนปัจจุบัน (1,134)
  await expect(page.locator(".ac-parts-value-banner").first()).toContainText("ซื้อเข้าเดือนนี้ 1,134 บาท");

  // ประวัติ → แท็บซื้อเข้า
  await page.getByRole("button", { name: "ประวัติ" }).click();
  await page.getByRole("tab", { name: /ซื้อเข้า/ }).click();
  const modal = page.locator(".ac-modal");
  await expect(modal).toContainText("1,134 ฿");
  await expect(modal).toContainText("▲ +8%");
  await expect(modal).toContainText("🏪 แมคโคร");
});

test("เติม opens purchase modal and posts quantity+price+store", async ({ page }) => {
  const posted: Record<string, unknown>[] = [];
  await openParts(page, (r) => {
    if (r.request().method() === "POST") {
      posted.push(r.request().postDataJSON() as Record<string, unknown>);
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, result: { appended: true, unitPrice: 199, prevUnitPrice: 189, newStock: 10 } }) });
    }
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [] }) });
  });

  await page.locator(".ac-parts-quick-input").fill("6");
  await page.getByRole("button", { name: "เติม" }).click();
  const modal = page.locator(".ac-modal");
  await expect(modal).toContainText("ซื้อเข้า — ทิชชู่ม้วนใหญ่");
  await expect(modal.locator("#pur-qty")).toHaveValue("6"); // prefill จากช่องในตาราง
  await modal.locator("#pur-total").fill("1194");
  await expect(modal).toContainText("199 ฿/แพ็ค"); // preview ราคา/หน่วย
  await modal.getByRole("button", { name: "แมคโคร" }).click();
  await modal.getByRole("button", { name: "บันทึกซื้อเข้า" }).click();
  await expect(modal).toBeHidden();

  expect(posted[0]).toMatchObject({
    action: "add", partId: "p1", quantity: 6, totalPrice: 1194, store: "แมคโคร",
  });
  expect(String(posted[0].date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
