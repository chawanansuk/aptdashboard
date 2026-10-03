"use client";

import { useEffect } from "react";
import { clearClientCaches } from "@/lib/cacheData";

/** Rendered on the login screens: reaching them means no session, so the
 *  previous user's cached dashboard data must not survive (audit r37 M3). */
export default function ClearClientCaches() {
  useEffect(() => { void clearClientCaches(); }, []);
  return null;
}
