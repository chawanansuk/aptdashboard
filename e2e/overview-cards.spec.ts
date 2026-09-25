import { test, expect } from "@playwright/test";
import { storageStatePath } from "./paths";
import { mockDashboard, room } from "./fixtures";

test.use({ storageState: storageStatePath("management") });

/**
 * V2 Direction B — the overview's first screen writes data now, so it
 * gets its own guard:
 *  - "งานวันนี้" card: ปิดงาน goes through the SAME write as the full
 *    today list (updateTaskStatus, status เสร็จ, exact row id) and the row
 *    leaves the card immediately (optimistic), without a reload.
 *  - "รอเข้าอยู่": a booked room with no move-in appointment offers
 *    "นัดวันเข้า", which opens the new-task form as a ย้ายเข้า for that
 *    room — the existing flow, pre-filled.
 */

function todayDmy(): string {
  const x = new Date();
  return `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")}/${x.getFullYear()}`;
}

async function open(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.addStyleTag({ content: "nextjs-portal{display:none} .ac-health-banner{display:none}" });
}

test("ปิดงาน in the overview card writes updateTaskStatus once and drops the row", async ({ page }) => {
  await mockDashboard(page, {
    rooms: [room({ building: "มั่งมี", room: "202", status: "ปรับปรุง" })],
    tasks: [{
      id: "T-1", date: todayDmy(), type: "ซ่อม", building: "มั่งมี", room: "202",
      customer: "", phone: "", note: "แอร์ไม่เย็น", status: "",
    }],
  });
  const posts: Record<string, unknown>[] = [];
  await page.route("**/api/sheet/update", (r) => {
    posts.push(r.request().postDataJSON());
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await open(page);

  const card = page.locator(".ac-tasks-compact");
  await expect(card.getByText("แอร์ไม่เย็น")).toBeVisible();
  await card.getByRole("button", { name: "ปิดงาน" }).click();

  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({
    action: "updateTaskStatus", id: "T-1", building: "มั่งมี", room: "202", type: "ซ่อม", status: "เสร็จ",
  });
  // Optimistic: the closed task leaves the card without waiting for the sheet.
  await expect(card.getByText("แอร์ไม่เย็น")).toBeHidden();
});

test("the งานวันนี้ card splits today from overdue, matching the hero tile", async ({ page }) => {
  const dmy = (offset: number) => {
    const x = new Date(); x.setDate(x.getDate() + offset);
    return `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")}/${x.getFullYear()}`;
  };
  await mockDashboard(page, {
    rooms: [room({ building: "มั่งมี", room: "202", status: "ปรับปรุง" })],
    tasks: [
      { date: dmy(0), type: "ซ่อม", building: "มั่งมี", room: "202", customer: "", phone: "", note: "วันนี้", status: "" },
      { date: dmy(-2), type: "ซ่อม", building: "มั่งมี", room: "202", customer: "", phone: "", note: "ค้างหนึ่ง", status: "" },
      { date: dmy(-5), type: "ทำสะอาด", building: "มั่งมี", room: "202", customer: "", phone: "", note: "ค้างสอง", status: "" },
    ],
  });
  await open(page);
  // One total "(3)" next to the hero's "งานวันนี้ 1" read as two different numbers.
  await expect(page.locator(".ac-tasks-compact .ac-tasks-title")).toContainText("(วันนี้ 1 · เลยกำหนด 2)");
});

test("a booked room with no move-in date offers นัดวันเข้า → new-task form as ย้ายเข้า for that room", async ({ page }) => {
  await mockDashboard(page, {
    rooms: [
      room({ building: "มั่งมี", room: "104", status: "รอสัญญา", tenant: "คุณจองไว้", note: "โอนมัดจำแล้ว" }),
      room({ building: "มั่งมี", room: "105", status: "ว่าง" }),
    ],
    tasks: [],
  });
  await open(page);

  const booked = page.locator(".ac-ready-item-pending").filter({ hasText: "104" });
  await expect(booked).toContainText("คุณจองไว้");
  await expect(booked).toContainText("โอนมัดจำแล้ว");
  await booked.getByRole("button", { name: /นัดวันย้ายเข้า/ }).click();

  const modal = page.locator(".ac-modal");
  await expect(modal.locator("#ac-addtask-title")).toBeVisible();
  await expect(modal.locator("#ac-addtask-type")).toHaveValue("ย้ายเข้า");
  await expect(modal.locator("#ac-addtask-building")).toHaveValue("มั่งมี");
  await expect(modal.locator("#ac-addtask-room")).toHaveValue("104");
});
