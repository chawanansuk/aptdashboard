import { test, expect } from "@playwright/test";
import { storageStatePath } from "./paths";
import { mockDashboard, room, type MockTask } from "./fixtures";

test.use({ storageState: storageStatePath("management") });

/**
 * บันทึกซ่อมบำรุง r23: ฟิลเตอร์ตึกจาก header มีผลจริง, การ์ดสถิติกดกรองได้,
 * ค้นหาในบันทึก, และลงบันทึกย้อนหลังได้ (วันที่ทำ default วันนี้).
 */

function d(back: number): string {
  const x = new Date(Date.now() - back * 864e5);
  return `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")}/${x.getFullYear()}`;
}

const TASKS: MockTask[] = [
  { date: d(0), type: "ซ่อม", building: "มั่งมี", room: "101", customer: "", phone: "", note: "เปลี่ยนหลอดไฟทางเดิน", status: "เสร็จ" },
  { date: d(0), type: "ทำสะอาด", building: "มั่งมี", room: "102", customer: "", phone: "", note: "ล้างแอร์ประจำปี", status: "เสร็จ" },
  { date: d(0), type: "ซ่อม", building: "กลางเมือง", room: "201", customer: "", phone: "", note: "ซ่อมก๊อกน้ำรั่ว", status: "" },
];

async function openMaintlog(page: import("@playwright/test").Page) {
  await mockDashboard(page, {
    rooms: [
      room({ building: "มั่งมี", room: "101", status: "ว่าง" }),
      room({ building: "กลางเมือง", room: "201", status: "ว่าง" }),
    ],
    tasks: TASKS,
  });
  await page.goto("/");
  await page.addStyleTag({ content: "nextjs-portal{display:none} .ac-health-banner{display:none}" });
  await page.locator('button[aria-label="บันทึกซ่อมบำรุง"]').evaluate((el) => (el as HTMLElement).click());
  await expect(page.locator(".ac-mlog")).toBeVisible();
}

test("header building filter scopes the log; stat cards + search filter entries", async ({ page }) => {
  await openMaintlog(page);
  const log = page.locator(".ac-mlog");
  await expect(log).toContainText("เปลี่ยนหลอดไฟทางเดิน");
  await expect(log).toContainText("ซ่อมก๊อกน้ำรั่ว");

  // เลือกตึกมั่งมีจากแถบบน → งานของกลางเมืองหายจากบันทึก
  await page.locator('.ac-nav button:has-text("มั่งมี")').first().evaluate((el) => (el as HTMLElement).click());
  await expect(log).toContainText("บันทึกซ่อมบำรุง · มั่งมี");
  await expect(log).not.toContainText("ซ่อมก๊อกน้ำรั่ว");
  await expect(log).toContainText("เปลี่ยนหลอดไฟทางเดิน");

  // การ์ดสถิติ "ทำสะอาด" กดแล้วกรองเฉพาะประเภทนั้น กดซ้ำเลิกกรอง
  await log.locator(".ac-mlog-stat-btn", { hasText: "ทำสะอาด" }).click();
  await expect(log).not.toContainText("เปลี่ยนหลอดไฟทางเดิน");
  await expect(log).toContainText("ล้างแอร์ประจำปี");
  await log.locator(".ac-mlog-stat-btn", { hasText: "ทำสะอาด" }).click();
  await expect(log).toContainText("เปลี่ยนหลอดไฟทางเดิน");

  // ค้นหา
  await log.locator(".ac-mlog-search input").fill("หลอดไฟ");
  await expect(log).toContainText("เปลี่ยนหลอดไฟทางเดิน");
  await expect(log).not.toContainText("ล้างแอร์ประจำปี");
  await log.locator(".ac-mlog-search input").fill("ไม่มีทางเจอ");
  await expect(log).toContainText("ไม่พบรายการตามเงื่อนไขที่กรอง");
  await log.getByRole("button", { name: "ล้างตัวกรอง" }).click();
  await expect(log).toContainText("ล้างแอร์ประจำปี");
});

test("log modal: prefills header building and can backdate the work date", async ({ page }) => {
  const posted: Record<string, unknown>[] = [];
  await openMaintlog(page);
  await page.route("**/api/sheet/update", async (r) => {
    posted.push(r.request().postDataJSON() as Record<string, unknown>);
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.locator('.ac-nav button:has-text("กลางเมือง")').first().evaluate((el) => (el as HTMLElement).click());
  await page.locator(".ac-mlog").getByRole("button", { name: "+ ลงบันทึกงาน", exact: true }).click();

  const modal = page.locator(".ac-modal");
  await expect(modal.locator("#mlog-bld")).toHaveValue("กลางเมือง");

  // วันที่ทำ default วันนี้ แล้วถอยเป็นเมื่อวานได้
  const today = await modal.locator("#mlog-date").inputValue();
  expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const y = new Date(Date.now() - 864e5);
  const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
  await modal.locator("#mlog-date").fill(yesterday);
  await modal.locator("#mlog-room").fill("201");
  await modal.locator("#mlog-note").fill("เก็บงานค้างของเมื่อวาน");
  await modal.getByRole("button", { name: "บันทึก" }).click();
  await expect(modal).toBeHidden();

  const add = posted.find((p) => p.action === "addTask");
  expect(add).toMatchObject({ building: "กลางเมือง", room: "201", date: yesterday });
});
