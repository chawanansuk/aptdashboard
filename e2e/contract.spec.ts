import { test, expect, type Page } from "@playwright/test";
import { storageStatePath } from "./paths";
import { mockDashboard, room } from "./fixtures";

/**
 * ร่างสัญญา (v3.40, pilot มีทอง): inside the booking window, one tap makes
 * the PDF from the form; other buildings don't show it at all.
 * /api/contract is mocked — Google Docs does the real work.
 */
test.use({ storageState: storageStatePath("management") });

async function openBooking(page: Page, building: string, opts: { sample?: boolean } = {}) {
  await mockDashboard(page, {
    rooms: [room({ building, room: "401", status: "ว่าง", price: "5200" })],
    tasks: [],
  });
  const posts: Record<string, unknown>[] = [];
  await page.route("**/api/contract**", async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      return route.fulfill({ json: { ok: true, pilot: true, manage: true, template: { docUrl: "https://docs.google.com/document/d/abc/edit" } } });
    }
    posts.push(req.postDataJSON() as Record<string, unknown>);
    return route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/pdf", "X-Contract-Sample": opts.sample ? "1" : "0" },
      body: Buffer.from("%PDF-1.4\n%fake\n"),
    });
  });
  await page.goto("/");
  await page.addStyleTag({ content: "nextjs-portal{display:none} .ac-health-banner{display:none}" });
  await page.locator(".ac-rc").filter({ hasText: "401" }).first().click();
  await page.getByRole("button", { name: "รับจอง (มัดจำ)" }).first().click();
  const modal = page.locator(".ac-booking-modal");
  await expect(modal).toBeVisible();
  return { modal, posts };
}

test("มีทอง: fill the booking → draft PDF → ready to send", async ({ page }) => {
  const { modal, posts } = await openBooking(page, "มีทอง");
  const panel = modal.locator(".ac-contract");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("link", { name: /แก้ถ้อยคำ/ })).toHaveAttribute("href", /docs\.google\.com/);
  const make = panel.getByRole("button", { name: "ทำร่างสัญญา (PDF)" });
  await expect(make).toBeDisabled(); // name + phone still empty

  await modal.locator("#ac-bk-tenant").fill("สมใจ");
  await modal.locator("#ac-bk-phone").pressSequentially("0812345678");
  await make.click();
  await expect(panel.getByText("ร่างสัญญา มีทอง 401 สมใจ.pdf")).toBeVisible();
  await expect(panel.getByRole("button", { name: "ส่งเข้า LINE" })).toBeVisible();
  expect(posts[0]).toMatchObject({ action: "draft", building: "มีทอง", room: "401", tenant: "สมใจ", rent: 5200, deposit: 10000 });

  // change the rent → the draft must be made again before sending
  await modal.locator("#ac-bk-rent").fill("5500");
  await expect(panel.getByRole("button", { name: "ส่งเข้า LINE" })).toHaveCount(0);
  await expect(panel.getByText(/ข้อมูลในฟอร์มเปลี่ยนหลังทำร่าง/)).toBeVisible();
});

test("sample wording: can be opened, not sent", async ({ page }) => {
  const { modal } = await openBooking(page, "มีทอง", { sample: true });
  await modal.locator("#ac-bk-tenant").fill("สมใจ");
  await modal.locator("#ac-bk-phone").pressSequentially("0812345678");
  await modal.locator(".ac-contract").getByRole("button", { name: "ทำร่างสัญญา (PDF)" }).click();
  await expect(modal.locator(".ac-contract").getByText(/ห้ามส่งลูกค้าจริง/)).toBeVisible();
  await expect(modal.locator(".ac-contract").getByRole("button", { name: "ส่งเข้า LINE" })).toHaveCount(0);
});

test("other buildings: no contract panel", async ({ page }) => {
  const { modal } = await openBooking(page, "มั่งมี");
  await expect(modal.locator("#ac-bk-msg")).toBeVisible();
  await expect(modal.locator(".ac-contract")).toHaveCount(0);
});
