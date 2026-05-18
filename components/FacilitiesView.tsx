"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { Facility, FacilityType, FacilityStatus } from "@/types";
import {
  FACILITY_TYPES, FACILITY_TYPE_ICON, FACILITY_STATUS_COLOR,
  MAINTENANCE_STATUS_COLOR, MAINTENANCE_STATUS_LABEL,
} from "@/lib/constants";
import { canAddEngTask } from "@/lib/permissions";
import {
  loadFacilityCache, saveFacilityCache, invalidateFacilityCache,
} from "@/lib/facilityCache";
import {
  computeNextService, getMaintenanceStatus, daysUntilService, formatDateLabel,
} from "@/lib/maintenanceUtils";
import AddFacilityModal from "./AddFacilityModal";

interface Props {
  buildings: string[];
  activeBuilding: string;
  onScheduleService: (building: string, room: string, note: string) => void;
}

type TypeFilter = "all" | FacilityType;

export default function FacilitiesView({ buildings, activeBuilding, onScheduleService }: Props) {
  const { data: session } = useSession();
  const canWrite = canAddEngTask(session?.user?.role);

  const [rows, setRows] = useState<Facility[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Facility | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    setErr(null);
    if (!opts?.force) {
      const cached = loadFacilityCache();
      if (cached) {
        setRows(cached);
        return;
      }
    }
    setLoading(true);
    try {
      const res = await fetch("/api/facilities", { cache: "no-store" });
      const j = await res.json().catch(() => ({ error: "invalid JSON" }));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      const list: Facility[] = Array.isArray(j.rows) ? j.rows : [];
      setRows(list);
      saveFacilityCache(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter((f) => {
      if (activeBuilding !== "ทั้งหมด" && f.building !== activeBuilding) return false;
      if (typeFilter !== "all" && f.type !== typeFilter) return false;
      return true;
    });
  }, [rows, activeBuilding, typeFilter]);

  /** Group by building, preserve original buildings order. */
  const grouped = useMemo(() => {
    const map = new Map<string, Facility[]>();
    for (const f of filtered) {
      if (!map.has(f.building)) map.set(f.building, []);
      map.get(f.building)!.push(f);
    }
    // Sort within each group by status severity then type
    for (const list of map.values()) {
      list.sort((a, b) => {
        const sev = (s: string) =>
          s === "ต้องซ่อม" ? 0 :
          s === "กำลังซ่อม" ? 1 :
          s === "ปิดใช้งาน" ? 2 :
          s === "ใช้งานได้" ? 3 : 4;
        const ds = sev(a.status) - sev(b.status);
        if (ds !== 0) return ds;
        return (a.type + a.name).localeCompare(b.type + b.name);
      });
    }
    return map;
  }, [filtered]);

  const buildingOrder = useMemo(() => {
    const present = new Set(grouped.keys());
    const ordered = buildings.filter((b) => present.has(b));
    // Include any building present in data but not in `buildings` (defensive)
    for (const b of present) {
      if (!ordered.includes(b)) ordered.push(b);
    }
    return ordered;
  }, [grouped, buildings]);

  async function handleSubmit(entry: {
    id?: string;
    building: string;
    type: FacilityType;
    name: string;
    installDate: string;
    lastService: string;
    status: FacilityStatus;
    note: string;
    intervalDays: number;
  }) {
    setSubmitting(true);
    setErr(null);
    try {
      const action = entry.id ? "update" : "add";
      const res = await fetch("/api/facilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...entry }),
      });
      const j = await res.json().catch(() => ({ ok: false, error: "invalid JSON" }));
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setAddOpen(false);
      setEditTarget(null);
      invalidateFacilityCache();
      await load({ force: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMarkRepaired(f: Facility) {
    if (!canWrite) return;
    const today = new Date().toISOString().slice(0, 10);
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/facilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: f.id,
          status: "ใช้งานได้",
          lastService: today,
        }),
      });
      const j = await res.json().catch(() => ({ ok: false, error: "invalid JSON" }));
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      invalidateFacilityCache();
      await load({ force: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  // Summary counts (respect active building filter)
  const counts = useMemo(() => {
    let working = 0, repair = 0, offline = 0;
    for (const f of filtered) {
      if (f.status === "ใช้งานได้") working++;
      else if (f.status === "ต้องซ่อม" || f.status === "กำลังซ่อม") repair++;
      else if (f.status === "ปิดใช้งาน") offline++;
    }
    return { working, repair, offline, total: filtered.length };
  }, [filtered]);

  return (
    <div className="ac-facilities">
      <div className="ac-maintenance-summary">
        <div className="ac-maint-stat" style={{ borderColor: "#16A34A" }}>
          <div className="ac-maint-stat-num" style={{ color: "#16A34A" }}>{counts.working}</div>
          <div className="ac-maint-stat-label">ใช้งานได้</div>
        </div>
        <div className="ac-maint-stat" style={{ borderColor: "#EAB308" }}>
          <div className="ac-maint-stat-num" style={{ color: "#EAB308" }}>{counts.repair}</div>
          <div className="ac-maint-stat-label">ต้อง/กำลังซ่อม</div>
        </div>
        <div className="ac-maint-stat" style={{ borderColor: "#DC2626" }}>
          <div className="ac-maint-stat-num" style={{ color: "#DC2626" }}>{counts.offline}</div>
          <div className="ac-maint-stat-label">ปิดใช้งาน</div>
        </div>
        <div className="ac-maint-stat" style={{ borderColor: "#94A3B8" }}>
          <div className="ac-maint-stat-num" style={{ color: "#94A3B8" }}>{counts.total}</div>
          <div className="ac-maint-stat-label">รวม</div>
        </div>
      </div>

      <div className="ac-facilities-toolbar">
        <div className="ac-chips">
          <button
            className={`ac-chip ${typeFilter === "all" ? "is-active" : ""}`}
            onClick={() => setTypeFilter("all")}
          >ทุกประเภท</button>
          {FACILITY_TYPES.map((t) => {
            const count = rows ? rows.filter((f) => f.type === t).length : 0;
            if (count === 0 && typeFilter !== t) return null;
            return (
              <button
                key={t}
                className={`ac-chip ${typeFilter === t ? "is-active" : ""}`}
                onClick={() => setTypeFilter(t)}
              >{FACILITY_TYPE_ICON[t] || ""} {t} ({count})</button>
            );
          })}
        </div>
        {canWrite && (
          <button className="ac-btn ac-btn-primary ac-btn-sm" onClick={() => setAddOpen(true)}>
            + เพิ่ม
          </button>
        )}
      </div>

      {err && <div className="ac-banner ac-banner-warn">{err}</div>}

      {loading && !rows && (
        <div className="ac-empty" style={{ padding: 40, color: "#94A3B8", textAlign: "center" }}>
          กำลังโหลดสาธารณูปโภค...
        </div>
      )}

      {!loading && rows && filtered.length === 0 && (
        <div className="ac-empty" style={{ padding: 40, color: "#94A3B8", textAlign: "center" }}>
          ยังไม่มีสาธารณูปโภคในตึกนี้
        </div>
      )}

      {buildingOrder.map((b) => {
        const list = grouped.get(b) || [];
        return (
          <section key={b} className="ac-facility-group">
            <h3 className="ac-facility-group-head">{b} <span>({list.length})</span></h3>
            <ul className="ac-equipment-list">
              {list.map((f) => {
                const statusColor = FACILITY_STATUS_COLOR[f.status] || "#94A3B8";
                const icon = FACILITY_TYPE_ICON[f.type] || "🏢";
                const needsRepair = f.status === "ต้องซ่อม" || f.status === "กำลังซ่อม" || f.status === "ปิดใช้งาน";
                const m = getMaintenanceStatus(f);
                const next = computeNextService(f);
                const days = daysUntilService(f);
                const mColor = MAINTENANCE_STATUS_COLOR[m] || "#94A3B8";
                const tail =
                  days === null ? "" :
                  days < 0 ? ` (เลย ${Math.abs(days)} วัน)` :
                  days === 0 ? " (วันนี้)" :
                  ` (อีก ${days} วัน)`;
                const taskNote =
                  `บำรุง${f.type}${f.name ? ` "${f.name}"` : ""}` +
                  (next ? ` · กำหนด ${formatDateLabel(next)}` : "");
                return (
                  <li key={f.id} className="ac-equipment-card">
                    <div className="ac-equipment-card-icon" aria-hidden="true">{icon}</div>
                    <div className="ac-equipment-card-main">
                      <div className="ac-equipment-card-line1">
                        <span className="ac-equipment-card-type">{f.type}</span>
                        <span
                          className="ac-equipment-card-status"
                          style={{ background: statusColor + "22", color: statusColor }}
                        >{f.status}</span>
                      </div>
                      {f.name && <div className="ac-equipment-card-brand">{f.name}</div>}
                      <div className="ac-equipment-card-meta">
                        {f.installDate && <span>ติดตั้ง {formatDateLabel(f.installDate)}</span>}
                        {f.lastService && (
                          <>
                            {f.installDate && <span> · </span>}
                            <span>บริการล่าสุด {formatDateLabel(f.lastService)}</span>
                          </>
                        )}
                      </div>
                      {next && (
                        <div className="ac-equipment-card-meta">
                          <span
                            className="ac-equipment-card-status"
                            style={{ background: mColor + "22", color: mColor }}
                          >
                            {MAINTENANCE_STATUS_LABEL[m]} · บำรุงครั้งต่อไป {formatDateLabel(next)}{tail}
                          </span>
                        </div>
                      )}
                      {f.note && <div className="ac-equipment-card-note">{f.note}</div>}
                    </div>
                    {canWrite && (
                      <div className="ac-equipment-card-actions">
                        {needsRepair && (
                          <button
                            className="ac-btn ac-btn-primary ac-btn-sm"
                            onClick={() => handleMarkRepaired(f)}
                            disabled={submitting}
                            title="ตั้งสถานะเป็น 'ใช้งานได้' + วันบริการล่าสุด = วันนี้"
                          >✓ ซ่อมแล้ว</button>
                        )}
                        <button
                          className="ac-btn ac-btn-ghost ac-btn-sm"
                          onClick={() => onScheduleService(f.building, "", taskNote)}
                          disabled={submitting}
                          title="สร้างงานบำรุงสาธารณูปโภคนี้"
                        >+ นัดบำรุง</button>
                        <button
                          className="ac-btn ac-btn-ghost ac-btn-sm"
                          onClick={() => setEditTarget(f)}
                          disabled={submitting}
                        >แก้ไข</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <AddFacilityModal
        open={addOpen}
        buildings={buildings}
        submitting={submitting}
        onClose={() => setAddOpen(false)}
        onSubmit={handleSubmit}
      />

      <AddFacilityModal
        open={!!editTarget}
        buildings={buildings}
        submitting={submitting}
        initial={editTarget ? {
          id: editTarget.id,
          building: editTarget.building,
          type: editTarget.type,
          name: editTarget.name,
          installDate: editTarget.installDate,
          lastService: editTarget.lastService,
          status: editTarget.status,
          note: editTarget.note,
          intervalDays: editTarget.intervalDays || 0,
        } : undefined}
        onClose={() => setEditTarget(null)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
