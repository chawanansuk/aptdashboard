import { test, expect, type Page } from "@playwright/test";
import { storageStatePath } from "./paths";
import { mockDashboard, room } from "./fixtures";

/**
 * บิลค่าเช่า (v3.39): จดมิเตอร์ → บันทึกครั้งเดียว → บิล & การจ่าย.
 * /api/billing is mocked with a tiny in-memory sheet so a save shows up
 * on the next load, the way the real sheet does.
 */

const RATE = { building: "มั่งมี", elecRate: 8, waterRate: 18, waterMin: 100, dueDay: 5 };
type Row = Record<string, unknown>;

async function mockBilling(page: Page, finance: boolean) {
  const sheet = new Map<string, Row>();
  const posts: Row[] = [];
  await page.route("**/api/billing**", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      const body = req.postDataJSON() as Row;
      posts.push(body);
      if (body.action === "saveReadings") {
        for (const it of body.items as Row[]) {
          const k = `${it.building}|${it.room}`;
          const prev = sheet.get(k) ?? {};
          const elecPrev = (it.elecPrev as number | undefined) ?? 1234;
          const waterPrev = (it.waterPrev as number | undefined) ?? 50;
          const next: Row = { ...prev, ...it, elecPrev, waterPrev };
          const eu = (next.elecCur as number) - elecPrev, wu = (next.waterCur as number) - waterPrev;
          if (Number.isFinite(eu) && Number.isFinite(wu)) {
            Object.assign(next, { elecUnits: eu, waterUnits: wu, elecCost: eu * 8, waterCost: Math.max(100, wu * 18), rent: 4500 });
            next.total = 4500 + eu * 8 + Math.max(100, wu * 18);
          }
          sheet.set(k, next);
        }
      }
      if (body.action === "setPaid") {
        const k = `${body.building}|${body.room}`;
        sheet.set(k, { ...sheet.get(k), paidDate: body.paidDate });
      }
      return route.fulfill({ json: { ok: true, saved: 1, results: [] } });
    }
    const month = new URL(req.url()).searchParams.get("month");
    const rows = [...sheet.values()].map((r) => ({
      month, building: r.building, room: r.room,
      elecPrev: r.elecPrev ?? null, elecCur: r.elecCur ?? null, elecUnits: r.elecUnits ?? null,
      elecCost: finance ? r.elecCost ?? null : null,
      waterPrev: r.waterPrev ?? null, waterCur: r.waterCur ?? null, waterUnits: r.waterUnits ?? null,
      waterCost: finance ? r.waterCost ?? null : null,
      rent: finance ? r.rent ?? null : null, keyFee: null, parking: null, other: null,
      total: finance ? r.total ?? null : null, paidDate: finance ? r.paidDate ?? "" : "", note: "",
    }));
    return route.fulfill({ json: {
      ok: true, finance, month, rows,
      prevRows: [{ building: "มั่งมี", room: "101", elecCur: 1234, waterCur: 50 }],
      rates: finance ? [RATE] : [],
    } });
  });
  return posts;
}

async function open(page: Page, finance: boolean) {
  await mockDashboard(page, {
    rooms: [
      room({ building: "มั่งมี", room: "101", status: "มีผู้เช่า", tenant: "คุณเอ", price: "4500" }),
      room({ building: "มั่งมี", room: "102", status: "ว่าง" }),
    ],
  });
  const posts = await mockBilling(page, finance);
  await page.goto("/?view=billing");
  await page.addStyleTag({ content: "nextjs-portal{display:none} .ac-health-banner{display:none}" });
  await expect(page.locator(".ac-billing")).toBeVisible();
  return posts;
}

test.describe("manager", () => {
  test.use({ storageState: storageStatePath("management") });

  test("read the meters, save once, then copy the bill and mark it paid", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const posts = await open(page, true);
    const view = page.locator(".ac-billing");
    await expect(view.getByText("ห้อง 101")).toBeVisible();
    await expect(view.getByText("ห้อง 102")).toHaveCount(0); // vacant — nothing to bill

    await page.getByLabel("ห้อง 101 มิเตอร์ไฟใหม่").fill("1290");
    await page.getByLabel("ห้อง 101 มิเตอร์น้ำใหม่").fill("56");
    await expect(view.getByText("56 หน่วย")).toBeVisible();
    await expect(view.getByText("≈ 5,056 ฿")).toBeVisible();
    await page.getByRole("button", { name: "บันทึก 1 ห้อง" }).click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]).toMatchObject({ action: "saveReadings", items: [{ building: "มั่งมี", room: "101", elecCur: 1290, waterCur: 56 }] });
    await expect(view.getByText("จดแล้ว", { exact: false }).first()).toBeVisible();

    await page.getByRole("tab", { name: /บิล & การจ่าย/ }).click();
    const bill = view.locator(".ac-billing-bill", { hasText: "ห้อง 101" });
    await expect(bill).toContainText("5,056 ฿");
    await expect(bill).toContainText("ค้างจ่าย");
    await bill.getByRole("button", { name: /คัดลอกบิล/ }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("รวม 5,056 บาท");

    await bill.getByRole("button", { name: /รับเงินแล้ว/ }).click();
    await expect(bill).toContainText("จ่ายแล้ว");
    expect(posts.at(-1)).toMatchObject({ action: "setPaid", room: "101" });
  });

  test("sidebar has the บิลค่าเช่า entry", async ({ page }) => {
    await open(page, true);
    await expect(page.locator("aside").getByText("บิลค่าเช่า", { exact: true }).first()).toBeVisible();
  });
});

test.describe("engineer", () => {
  test.use({ storageState: storageStatePath("engineer") });

  test("enters readings only — no baht, no bill tabs", async ({ page }) => {
    await open(page, false);
    const view = page.locator(".ac-billing");
    await expect(view.getByText("ห้อง 101")).toBeVisible();
    await expect(view.getByRole("tablist")).toHaveCount(0);
    await page.getByLabel("ห้อง 101 มิเตอร์ไฟใหม่").fill("1290");
    await expect(view.getByText("56 หน่วย")).toBeVisible();
    await expect(view).not.toContainText("฿");
  });

  test("phone: the save bar sits above the bottom tab bar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, false);
    await page.getByLabel("ห้อง 101 มิเตอร์ไฟใหม่").fill("1290");
    const bar = page.locator(".ac-billing-savebar");
    await expect(bar).toBeVisible();
    const tabbar = page.locator(".ac-bottom-nav").first();
    if (await tabbar.count()) {
      const [b, t] = await Promise.all([bar.boundingBox(), tabbar.boundingBox()]);
      if (b && t) expect(b.y + b.height).toBeLessThanOrEqual(t.y + 1);
    }
  });
});
