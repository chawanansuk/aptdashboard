import type { DefaultSession } from "next-auth";

type Role = "sales" | "engineer" | "management";

declare module "next-auth" {
  interface Session {
    user: {
      /** Primary role (= roles[0]). Kept for backward compatibility / display. */
      role?: Role;
      /** All roles granted to the user. Single-role users get a length-1 array. */
      roles?: Role[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
    roles?: Role[];
  }
}
