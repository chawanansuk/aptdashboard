import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import { storageStatePath } from "./paths";
import { mockDashboard, type MockRoom, type MockTask } from "./fixtures";

/**
 * UI review harness — NOT a regression spec. Boots the real app with
 * rich, realistic mock data and captures screenshots of every major
 * surface in light/dark × desktop/mobile, for a human (or agent) design
 * pass. Run on demand:
 *
 *   npx playwright test e2e/ui-review.spec.ts
 *
 * Screenshots land in e2e/.ui-review/ (gitignored via .auth sibling? —
 * the folder is disposable; delete after reviewing).
 */

const OUT = process.env.UI_REVIEW_OUT || "e2e/.ui-review";

function d(offsetDays: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + offsetDays);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${dt.getFullYear()}`;
}

function mk(building: string, floor: string, num: string, status: string, over: Partial<MockRoom> = {}): MockRoom {
  return {
    building, room: num, floor, price: "4500",
    status, tenant: "", phone: "", contractEnd: "", ...over,
  };
}

const ROOMS: MockRoom[] = [
  // ตึก มั่งมี — 2 ชั้น คละสถานะครบทุกสี
  mk("มั่งมี", "1", "101", "ว่าง"),
  mk("มั่งมี", "1", "102", "มีคนอยู่", { tenant: "คุณสมชาย ใจดี", phone: "0812345678", contractEnd: d(90) }),
  mk("มั่งมี", "1", "103", "มีคนอยู่", { tenant: "คุณวันดี มีสุข", phone: "0898765432", contractEnd: d(12) }),
  mk("มั่งมี", "1", "104", "รอสัญญา", { tenant: "คุณจองไว้ รอเซ็น", phone: "0801112222" }),
  mk("มั่งมี", "1", "105", "ว่าง"),
  mk("มั่งมี", "2", "201", "แจ้งย้ายออก", { tenant: "คุณกำลังย้าย ออกแล้ว", phone: "0833334444" }),
  mk("มั่งมี", "2", "202", "ซ่อม"),
  mk("มั่งมี", "2", "203", "มีคนอยู่", { tenant: "คุณอยู่นาน สиบปี", phone: "0855556666", contractEnd: d(240) }),
  mk("มั่งมี", "2", "204", "ว่าง"),
  mk("มั่งมี", "2", "205", "ทำความสะอาด"),
  // ตึก กลางเมือง
  mk("กลางเมือง", "1", "101", "มีคนอยู่", { tenant: "คุณเมือง กลางใจ", phone: "0866667777", contractEnd: d(30) }),
  mk("กลางเมือง", "1", "102", "ว่าง"),
  mk("กลางเมือง", "1", "103", "รอสัญญา", { tenant: "คุณใหม่ เพิ่งจอง" }),
  mk("กลางเมือง", "2", "201", "มีคนอยู่", { tenant: "คุณสองศูนย์ หนึ่ง", contractEnd: d(5) }),
  mk("กลางเมือง", "2", "202", "แจ้งย้ายออก", { tenant: "คุณลาก่อน บ้านเก่า" }),
  mk("กลางเมือง", "2", "203", "ว่าง"),
];

const TASKS: MockTask[] = [
  // วันนี้
  { date: d(0), type: "ซ่อม", building: "มั่งมี", room: "202", customer: "", phone: "", note: "แอร์ไม่เย็น เติมน้ำยา + ล้างฟิลเตอร์", status: "กำลังทำ" },
  { date: d(0), type: "ทำสะอาด", building: "มั่งมี", room: "205", customer: "", phone: "", note: "ทำสะอาดหลังย้ายออก — ปล่อยห้องใหม่ต่อ", status: "" },
  { date: d(0), type: "ชมห้อง", building: "กลางเมือง", room: "102", customer: "คุณผู้สนใจ เช่าด่วน", phone: "0877778888", note: "นัดบ่ายสอง", status: "" },
  // เกินกำหนด
  { date: d(-3), type: "ซ่อม", building: "กลางเมือง", room: "201", customer: "", phone: "", note: "ก๊อกอ่างล้างหน้ารั่ว", status: "" },
  { date: d(-1), type: "อื่นๆ", building: "มั่งมี", room: "201", customer: "", phone: "", note: "ตรวจห้องก่อนคืนมัดจำ — เช็คเฟอร์ฯ / อุปกรณ์ / ความเรียบร้อย", status: "" },
  // ล่วงหน้า
  { date: d(2), type: "ย้ายเข้า", building: "มั่งมี", room: "104", customer: "คุณจองไว้ รอเซ็น", phone: "0801112222", note: "นัดเซ็นสัญญา + รับกุญแจ", status: "" },
  { date: d(1), type: "ย้ายออก", building: "กลางเมือง", room: "202", customer: "คุณลาก่อน บ้านเก่า", phone: "", note: "", status: "" },
  { date: d(5), type: "ชมห้อง", building: "มั่งมี", room: "101", customer: "คุณนัดหน้า มาแน่", phone: "0844445555", note: "", status: "" },
  // ปิดแล้ว (ประวัติ)
  { date: d(-2), type: "ทำสะอาด", building: "มั่งมี", room: "201", customer: "", phone: "", note: "ทำสะอาดหลังย้ายออก — ปล่อยห้องใหม่ต่อ", status: "เสร็จ" },
  { date: d(-7), type: "ซ่อม", building: "มั่งมี", room: "102", customer: "", phone: "", note: "เปลี่ยนหลอดไฟห้องน้ำ", status: "เสร็จ" },
];

async function prep(page: Page, opts: { dark?: boolean } = {}): Promise<void> {
  if (opts.dark) {
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  } else {
    await page.addInitScript(() => localStorage.setItem("theme", "light"));
  }
  await mockDashboard(page, { rooms: ROOMS, tasks: TASKS });
  await page.goto("/");
  await expect(page.getByRole("banner")).toBeVisible();
  // Screenshot-faithfulness shims (capture-only, not app changes):
  // - content-visibility:auto skips painting cards during Playwright's
  //   synthetic fullPage scroll → force-paint them for the shot
  // - hide the Next.js dev-overlay indicator button
  // - hide the health banner: the hermetic mock answers /api/sheet/health
  //   with junk, which renders a half-empty warning that doesn't exist
  //   against the real backend
  await page.addStyleTag({
    content: `
      .ac-rc { content-visibility: visible !important; }
      .ac-kanban-card, .ac-task { content-visibility: visible !important; }
      nextjs-portal { display: none !important; }
      .ac-health-banner { display: none !important; }
    `,
  });
  // Let data render + entrance animations settle.
  await page.waitForTimeout(1200);
}

async function shot(page: Page, name: string, fullPage = false): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
}

/** Click a sidebar view item by its label; tolerate absence. */
async function goView(page: Page, label: string): Promise<boolean> {
  const item = page.locator(".ac-side-item", { hasText: label }).first();
  if ((await item.count()) === 0) return false;
  try {
    await item.click({ timeout: 3000 });
    await page.waitForTimeout(900);
    return true;
  } catch {
    return false;
  }
}

test.describe("UI review — management desktop light", () => {
  test.use({ storageState: storageStatePath("management"), viewport: { width: 1440, height: 900 } });

  test("capture main views", async ({ page }) => {
    await prep(page);
    await shot(page, "desktop-light-overview", true);

    if (await goView(page, "งานวันนี้")) await shot(page, "desktop-light-today");
    if (await goView(page, "กระดานงานช่าง")) await shot(page, "desktop-light-kanban");
    if (await goView(page, "ปฏิทิน")) await shot(page, "desktop-light-calendar");
    if (await goView(page, "รายงาน")) await shot(page, "desktop-light-reports", true);
    if (await goView(page, "รายได้")) await shot(page, "desktop-light-income");
    if (await goView(page, "ผู้เช่า")) await shot(page, "desktop-light-tenants");
    if (await goView(page, "แจ้งย้ายออก")) await shot(page, "desktop-light-moveout");
  });

  test("capture room modal + journey panel", async ({ page }) => {
    await prep(page);
    // ห้องแจ้งย้ายออก 201 มั่งมี — journey panel + stepper ควรโชว์
    const moveoutCard = page.locator(".ac-rc", { hasText: "201" }).first();
    await moveoutCard.click();
    await page.waitForTimeout(800);
    await shot(page, "desktop-light-room-modal-journey");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    // ห้องว่าง 101 — โหมดขาย: รับจอง/นัดชม
    const readyCard = page.locator(".ac-rc", { hasText: "101" }).first();
    await readyCard.click();
    await page.waitForTimeout(800);
    await shot(page, "desktop-light-room-modal-ready");
  });
});

test.describe("UI review — management desktop dark", () => {
  test.use({ storageState: storageStatePath("management"), viewport: { width: 1440, height: 900 } });

  test("capture dark views", async ({ page }) => {
    await prep(page, { dark: true });
    await shot(page, "desktop-dark-overview", true);
    if (await goView(page, "งานวันนี้")) await shot(page, "desktop-dark-today");
    if (await goView(page, "กระดานงานช่าง")) await shot(page, "desktop-dark-kanban");
    const card = page.locator(".ac-rc", { hasText: "201" }).first();
    if ((await card.count()) > 0) {
      await goView(page, "ภาพรวม");
      await card.click();
      await page.waitForTimeout(800);
      await shot(page, "desktop-dark-room-modal");
    }
  });
});

test.describe("UI review — mobile", () => {
  test.use({
    storageState: storageStatePath("management"),
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("capture mobile light", async ({ page }) => {
    await prep(page);
    await shot(page, "mobile-light-overview", true);
    // Room modal (bottom-sheet style on mobile)
    const card = page.locator(".ac-rc", { hasText: "201" }).first();
    await card.click();
    await page.waitForTimeout(800);
    await shot(page, "mobile-light-room-modal");
  });

  test("capture mobile dark", async ({ page }) => {
    await prep(page, { dark: true });
    await shot(page, "mobile-dark-overview", true);
  });
});

test.describe("UI review — sales & engineer modes", () => {
  test("sales pipeline (desktop light)", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: storageStatePath("sales"),
      viewport: { width: 1440, height: 900 },
    });
    const page = await ctx.newPage();
    await prep(page);
    await shot(page, "desktop-light-sales-home", true);
    if (await goView(page, "ภาพรวมขาย")) await shot(page, "desktop-light-sales-pipeline", true);
    await ctx.close();
  });

  test("engineer kanban (mobile light)", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: storageStatePath("engineer"),
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await ctx.newPage();
    await prep(page);
    await shot(page, "mobile-light-engineer-home", true);
    if (await goView(page, "กระดานงานช่าง")) await shot(page, "mobile-light-engineer-kanban", true);
    await ctx.close();
  });
});
