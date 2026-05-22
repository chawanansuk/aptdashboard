"use client";

import { useEffect, useMemo, useState } from "react";
import type { RoomEquipment } from "@/types";
import { getMaintenanceStatus } from "@/lib/maintenanceUtils";
import { canAccess } from "@/lib/permissions";
import { useEffectiveRoles } from "@/lib/useEffectiveRoles";

/**
 * Service-due banner — surfaces on Overview when any equipment in the
 * property is overdue or due-soon. Engineer/management only (skips
 * fetch entirely for sales since they can't access /maintenance).
 *
 * Tone:
 *   overdue > 0 → red "⚠ เลยกำหนดบำรุง N รายการ"
 *   else due-soon > 0 → amber "🛠 ใกล้กำหนดบำรุง N รายการ"
 *   else nothing rendered
 *
 * Click → navigate to maintenance view (consumer wires onNavigate).
 *
 * Scoped to activeBuilding (Overview-level filter) so users see
 * counts that match what they're focused on.
 */

interface Props {
  activeBuilding: string;
  onNavigate?: (view: "maintenance") => void;
}

export default function ServiceDueBanner({ activeBuilding, onNavigate }: Props) {
  const { actualRoles, effectiveRoles } = useEffectiveRoles();
  const roles = effectiveRoles.length ? effectiveRoles : actualRoles;
  const canSee = canAccess(roles, "maintenance");

  const [rows, setRows] = useState<RoomEquipment[] | null>(null);

  useEffect(() => {
    if (!canSee) return;
    let cancelled = false;
    fetch("/api/maintenance-plan", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setRows((data?.rows || []) as RoomEquipment[]);
      })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [canSee]);

  const counts = useMemo(() => {
    if (!rows) return { overdue: 0, dueSoon: 0 };
    const scoped = activeBuilding === "ทั้งหมด"
      ? rows
      : rows.filter((e) => e.building === activeBuilding);
    let overdue = 0, dueSoon = 0;
    for (const e of scoped) {
      const s = getMaintenanceStatus(e);
      if (s === "overdue") overdue++;
      else if (s === "due-soon") dueSoon++;
    }
    return { overdue, dueSoon };
  }, [rows, activeBuilding]);

  if (!canSee) return null;
  if (counts.overdue === 0 && counts.dueSoon === 0) return null;

  const tone = counts.overdue > 0 ? "is-overdue" : "is-soon";
  const label = counts.overdue > 0
    ? `⚠ เลยกำหนดบำรุง ${counts.overdue} รายการ${counts.dueSoon ? ` · ใกล้กำหนด ${counts.dueSoon}` : ""}`
    : `🛠 ใกล้กำหนดบำรุง ${counts.dueSoon} รายการ`;

  return (
    <button
      type="button"
      className={`ac-service-due-banner ${tone}`}
      onClick={() => onNavigate?.("maintenance")}
      title="คลิกเพื่อไปที่หน้าบำรุงรักษา"
    >
      <span>{label}</span>
      <span className="ac-service-due-arrow" aria-hidden>→</span>
    </button>
  );
}
