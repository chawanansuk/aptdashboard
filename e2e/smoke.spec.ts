import { test, expect } from "@playwright/test";
import { storageStatePath } from "./auth.setup";

/**
 * Phase 1 smoke test — proves the e2e harness gets PAST the Google-OAuth
 * login wall (via the test-only credentials provider) and renders the
 * authenticated dashboard shell. This is the foundation the feature
 * specs build on; if this passes, auth + storageState + the dev server
 * webServer all work.
 *
 * Data is mocked so the run is hermetic — the dummy CSV/API URLs in
 * playwright.config never reach a real network.
 */

test.describe("authenticated dashboard shell", () => {
  test.use({ storageState: storageStatePath("management") });

  test.beforeEach(async ({ page }) => {
    // Hermetic data: empty rooms/tasks. The app's empty-states render
    // fine; we only care that the shell mounts past auth.
    await page.route("**/*.csv", (route) =>
      route.fulfill({ status: 200, contentType: "text/csv", body: "" }),
    );
    await page.route("**/api/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [] }) }),
    );
  });

  test("logs in past the OAuth wall and shows the app header", async ({ page }) => {
    await page.goto("/");
    // Must NOT have been bounced to /login.
    await expect(page).not.toHaveURL(/\/login/);
    // The brand logo in the header proves the authenticated shell mounted.
    await expect(page.getByText("APARTCLOUD")).toBeVisible();
  });

  test("session endpoint reports the management role", async ({ page }) => {
    const res = await page.request.get("/api/auth/session");
    const session = await res.json();
    expect(session?.user?.email).toBe("e2e-mgmt@test.local");
    expect(session?.user?.roles).toContain("management");
  });
});
