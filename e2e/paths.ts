import path from "node:path";

/**
 * Shared e2e constants/helpers. This is a PLAIN module (not a *.spec or
 * *.setup file) so both the setup project and the spec projects can
 * import it — Playwright forbids one test file importing another.
 */

export const AUTH_DIR = path.join(__dirname, ".auth");

export const E2E_ROLES = [
  { key: "management", email: "e2e-mgmt@test.local" },
  { key: "sales", email: "e2e-sales@test.local" },
  { key: "engineer", email: "e2e-eng@test.local" },
  { key: "multi", email: "e2e-multi@test.local" },
] as const;

export function storageStatePath(role: string): string {
  return path.join(AUTH_DIR, `${role}.json`);
}
