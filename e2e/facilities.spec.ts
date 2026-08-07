import { test, expect } from "@playwright/test";
import { storageStatePath } from "./paths";
import { mockDashboard, room } from "./fixtures";

/**
 * Facilities view (UI r14): the "ถึงรอบบำรุง" quick section surfaces
 * overdue/due-soon items worst-first with a one-tap "✓ ทำแล้ววันนี้"
 * that stamps lastService = today (the flow that used to require
 * opening แก้ไข and typing a date by hand).
 */
test.use({ storageState: storageStatePath("engineer"), viewport: { width: 1280, height: 950 } });

test("due section + one-tap mark-serviced", async ({ page }) => {
  const posted: Record<string, unknown>[] = [];
  const rows = [
    { id: "f1", building: "มีทอง", type: "ปั๊มน้ำ", name: "ปั๊มหน้าตึก", installDate: "2025-01-10", lastService: "2026-03-20", status: "ใช้งานได้", note: "", creator: "a@b.c", createdAt: "", intervalDays: 120 },
    { id: "f2", building: "มีทอง", type: "รอบล้างแอร์", name: "แอร์ล็อบบี้", installDate: "2024-06-01", lastService: "2026-01-05", status: "ใช้งานได้", note: "", creator: "a@b.c", createdAt: "", intervalDays: 180 },
    { id: "f3", building: "มั่งมี", type: "ปั๊มน้ำ", name: "", installDate: "2025-02-14", lastService: "2026-07-01", status: "ใช้งานได้", note: "", creator: "a@b.c", createdAt: "", intervalDays: 120 },
  ];
  await mockDashboard(page, { rooms: [room({ building: "มีทอง", room: "101" })], tasks: [] });
  await page.route("**/api/facilities**", (r) => {
    if (r.request().method() === "POST") {
      posted.push(r.request().postDataJSON() as Record<string, unknown>);
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, rows }) });
  });
  await page.goto("/");
  await page.addStyleTag({ content: "nextjs-portal{display:none} .ac-health-banner{display:none}" });
  await page.waitForTimeout(400);
  await page.locator('button[aria-label="สาธารณูปโภค"]').evaluate((el) => (el as HTMLElement).click());

  // Due section: 2 items (f1 overdue, f2 overdue), worst-first = f2 (เลยมากกว่า)
  const due = page.locator(".ac-fac-due");
  await expect(due).toBeVisible();
  await expect(due.locator(".ac-fac-due-row")).toHaveCount(2);
  await expect(due.locator(".ac-fac-due-row").first()).toContainText("รอบล้างแอร์");
  await expect(due.locator(".ac-fac-due-count.is-overdue").first()).toContainText("เลย");
  // f3 is not due for months → stays out of the quick section
  await expect(due).not.toContainText("มั่งมี");

  // One-tap mark-serviced posts lastService = today
  await due.locator(".ac-fac-due-row").first().getByRole("button", { name: "✓ ทำแล้ววันนี้" }).click();
  const today = new Date().toISOString().slice(0, 10);
  const upd = posted.find((p) => p.action === "update");
  expect(upd).toMatchObject({ action: "update", id: "f2", lastService: today });

  // Card meta now spells out the interval in months
  await expect(page.locator(".ac-equipment-card-meta").filter({ hasText: "รอบทุก 120 วัน (≈ 4 เดือน)" }).first()).toBeVisible();
});
