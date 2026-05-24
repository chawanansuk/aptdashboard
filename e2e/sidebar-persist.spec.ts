import { test, expect } from "@playwright/test";
import { storageStatePath } from "./paths";
import { mockDashboard } from "./fixtures";

/**
 * Desktop sidebar rail mode persists across reloads (localStorage
 * "aptdash:sidebarCollapsed") and toggles via the chevron + "[" key.
 * Rail mode only applies ≥1281px — the config viewport is 1440 wide.
 */
test.describe("sidebar collapse persistence", () => {
  test.use({ storageState: storageStatePath("management") });

  test.beforeEach(async ({ page }) => {
    await mockDashboard(page, { rooms: [], tasks: [] });
  });

  test("collapsing persists across reload", async ({ page }) => {
    await page.goto("/");
    await expect(page).not.toHaveURL(/\/login/);

    const sidebar = page.locator(".ac-side");
    await expect(sidebar).not.toHaveClass(/is-collapsed/);

    // Collapse via the chevron button.
    await page.locator(".ac-side-collapse-btn").click();
    await expect(sidebar).toHaveClass(/is-collapsed/);

    // Reload → still collapsed (persisted preference).
    await page.reload();
    await expect(page.locator(".ac-side")).toHaveClass(/is-collapsed/);
  });

  test("'[' key toggles the rail", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.locator(".ac-side");
    const collapsedAtStart = await sidebar.evaluate((el) => el.classList.contains("is-collapsed"));

    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("[");

    if (collapsedAtStart) {
      await expect(sidebar).not.toHaveClass(/is-collapsed/);
    } else {
      await expect(sidebar).toHaveClass(/is-collapsed/);
    }
  });
});
