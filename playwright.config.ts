import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright e2e config for APARTCLOUD.
 *
 * Auth: the app is Google-OAuth-only in production, which can't be
 * automated. For e2e we boot the dev server with E2E_TEST_MODE=1,
 * which enables a test-only credentials provider in auth.ts (see the
 * E2E_ENABLED guard there — it is impossible to enable on a Vercel
 * production deployment). `e2e/auth.setup.ts` logs in through it and
 * saves a storageState that the spec projects reuse.
 *
 * Data: specs mock `/api/**` and the Google Sheets CSV fetches with
 * page.route() so runs are hermetic — no real spreadsheet needed.
 *
 * Running locally / CI:
 *   npx playwright install --with-deps chromium
 *   npx playwright test
 */

const PORT = Number(process.env.E2E_PORT || 3300);
const BASE_URL = `http://localhost:${PORT}`;

// Seed test users into the allowlist so the credentials provider +
// signIn() allowlist check both pass, and roles resolve per login.
const E2E_ALLOWED_USERS = [
  "e2e-mgmt@test.local:management",
  "e2e-sales@test.local:sales",
  "e2e-eng@test.local:engineer",
  "e2e-multi@test.local:sales+engineer+management",
].join(",");

export default defineConfig({
  testDir: "./e2e",
  // Each spec is independent; allow parallel within a file but keep
  // worker count modest so the single dev server isn't overwhelmed.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["html"], ["github"]] : "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    // Authenticates once, writes e2e/.auth/*.json storage states.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: `next dev -p ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      E2E_TEST_MODE: "1",
      AUTH_SECRET: "e2e-test-secret-not-for-production-0000000000",
      AUTH_TRUST_HOST: "true",
      AUTH_GOOGLE_ID: "e2e-dummy",
      AUTH_GOOGLE_SECRET: "e2e-dummy",
      ALLOWED_USERS: E2E_ALLOWED_USERS,
      NEXT_PUBLIC_BASE_URL: BASE_URL,
      // Dummy data sources — specs mock these via page.route() anyway.
      NEXT_PUBLIC_SHEET_ROOMS_CSV_URL: "http://localhost:9/rooms.csv",
      NEXT_PUBLIC_SHEET_CSV_URL: "http://localhost:9/tasks.csv",
      SHEET_WRITE_URL: "http://localhost:9/exec",
    },
  },
});
