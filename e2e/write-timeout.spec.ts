import { test, expect } from "@playwright/test";
import { storageStatePath } from "./paths";
import { mockDashboard, room } from "./fixtures";

test.use({ storageState: storageStatePath("management") });

/**
 * r32 — "หลังบ้าน Google ตอบช้าเกินไป" ตอนบันทึก: เซิร์ฟเวอร์ตอบ 504 (รอ Google
 * เต็มงบแล้ว) → ฝั่งเว็บไม่ยิงซ้ำเอง แต่ดึงรายการงานสดมาเช็คว่างานเข้าแล้วหรือยัง
 * แล้วบอกทางเดียวชัดๆ: เข้าแล้ว (ปิดฟอร์ม) หรือยังไม่เข้า (ฟอร์มยังอยู่ กดใหม่).
 */

const TIMEOUT_BODY = JSON.stringify({
  ok: false, timedOut: true,
  error: "หลังบ้าน Google ตอบช้า — รายการอาจบันทึกไปแล้ว รีเฟรชดูก่อน ถ้ายังไม่ขึ้นค่อยกดใหม่",
});

function todayDmy(): string {
  const x = new Date();
  return `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")}/${x.getFullYear()}`;
}

async function setup(page: import("@playwright/test").Page, landsAfterTimeout: boolean) {
  let posts = 0;
  let timedOut = false;
  await mockDashboard(page, { rooms: [room({ building: "มีทอง", room: "204", status: "ว่าง" })], tasks: [] });
  await page.route("**/api/dashboard/tasks**", (r) => {
    const tasks = timedOut && landsAfterTimeout
      ? [{ date: todayDmy(), type: "ซ่อม", building: "มีทอง", room: "204", customer: "", phone: "", note: "แอร์ไม่เย็น", status: "" }]
      : [];
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ tasks }) });
  });
  await page.route("**/api/sheet/update", (r) => {
    posts++;
    timedOut = true;
    return r.fulfill({ status: 504, contentType: "application/json", body: TIMEOUT_BODY });
  });
  await page.goto("/");
  await page.addStyleTag({ content: "nextjs-portal{display:none} .ac-health-banner{display:none}" });
  await page.locator(".ac-add-btn").first().evaluate((el) => (el as HTMLElement).click());
  await page.getByRole("menuitem", { name: "นัดซ่อม" }).click();
  const modal = page.locator(".ac-modal");
  await expect(modal.locator("#ac-addtask-title")).toBeVisible();
  await modal.locator("#ac-addtask-building").selectOption("มีทอง");
  await modal.locator("#ac-addtask-room").fill("204");
  await modal.locator("#ac-addtask-note").fill("แอร์ไม่เย็น");
  await modal.locator('button[type="submit"]').click();
  return { modal, getPosts: () => posts };
}

test("timeout but the row landed → verified success, form closes, no client re-post", async ({ page }) => {
  const { modal, getPosts } = await setup(page, true);
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "รายการเข้าแล้ว" })).toBeVisible({ timeout: 15_000 });
  await expect(modal).toBeHidden();
  expect(getPosts()).toBe(1); // 504 ไม่ถูก retry ฝั่งเบราว์เซอร์
});

test("timeout and nothing landed → clear 'not saved' message, form stays for one deliberate retry", async ({ page }) => {
  const { modal, getPosts } = await setup(page, false);
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "ยังไม่ได้บันทึก" })).toBeVisible({ timeout: 15_000 });
  await expect(modal.locator("#ac-addtask-title")).toBeVisible();
  await expect(modal.locator("#ac-addtask-note")).toHaveValue("แอร์ไม่เย็น");
  expect(getPosts()).toBe(1);
});
