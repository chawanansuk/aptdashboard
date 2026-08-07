import { test, expect } from "@playwright/test";
import { storageStatePath } from "./paths";
import { mockDashboard, room } from "./fixtures";

/**
 * ซ่อมบำรุง hub (UI r15): one sidebar entry, tab 🔔 merges due items
 * from BOTH facilities and room equipment with the one-tap
 * "✓ ทำแล้ววันนี้"; the old FacilitiesView survives as the ส่วนกลาง tab
 * (its own due strip + one-tap included).
 */
test.use({ storageState: storageStatePath("engineer"), viewport: { width: 1280, height: 950 } });

const FACILITIES = [
  { id: "f1", building: "มีทอง", type: "ปั๊มน้ำ", name: "ปั๊มหน้าตึก", installDate: "2025-01-10", lastService: "2026-03-20", status: "ใช้งานได้", note: "", creator: "a@b.c", createdAt: "", intervalDays: 120 },
  { id: "f3", building: "มั่งมี", type: "ปั๊มน้ำ", name: "", installDate: "2025-02-14", lastService: "2026-07-01", status: "ใช้งานได้", note: "", creator: "a@b.c", createdAt: "", intervalDays: 120 },
];
const EQUIPMENT = [
  { id: "e1", building: "มีทอง", room: "204", type: "แอร์", brand: "Daikin", installDate: "2024-05-01", lastService: "2025-12-20", status: "ปกติ", note: "", creator: "a@b.c", createdAt: "", intervalDays: 180 },
];

async function openHub(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.addStyleTag({ content: "nextjs-portal{display:none} .ac-health-banner{display:none}" });
  await page.waitForTimeout(400);
  await page.locator('button[aria-label="ซ่อมบำรุง"]').evaluate((el) => (el as HTMLElement).click());
}

test("hub tab 🔔 merges facility + equipment due items, one-tap serviced", async ({ page }) => {
  const posted: { url: string; body: Record<string, unknown> }[] = [];
  await mockDashboard(page, { rooms: [room({ building: "มีทอง", room: "204" })], tasks: [] });
  for (const path of ["**/api/facilities**", "**/api/maintenance-plan**", "**/api/room-equipment**"]) {
    await page.route(path, (r) => {
      if (r.request().method() === "POST") {
        posted.push({ url: r.request().url(), body: r.request().postDataJSON() as Record<string, unknown> });
        return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      }
      const rows = r.request().url().includes("facilities") ? FACILITIES : EQUIPMENT;
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, rows }) });
    });
  }
  await openHub(page);

  // Default tab = 🔔 ถึงรอบ with a red count badge (2: pump + AC overdue)
  const hub = page.locator(".ac-maint-hub");
  await expect(hub.locator(".ac-maint-hub-badge")).toHaveText("2");
  const rows = hub.locator(".ac-fac-due-row");
  await expect(rows).toHaveCount(2);
  // Worst-first: the AC (overdue longer) leads; sources are labelled
  await expect(rows.first()).toContainText("ห้อง 204");
  await expect(rows.first()).toContainText("แอร์ Daikin");
  await expect(rows.nth(1)).toContainText("ส่วนกลาง");

  // One-tap on the EQUIPMENT row posts to /api/room-equipment
  await rows.first().getByRole("button", { name: "✓ ทำแล้ววันนี้" }).click();
  const today = new Date().toISOString().slice(0, 10);
  const upd = posted.find((p) => p.url.includes("room-equipment"));
  expect(upd?.body).toMatchObject({ action: "update", id: "e1", lastService: today });
});

test("ส่วนกลาง tab keeps the FacilitiesView due strip + one-tap", async ({ page }) => {
  const posted: Record<string, unknown>[] = [];
  await mockDashboard(page, { rooms: [room({ building: "มีทอง", room: "101" })], tasks: [] });
  await page.route("**/api/facilities**", (r) => {
    if (r.request().method() === "POST") {
      posted.push(r.request().postDataJSON() as Record<string, unknown>);
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, rows: FACILITIES }) });
  });
  await page.route("**/api/maintenance-plan**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, rows: [] }) }),
  );
  await openHub(page);
  await page.getByRole("tab", { name: "🏢 ส่วนกลาง" }).click();

  const due = page.locator(".ac-fac-due");
  await expect(due).toBeVisible();
  await expect(due.locator(".ac-fac-due-row")).toHaveCount(1);
  await due.locator(".ac-fac-due-row").first().getByRole("button", { name: "✓ ทำแล้ววันนี้" }).click();
  const today = new Date().toISOString().slice(0, 10);
  expect(posted.find((p) => p.action === "update")).toMatchObject({ id: "f1", lastService: today });
  // Card meta spells out the interval in months
  await expect(page.locator(".ac-equipment-card-meta").filter({ hasText: "รอบทุก 120 วัน (≈ 4 เดือน)" }).first()).toBeVisible();
});
