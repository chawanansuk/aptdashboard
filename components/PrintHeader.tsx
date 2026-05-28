"use client";

import { useSession } from "next-auth/react";

/**
 * Print-only header — shows the project name + print date + the
 * signed-in user so printed/saved-as-PDF reports always carry their
 * provenance. Hidden on screen via .ac-print-header CSS; @media print
 * makes it visible at the top of the printed page.
 *
 * Mounted once at the layout root so every printable view gets it.
 */
export default function PrintHeader() {
  const { data: session } = useSession();
  const today = new Date().toLocaleDateString("th-TH", {
    year: "numeric", month: "short", day: "numeric",
  });
  return (
    <div className="ac-print-header" aria-hidden>
      <span className="ac-print-header-brand">APARTCLOUD</span>
      <span className="ac-print-header-date">พิมพ์ {today}</span>
      {session?.user?.email && (
        <span className="ac-print-header-user">โดย {session.user.email}</span>
      )}
    </div>
  );
}
