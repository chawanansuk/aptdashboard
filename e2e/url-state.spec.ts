import { test, expect } from "@playwright/test";
import { storageStatePath } from "./paths";
import { mockDashboard, room } from "./fixtures";

test.use({ storageState: storageStatePath("management") });

/**
 * URL ต่อหน้า (UI audit r21) — ?view=&building=&room= sync สองทาง:
 * เปลี่ยนหน้า/เปิดห้องแล้ว URL ตาม, back/forward ย้อน state, deep link
 * เปิดตรงหน้า/ห้องที่แชร์มา, document.title ต่อหน้า.
 */

const ROOMS = [
  room({ building: "มีทอง", room: "101", status: "ว่าง", price: "4500" }),
  room({ building: "มีทอง", room: "102", status: "มีคนอยู่" }),
  room({ building: "มั่งมี", room: "201", status: "ว่าง" }),
];

async function open(page: import("@playwright/test").Page, path = "/") {
  await mockDashboard(page, { rooms: ROOMS, tasks: [] });
  await page.goto(path);
  await page.addStyleTag({ content: "nextjs-portal{display:none} .ac-health-banner{display:none}" });
  // useUrlSync ใช้ replaceState ตลอด 500ms แรก (ช่วง canonicalize/mode
  // landing) — เทสคลิกเร็วกว่าคนจริง ต้องรอพ้นหน้าต่างนั้นก่อน history
  // ถึงจะ push ตามที่เทสคาด
  await page.waitForTimeout(600);
}

function clickNav(page: import("@playwright/test").Page, label: string) {
  // Sidebar items can sit outside the e2e viewport — programmatic click.
  return page.locator(`.ac-side button:has-text("${label}")`).first()
    .evaluate((el) => (el as HTMLElement).click());
}

test("navigating updates URL + title; back/forward walk the views", async ({ page }) => {
  await open(page);
  await expect(page).toHaveURL(/view=overview/);
  await expect(page).toHaveTitle(/ภาพรวม · APARTCLOUD/);

  await clickNav(page, "ผู้เช่า");
  await expect(page).toHaveURL(/view=tenants/);
  await expect(page).toHaveTitle(/ผู้เช่า · APARTCLOUD/);

  await clickNav(page, "ปฏิทิน");
  await expect(page).toHaveURL(/view=calendar/);

  await page.goBack();
  await expect(page).toHaveURL(/view=tenants/);
  await expect(page.locator(".ac-page-title").first()).toContainText("ผู้เช่า");

  await page.goForward();
  await expect(page).toHaveURL(/view=calendar/);
});

test("deep link ?view=tenants&building=มีทอง beats the mode landing", async ({ page }) => {
  await open(page, `/?view=tenants&building=${encodeURIComponent("มีทอง")}`);
  await expect(page.locator(".ac-page-title").first()).toContainText("ผู้เช่า");
  await expect(page.locator(".ac-page-title").first()).toContainText("มีทอง");
  await expect(page).toHaveURL(/view=tenants/);
});

test("room modal: open pushes ?room=, back closes it, deep link opens it", async ({ page }) => {
  await open(page);
  await page.locator(".ac-rc").filter({ hasText: "101" }).first().click();
  await expect(page.locator(".ac-modal")).toBeVisible();
  await expect(page).toHaveURL(/room=/);

  // Back = close modal (สำคัญบนมือถือ)
  await page.goBack();
  await expect(page.locator(".ac-modal")).toBeHidden();
  await expect(page).not.toHaveURL(/room=/);

  // Deep link straight into the room
  await page.goto(`/?view=overview&room=${encodeURIComponent("มีทอง:101")}`);
  await expect(page.locator(".ac-modal")).toBeVisible();
  await expect(page.locator(".ac-modal")).toContainText("101");
});
