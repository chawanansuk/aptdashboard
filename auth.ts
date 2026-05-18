import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

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
 * Parse ALLOWED_USERS env: "email:role,email:role,..."
 * Returns Map<lowercased email, role>. Invalid entries are dropped.
 * Accepts both new roles (sales/engineer/management) and legacy
 * (admin/staff) — legacy values are mapped to the new vocabulary.
 */
function parseAllowed(raw: string): Map<string, Role> {
  const m = new Map<string, Role>();
  for (const part of (raw || "").split(",")) {
    const [emailRaw, roleRaw] = part.split(":").map((x) => (x || "").trim());
    if (!emailRaw || !roleRaw) continue;
    const role = normalizeRole(roleRaw);
    if (!role) continue;
    m.set(emailRaw.toLowerCase(), role);
  }
  return m;
}

const ALLOWED = parseAllowed(process.env.ALLOWED_USERS || "");

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
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
      // On first sign-in, `user` is set; populate role from allowlist.
      const emailFromUser = user?.email ? user.email.toLowerCase() : null;
      const emailFromToken = token.email ? String(token.email).toLowerCase() : null;
      const email = emailFromUser || emailFromToken;
      if (email) {
        const role = ALLOWED.get(email);
        if (role) token.role = role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.role) {
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
});

// Re-export raw role type for testing/migration tooling
export type { RawRole };
