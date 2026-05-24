import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

/**
 * Three operating modes, mirroring the structure used by the
 * ApartCloud Service reference app:
 *   - sales       — เซลส์: ผังห้อง / นัดดู / สัญญา / ย้ายเข้า-ออก
 *   - engineer    — ช่าง: ซ่อม / ทำสะอาด / อุปกรณ์ / Facility
 *   - management  — ผู้บริหาร: ดูทุกอย่าง + รายได้ + finance
 *
 * Legacy aliases (for env values that pre-date this change):
 *   admin → management
 *   staff → sales
 */
export type Role = "sales" | "engineer" | "management";

type RawRole = Role | "admin" | "staff";

const LEGACY_MAP: Record<string, Role> = {
  admin: "management",
  staff: "sales",
};

function normalizeRole(raw: string): Role | null {
  const v = raw.trim().toLowerCase();
  if (v === "sales" || v === "engineer" || v === "management") return v;
  if (LEGACY_MAP[v]) return LEGACY_MAP[v];
  return null;
}

/**
 * Parse ALLOWED_USERS env: "email:role,email:role+role,..."
 *
 * Single-role syntax (legacy, still supported):
 *   "alice@x.com:sales"          → [sales]
 *
 * Multi-role syntax (v3.10):
 *   "bob@x.com:sales+engineer"   → [sales, engineer]
 *
 * Returns Map<lowercased email, Role[]>. Invalid entries are dropped.
 * Accepts both new roles (sales/engineer/management) and legacy
 * (admin/staff) — legacy values are mapped to the new vocabulary.
 */
function parseAllowed(raw: string): Map<string, Role[]> {
  const m = new Map<string, Role[]>();
  for (const part of (raw || "").split(",")) {
    const [emailRaw, roleRaw] = part.split(":").map((x) => (x || "").trim());
    if (!emailRaw || !roleRaw) continue;
    const roles: Role[] = [];
    for (const r of roleRaw.split("+")) {
      const role = normalizeRole(r);
      if (role && !roles.includes(role)) roles.push(role);
    }
    if (roles.length === 0) continue;
    m.set(emailRaw.toLowerCase(), roles);
  }
  return m;
}

const ALLOWED = parseAllowed(process.env.ALLOWED_USERS || "");

/**
 * Test-only credentials provider for Playwright e2e.
 *
 * Enabled ONLY when E2E_TEST_MODE === "1" AND we are NOT on a Vercel
 * production deployment. The VERCEL_ENV guard means that even if the
 * env var ever leaked into the production project, the provider stays
 * off — production can only ever authenticate via real Google OAuth.
 *
 * The provider trusts the supplied email but does NOT bypass the
 * allowlist: the signIn() callback below still rejects any email not
 * in ALLOWED_USERS, so e2e must seed test emails into ALLOWED_USERS.
 * Roles are then derived from that allowlist exactly like a real login.
 */
const E2E_ENABLED =
  process.env.E2E_TEST_MODE === "1" && process.env.VERCEL_ENV !== "production";

const providers: NextAuthConfig["providers"] = [Google];
if (E2E_ENABLED) {
  providers.push(
    Credentials({
      id: "e2e",
      name: "E2E Test Login",
      credentials: { email: { label: "Email", type: "text" } },
      authorize(creds) {
        const email = String(creds?.email || "").trim().toLowerCase();
        if (!email) return null;
        // Only allowlisted emails — same gate as the signIn callback.
        if (!ALLOWED.has(email)) return null;
        return { id: email, email, name: email.split("@")[0] };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  pages: {
    signIn: "/login",
    error: "/login/denied",
  },
  callbacks: {
    async signIn({ user }) {
      const email = (user?.email || "").toLowerCase();
      if (!email) return false;
      // Reject if not in allowlist; redirect string sends user to /login/denied
      if (!ALLOWED.has(email)) return "/login/denied";
      return true;
    },
    async jwt({ token, user }) {
      // On first sign-in, `user` is set; populate roles from allowlist.
      const emailFromUser = user?.email ? user.email.toLowerCase() : null;
      const emailFromToken = token.email ? String(token.email).toLowerCase() : null;
      const email = emailFromUser || emailFromToken;
      if (email) {
        const roles = ALLOWED.get(email);
        if (roles && roles.length) {
          token.roles = roles;
          token.role = roles[0]; // primary role (backward compat)
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.role) session.user.role = token.role as Role;
        if (Array.isArray(token.roles)) {
          session.user.roles = token.roles as Role[];
        } else if (token.role) {
          session.user.roles = [token.role as Role];
        }
      }
      return session;
    },
  },
});

// Re-export raw role type for testing/migration tooling
export type { RawRole };
