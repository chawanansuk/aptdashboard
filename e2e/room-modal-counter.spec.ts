import { test, expect } from "@playwright/test";
import { storageStatePath } from "./paths";
import { mockDashboard, room } from "./fixtures";

/**
 * RoomModal prev/next counter must reflect the CURRENT filter scope,
 * not the whole property (the "1/63 vs 187/297" bug). Two buildings:
 * มีทอง has 3 rooms, KL has 2 → total 5.
 */
test.describe("room modal counter is filter-scoped", () => {
  test.use({ storageState: storageStatePath("management") });

  test.beforeEach(async ({ page }) => {
    await mockDashboard(page, {
      rooms: [
        room({ building: "มีทอง", room: "301" }),
        room({ building: "มีทอง", room: "302" }),
        room({ building: "มีทอง", room: "303" }),
        room({ building: "KL", room: "101" }),
        room({ building: "KL", room: "102" }),
      ],
      tasks: [],
    });
  });

  test("counter total tracks the active building filter", async ({ page }) => {
    await page.goto("/");
    await expect(page).not.toHaveURL(/\/login/);

    // Filter to มีทอง (3 rooms) via the header building tab.
    await page.getByRole("button", { name: "มีทอง", exact: true }).click();

    // Open a มีทอง room → counter denominator should be 3, not 5.
    await page.locator(".ac-rc").filter({ hasText: "301" }).first().click();
    const pos = page.locator(".ac-room-modal-nav-pos");
    await expect(pos).toBeVisible();
    await expect(pos).toContainText("/ 3");

    // Close via Escape (not a click on .ac-modal-close — a page-level
    // health banner can overlay the modal header and intercept the
    // click, and the booking workflow box reflows the modal). Then
    // switch to ทั้งหมด (5 rooms), reopen → denominator now 5.
    await page.keyboard.press("Escape");
    await expect(pos).toBeHidden();
    await page.getByRole("button", { name: "ทั้งหมด", exact: true }).click();
    await page.locator(".ac-rc").filter({ hasText: "301" }).first().click();
    await expect(page.locator(".ac-room-modal-nav-pos")).toContainText("/ 5");
  });
});
