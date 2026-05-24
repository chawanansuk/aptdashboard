import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Authenticates each test role through the e2e-only credentials
 * provider (auth.ts → id "e2e") and saves a storageState per role so
 * the spec projects can start already-logged-in. `page.request` shares
 * the browser context's cookie jar, so the NextAuth session cookie set
 * by the callback lands in the saved storageState.
 */

const AUTH_DIR = path.join(__dirname, ".auth");

const ROLES = [
  { key: "management", email: "e2e-mgmt@test.local" },
  { key: "sales", email: "e2e-sales@test.local" },
  { key: "engineer", email: "e2e-eng@test.local" },
] as const;

export function storageStatePath(role: string): string {
  return path.join(AUTH_DIR, `${role}.json`);
}

for (const { key, email } of ROLES) {
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
