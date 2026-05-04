"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import type { ReactNode } from "react";

interface Props {
  session: Session | null;
  children: ReactNode;
}

export default function SessionProviderClient({ session, children }: Props) {
  return <SessionProvider session={session}>{children}</SessionProvider>;
}
