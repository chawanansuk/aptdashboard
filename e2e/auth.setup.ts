import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import { AUTH_DIR, E2E_ROLES, storageStatePath } from "./paths";

/**
 * Authenticates each test role through the e2e-only credentials
 * provider (auth.ts → id "e2e") and saves a storageState per role so
 * the spec projects can start already-logged-in. `page.request` shares
 * the browser context's cookie jar, so the NextAuth session cookie set
 * by the callback lands in the saved storageState.
 */

for (const { key, email } of E2E_ROLES) {
  setup(`authenticate as ${key}`, async ({ page }) => {
    fs.mkdirSync(AUTH_DIR, { recursive: true });

    // CSRF token (also primes the csrf cookie in this context).
    const csrfRes = await page.request.get("/api/auth/csrf");
    expect(csrfRes.ok()).toBeTruthy();
    const { csrfToken } = await csrfRes.json();

    // Sign in through the e2e credentials provider.
    await page.request.post("/api/auth/callback/e2e", {
      form: { csrfToken, email, callbackUrl: "/" },
    });

    // Confirm the session resolved to the expected user before saving.
    const sessionRes = await page.request.get("/api/auth/session");
    const session = await sessionRes.json();
    expect(session?.user?.email?.toLowerCase()).toBe(email);

    await page.context().storageState({ path: storageStatePath(key) });
  });
}
