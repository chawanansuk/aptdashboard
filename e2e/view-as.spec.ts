import { test, expect } from "@playwright/test";
import { storageStatePath } from "./paths";
import { mockDashboard } from "./fixtures";

/**
 * View-as (multi-role) must update the UI live — no reload. Uses the
 * multi-role test user so the "ดูในมุมมอง" <select> is rendered.
 */
test.describe("view-as live switch", () => {
  test.use({ storageState: storageStatePath("multi") });

  test.beforeEach(async ({ page }) => {
    await mockDashboard(page, { rooms: [], tasks: [] });
  });

  test("changing role updates the mode badge without reload", async ({ page }) => {
    await page.goto("/");
    await expect(page).not.toHaveURL(/\/login/);

    // The select's accessible name is its aria-label. Selecting an
    // option also closes the avatar menu (onChange → closeMenu), so we
    // re-open the menu before each switch.
    const openViewAs = async () => {
      await page.locator(".ac-user-trigger").click();
      const select = page.getByRole("combobox", { name: "กรองเมนูตามบทบาท" });
      await expect(select).toBeVisible();
      return select;
    };

    // Switch to engineer → header mode badge reflects it immediately.
    await (await openViewAs()).selectOption("engineer");
    await expect(page.locator(".ac-mode-badge")).toContainText("ช่าง");

    // Switch to sales → badge flips again, still no reload.
    await (await openViewAs()).selectOption("sales");
    await expect(page.locator(".ac-mode-badge")).toContainText("ขาย");
  });
});
