"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { Facility, RoomEquipment } from "@/types";
import { canAddEngTask } from "@/lib/permissions";
import { FACILITY_TYPE_ICON, EQUIPMENT_TYPE_ICON } from "@/lib/constants";
import { daysUntilService, getMaintenanceStatus, formatDateLabel } from "@/lib/maintenanceUtils";
import { invalidateFacilityCache } from "@/lib/facilityCache";
import { bustCachedFetch, cachedFetchJson } from "@/lib/cachedFetchJson";
import { formatCommonArea } from "@/lib/taskLocation";
import { bangkokTodayYmd } from "@/lib/dateUtils";
import { invalidateEquipmentCache } from "@/lib/equipmentCache";
import { toast } from "@/lib/toast";
import { FacilitiesSkeleton, MaintenanceSkeleton } from "@/components/skeletons/ViewSkeletons";
import LoadingState from "./LoadingState";
import ErrorBanner from "./ErrorBanner";
import EmptyState from "./EmptyState";

const FacilitiesView = lazy(() => import("./FacilitiesView"));
const MaintenanceView = lazy(() => import("./MaintenanceView"));
const RecurringView = lazy(() => import("./RecurringView"));

/**
 * 🔧 ซ่อมบำรุง — ONE hub for everything maintenance (UI r15).
 *
 * The owner's staff found the old layout confusing: the same concept
 * (รอบซ่อมบำรุง) lived in three sidebar menus — บำรุงรักษา (room
 * equipment), สาธารณูปโภค (building facilities), งานประจำ (recurring
 * tasks) — and nothing connected them. This hub replaces all three
 * sidebar entries with a single one; the old views survive intact as
 * tabs, and a NEW first tab merges every due item from both sources
 * into one actionable list with the same "✓ ทำแล้ววันนี้" quick action.
 *
 * Old view keys (facilities/recurring) still route here with the right
 * tab preselected, so bookmarks and habits keep working.
 */

export type HubTab = "due" | "facility" | "equipment" | "recurring";

interface Props {
  buildings: string[];
  activeBuilding: string;
  onScheduleService: (building: string, room: string, note: string) => void;
  initialTab?: HubTab;
}

/** One merged due row — normalized over facility / equipment sources. */
interface DueItem {
  key: string;
  source: "facility" | "equipment";
  id: string;
  icon: string;
  /** e.g. "มีทอง · ส่วนกลาง" or "มีทอง · ห้อง 204" */
  where: string;
  building: string;
  room: string; // "" for facilities
  label: string;
  intervalDays: number;
  lastService: string;
  days: number; // negative = overdue
  /** ต้องซ่อม/กำลังซ่อม — the row needs the REPAIR action, not just a
   *  cycle reset (audit r16 #3). */
  broken: boolean;
  status: string;
}

const TABS: { key: HubTab; label: string }[] = [
  { key: "due", label: "🔔 ถึงรอบ" },
  { key: "facility", label: "🏢 ส่วนกลาง" },
  { key: "equipment", label: "❄️ อุปกรณ์ในห้อง" },
  { key: "recurring", label: "🔁 งานประจำ" },
];

export default function MaintenanceHub({
  buildings, activeBuilding, onScheduleService, initialTab = "due",
}: Props) {
  const { data: session } = useSession();
  const canWrite = canAddEngTask(session?.user?.roles);
  const [tab, setTab] = useState<HubTab>(initialTab);
  const [facilities, setFacilities] = useState<Facility[] | null>(null);
  const [equipment, setEquipment] = useState<RoomEquipment[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadDue = useCallback(async () => {
    setErr(null);
    try {
      // Shared 30s cache + in-flight dedup (perf r18): the sidebar
      // badge, ServiceDueBanner and the hover-prefetch all read the
      // SAME endpoints — with plain no-store fetches the hub re-paid
      // two network round-trips on every open even when that data was
      // seconds old. Mutations bust these URLs, so freshness holds.
      const [fj, ej] = await Promise.all([
        cachedFetchJson<{ rows?: Facility[] }>("/api/facilities"),
        cachedFetchJson<{ rows?: RoomEquipment[] }>("/api/maintenance-plan"),
      ]);
      setFacilities(Array.isArray(fj.rows) ? fj.rows : []);
      setEquipment(Array.isArray(ej.rows) ? ej.rows : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
      setFacilities((p) => p ?? []);
      setEquipment((p) => p ?? []);
    }
  }, []);

  // ONE effect covers both needs: fires on mount (whatever the initial
  // tab — the 🔔 badge must count, audit r16 #4) and again on every tab
  // change back to due. The previous two-effect split double-fetched on
  // mount (perf r18); repeat calls inside 30s are cache hits anyway.
  useEffect(() => {
    void loadDue();
  }, [tab, loadDue]);

  const dueItems = useMemo((): DueItem[] => {
    const out: DueItem[] = [];
    for (const f of facilities || []) {
      if (activeBuilding !== "ทั้งหมด" && f.building !== activeBuilding) continue;
      if (f.status === "ปิดใช้งาน") continue;
      const m = getMaintenanceStatus(f);
      if (m !== "overdue" && m !== "due-soon") continue;
      out.push({
        key: `f-${f.id}`, source: "facility", id: f.id,
        icon: FACILITY_TYPE_ICON[f.type] || "🏢",
        where: `${f.building} · ส่วนกลาง`,
        building: f.building, room: "",
        label: f.type + (f.name ? ` ${f.name}` : ""),
        intervalDays: f.intervalDays || 0,
        lastService: f.lastService || f.installDate || "",
        days: daysUntilService(f) ?? 0,
        broken: f.status === "ต้องซ่อม" || f.status === "กำลังซ่อม",
        status: f.status,
      });
    }
    for (const e of equipment || []) {
      if (activeBuilding !== "ทั้งหมด" && e.building !== activeBuilding) continue;
      if (e.status === "ใช้ไม่ได้") continue;
      const m = getMaintenanceStatus(e);
      if (m !== "overdue" && m !== "due-soon") continue;
      out.push({
        key: `e-${e.id}`, source: "equipment", id: e.id,
        icon: EQUIPMENT_TYPE_ICON[e.type] || "🔧",
        where: `${e.building} · ห้อง ${e.room}`,
        building: e.building, room: e.room,
        label: e.type + (e.brand ? ` ${e.brand}` : ""),
        intervalDays: e.intervalDays || 0,
        lastService: e.lastService || e.installDate || "",
        days: daysUntilService(e) ?? 0,
        broken: e.status === "ต้องซ่อม" || e.status === "กำลังซ่อม",
        status: e.status,
      });
    }
    out.sort((a, b) => a.days - b.days);
    return out;
  }, [facilities, equipment, activeBuilding]);

  /** ✓ ทำแล้ววันนี้ / ✓ ซ่อมแล้ว — one quick action for BOTH sources.
   *  A broken item also gets its status reset to normal (a plain
   *  cycle-reset would leave it broken forever — audit r16 #3). */
  async function markServiced(item: DueItem) {
    if (!canWrite || busyKey) return;
    setBusyKey(item.key);
    const today = bangkokTodayYmd();
    try {
      const url = item.source === "facility" ? "/api/facilities" : "/api/room-equipment";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: item.id,
          lastService: today,
          ...(item.broken
            ? { status: item.source === "facility" ? "ใช้งานได้" : "ปกติ" }
            : {}),
        }),
      });
      const j = await res.json().catch(() => ({ ok: false }));
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      if (item.source === "facility") {
        invalidateFacilityCache();
        bustCachedFetch("/api/facilities");
      } else {
        // Mirror RoomEquipmentTab's busts so the sidebar badge /
        // ServiceDueBanner / room modal don't stay stale (audit r16 #7).
        bustCachedFetch("/api/maintenance-plan");
        invalidateEquipmentCache(item.building, item.room);
      }
      toast.success(`บันทึกแล้ว: ${item.label} — เริ่มนับรอบใหม่`);
      await loadDue();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusyKey(null);
    }
  }

  const loadingDue = facilities === null || equipment === null;

  return (
    <div className="ac-maint-hub">
      <div className="ac-chips ac-maint-hub-tabs" role="tablist" aria-label="หมวดซ่อมบำรุง">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`ac-chip ${tab === t.key ? "is-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.key === "due" && dueItems.length > 0 && (
              <span className="ac-maint-hub-badge">{dueItems.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "due" && (
        <div className="ac-maint-hub-due">
          <p className="ac-maint-hub-hint">
            รวมทุกอย่างที่ถึง/ใกล้ถึงรอบบำรุง จากส่วนกลางและอุปกรณ์ในห้อง —
            ทำเสร็จแล้วกด <strong>✓ ทำแล้ววันนี้</strong> ระบบเริ่มนับรอบใหม่ให้เอง
            (เตือนซ้ำทางอีเมลทุกเช้าด้วย)
          </p>
          <ErrorBanner message={err} onRetry={() => void loadDue()} onDismiss={() => setErr(null)} />
          {loadingDue && <LoadingState label="กำลังรวมรายการถึงรอบ..." />}
          {!loadingDue && !err && dueItems.length === 0 && (
            <EmptyState
              icon="celebration"
              tone="celebration"
              title="ไม่มีอะไรถึงรอบบำรุง 🎉"
              description='ตั้งรอบเพิ่มได้ที่แท็บ "ส่วนกลาง" (ปั๊มน้ำ/ล้างแอร์รวม) หรือ "อุปกรณ์ในห้อง" — ใส่ช่อง รอบบำรุง(วัน) แล้วรายการจะโผล่ที่นี่เองเมื่อใกล้ถึงกำหนด'
            />
          )}
          {!loadingDue && dueItems.length > 0 && (
            <ul className="ac-fac-due-list">
              {dueItems.map((it) => {
                const overdue = it.days < 0;
                return (
                  <li key={it.key} className={`ac-fac-due-row ${overdue ? "is-overdue" : ""}`}>
                    <span className="ac-fac-due-icon" aria-hidden>{it.icon}</span>
                    <span className="ac-fac-due-main">
                      <span className="ac-fac-due-title">
                        <b>{it.where}</b> · {it.label}
                        {it.broken && <span className="ac-fac-due-broken">{it.status}</span>}
                      </span>
                      <span className="ac-fac-due-sub">
                        รอบทุก {it.intervalDays} วัน · ทำล่าสุด {it.lastService ? formatDateLabel(it.lastService) : "—"}
                      </span>
                    </span>
                    <span className={`ac-fac-due-count ${overdue ? "is-overdue" : ""}`}>
                      {overdue ? `เลย ${Math.abs(it.days)} วัน` : it.days === 0 ? "วันนี้" : `อีก ${it.days} วัน`}
                    </span>
                    {canWrite && (
                      <>
                        <button
                          className="ac-btn ac-btn-primary ac-btn-sm ac-fac-done-btn"
                          onClick={() => void markServiced(it)}
                          disabled={busyKey !== null}
                          title={it.broken
                            ? "ตั้งสถานะกลับเป็นปกติ + วันบริการล่าสุด = วันนี้"
                            : "บันทึกวันบริการล่าสุด = วันนี้ (เริ่มนับรอบใหม่)"}
                        >{busyKey === it.key ? "..." : it.broken ? "✓ ซ่อมแล้ว" : "✓ ทำแล้ววันนี้"}</button>
                        <button
                          className="ac-btn ac-btn-ghost ac-btn-sm"
                          onClick={() =>
                            onScheduleService(
                              it.building,
                              it.room || formatCommonArea(it.label),
                              `บำรุง${it.label} · รอบทุก ${it.intervalDays} วัน`
                            )
                          }
                          disabled={busyKey !== null}
                          title="สร้างงานนัดบำรุงในกระดานงานช่าง"
                        >+ นัดบำรุง</button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {tab === "facility" && (
        <Suspense fallback={<FacilitiesSkeleton />}>
          <FacilitiesView
            buildings={buildings}
            activeBuilding={activeBuilding}
            onScheduleService={onScheduleService}
          />
        </Suspense>
      )}
      {tab === "equipment" && (
        <Suspense fallback={<MaintenanceSkeleton />}>
          <MaintenanceView activeBuilding={activeBuilding} onScheduleService={onScheduleService} />
        </Suspense>
      )}
      {tab === "recurring" && (
        <Suspense fallback={<FacilitiesSkeleton />}>
          <RecurringView buildings={buildings} />
        </Suspense>
      )}
    </div>
  );
}
