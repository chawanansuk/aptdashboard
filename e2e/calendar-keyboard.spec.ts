import { test, expect } from "@playwright/test";
import { storageStatePath } from "./paths";
import { mockDashboard } from "./fixtures";

/**
 * Calendar day-view keyboard nav — ← / → step the focused day. Unit
 * tests can't prove the global keydown listener is wired to the real
 * rendered view; this does.
 */
test.describe("calendar day-view arrow keys", () => {
  test.use({ storageState: storageStatePath("management") });

  test.beforeEach(async ({ page }) => {
    await mockDashboard(page, { rooms: [], tasks: [] });
  });

  test("ArrowRight / ArrowLeft step the day in day mode", async ({ page }) => {
    await page.goto("/");
    await expect(page).not.toHaveURL(/\/login/);

    // Navigate to the calendar via the sidebar. (Seeding
    // localStorage.activeView doesn't work — the mode-landing effect in
    // page.tsx overrides it to the role's default view on mount.)
    await page.getByRole("button", { name: "ปฏิทิน" }).click();

    // Switch to day mode.
    await page.getByRole("radio", { name: "วัน" }).click();
    const title = page.locator(".ac-cal-day-view-title");
    await expect(title).toBeVisible();

    // The title also contains the "วันนี้" pill, so compare normalized
    // innerText snapshots (not toHaveText, which normalizes differently
    // and tripped on the pill's line break). expect.poll waits for the
    // async state update after each key press.
    const read = async () => (await title.innerText()).replace(/\s+/g, " ").trim();
    const day0 = await read();

    // Click empty body so focus isn't on the toggle button, then arrow.
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("ArrowRight");
    await expect.poll(read).not.toBe(day0);

    await page.keyboard.press("ArrowLeft");
    await expect.poll(read).toBe(day0);
  });
});
