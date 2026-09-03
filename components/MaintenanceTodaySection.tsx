"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Facility, RoomEquipment } from "@/types";
import { EQUIPMENT_TYPE_ICON, FACILITY_TYPE_ICON } from "@/lib/constants";
import { daysUntilService, isServiceCountable } from "@/lib/maintenanceUtils";
import { formatCommonArea } from "@/lib/taskLocation";
import { cachedFetchJson } from "@/lib/cachedFetchJson";

interface Props {
  activeBuilding: string;
  /** Open Add Task modal pre-filled for a maintenance entry */
  onScheduleService: (building: string, room: string, note: string) => void;
}

/**
 * "บำรุงรักษาวันนี้" — top-of-page section on the "วันนี้" view that
 * surfaces equipment + facility items that are either overdue or due
 * today. Closes the gap between the maintenance schedule and the
 * engineer's daily worklist: instead of opening "บำรุงรักษา" view
 * separately, the urgent items appear right where the engineer starts
 * their day.
 *
 * Permission: caller (page.tsx) decides whether to render this — wired
 * only for engineer + management.
 *
 * Filters by activeBuilding (respects the building chip in the header).
 * Auto-hides when there's nothing urgent — no empty noise.
 */

type ServiceableKind = "equipment" | "facility";

interface BriefingItem {
  kind: ServiceableKind;
  id: string;
  building: string;
  /** Empty string for facility (building-level) */
  room: string;
  type: string;
  brand: string;
  /** Negative = overdue. 0 = today. */
  days: number;
  status: "overdue" | "today";
}

function isEquipment(e: RoomEquipment | Facility): e is RoomEquipment {
  return "room" in e;
}

export default function MaintenanceTodaySection({
  activeBuilding, onScheduleService,
}: Props) {
  const [items, setItems] = useState<BriefingItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (opts?: { signal?: AbortSignal }) => {
    setErr(null);
    setLoading(true);
    try {
      // Fetch equipment + facility in parallel — both contribute to "due today".
      // cachedFetchJson collapses concurrent overview-mount calls (also issued
      // by useMaintenanceCounts / useAssetAlertCounts / ServiceDueBanner) into
      // one round-trip per URL; AbortSignal is honoured at the consumer level
      // via the `aborted` checks below.
      // audit r27: เดิม .catch(() => []) ทั้งคู่ → โหลดพัง = "ไม่มีงานถึงรอบ"
      // เงียบๆ ช่างอ่านว่าไม่มีงาน ทั้งที่แค่ Google ตอบช้า
      let fetchFailed: string | null = null;
      const [equipRes, facRes] = await Promise.all([
        cachedFetchJson<{ rows: RoomEquipment[] }>("/api/maintenance-plan")
          .then((j) => (j.rows || []) as RoomEquipment[])
          .catch((e) => { fetchFailed = e instanceof Error ? e.message : "โหลดไม่สำเร็จ"; return [] as RoomEquipment[]; }),
        cachedFetchJson<{ rows: Facility[] }>("/api/facilities")
          .then((j) => (j.rows || []) as Facility[])
          .catch((e) => { fetchFailed = e instanceof Error ? e.message : "โหลดไม่สำเร็จ"; return [] as Facility[]; }),
      ]);
      if (fetchFailed) setErr(`โหลดรายการบำรุงไม่ครบ: ${fetchFailed}`);
      if (opts?.signal?.aborted) return;

      const out: BriefingItem[] = [];
      const consider = (list: Array<RoomEquipment | Facility>, kind: ServiceableKind) => {
        for (const eq of list) {
          if (!isServiceCountable(eq)) continue; // ใช้ไม่ได้/ปิดใช้งาน ไม่นับ (audit r16 #9)
          const days = daysUntilService(eq);
          if (days === null) continue;
          if (days > 0) continue; // only overdue (< 0) or today (= 0)
          out.push({
            kind,
            id: eq.id,
            building: eq.building,
            room: isEquipment(eq)
              ? eq.room
              : formatCommonArea(
                  (eq as Facility).name ? `${eq.type} ${(eq as Facility).name}` : eq.type
                ),
            type: eq.type,
            brand: isEquipment(eq) ? eq.brand : (eq as Facility).name,
            days,
            status: days < 0 ? "overdue" : "today",
          });
        }
      };
      consider(equipRes, "equipment");
      consider(facRes, "facility");

      // Most-overdue first, then today
      out.sort((a, b) => a.days - b.days);
      if (opts?.signal?.aborted) return;
      setItems(out);
    } catch (e) {
      if (opts?.signal?.aborted) return;
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      if (!opts?.signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load({ signal: ctrl.signal });
    return () => ctrl.abort();
  }, [load]);

  const filtered = useMemo(() => {
    if (!items) return null;
    if (activeBuilding === "ทั้งหมด") return items;
    return items.filter((i) => i.building === activeBuilding);
  }, [items, activeBuilding]);

  // Don't show section while initial fetch is in flight (avoids flash)
  // and don't show empty section at all
  if (loading && !items) return null;
  if (!filtered || filtered.length === 0) return null;

  const overdue = filtered.filter((i) => i.status === "overdue");
  const today = filtered.filter((i) => i.status === "today");

  return (
    <section className="ac-maint-today" aria-label="บำรุงรักษาที่ต้องทำวันนี้">
      <header className="ac-maint-today-head">
        <span className="ac-maint-today-title">บำรุงรักษา</span>
        <span className="ac-maint-today-sub">
          {overdue.length > 0 && (
            <span className="ac-maint-today-pill is-overdue">เลยกำหนด {overdue.length}</span>
          )}
          {today.length > 0 && (
            <span className="ac-maint-today-pill is-today">วันนี้ {today.length}</span>
          )}
        </span>
      </header>

      {err && <div className="ac-banner ac-banner-warn">{err}</div>}

      <ul className="ac-maint-today-list">
        {filtered.map((item) => {
          const icon = item.kind === "equipment"
            ? EQUIPMENT_TYPE_ICON[item.type] || "🔧"
            : FACILITY_TYPE_ICON[item.type] || "🏢";
          const where = item.kind === "equipment"
            ? `${item.building} ${item.room}`
            : item.building;
          const dueLabel = item.status === "overdue"
            ? `เลย ${Math.abs(item.days)} วัน`
            : "ครบรอบวันนี้";
          const noteForTask =
            `บำรุงตามรอบ · ${item.type}` +
            (item.brand ? ` ${item.brand}` : "") +
            (item.status === "overdue" ? ` · เลยกำหนด ${Math.abs(item.days)} วัน` : "");
          return (
            <li
              key={`${item.kind}:${item.id}`}
              className={`ac-maint-today-item is-${item.status}`}
            >
              <span className="ac-maint-today-icon" aria-hidden>{icon}</span>
              <div className="ac-maint-today-main">
                <div className="ac-maint-today-line1">
                  <strong>{where}</strong>
                  <span className="ac-maint-today-type">· {item.type}</span>
                  {item.brand && (
                    <span className="ac-maint-today-brand">· {item.brand}</span>
                  )}
                </div>
                <div className="ac-maint-today-line2">
                  <span className={`ac-maint-today-due is-${item.status}`}>
                    {dueLabel}
                  </span>
                  {item.kind === "facility" && (
                    <span className="ac-maint-today-kind">สาธารณูปโภค</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="ac-btn ac-btn-primary ac-btn-sm"
                onClick={() => onScheduleService(item.building, item.room, noteForTask)}
                title="สร้างงานบำรุงสำหรับรายการนี้"
              >+ สร้างงาน</button>
            </li>
          );
        })}
      </ul>

      {filtered.length === overdue.length + today.length && (
        <div className="ac-maint-today-foot">
          เปิด <strong>บำรุงรักษา</strong> เพื่อดูรายการครบและจัดตารางล่วงหน้า
        </div>
      )}
    </section>
  );
}
