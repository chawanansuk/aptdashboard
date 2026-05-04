import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export type Role = "admin" | "staff";

/**
 * Parse ALLOWED_USERS env: "email:role,email:role,..."
 * Returns Map<lowercased email, role>. Invalid entries are dropped.
 */
function parseAllowed(raw: string): Map<string, Role> {
  const m = new Map<string, Role>();
  for (const part of (raw || "").split(",")) {
    const [emailRaw, roleRaw] = part.split(":").map((x) => (x || "").trim());
    if (!emailRaw || !roleRaw) continue;
    if (roleRaw !== "admin" && roleRaw !== "staff") continue;
    m.set(emailRaw.toLowerCase(), roleRaw);
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
