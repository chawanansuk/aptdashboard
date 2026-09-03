"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { Facility, FacilityType, FacilityStatus } from "@/types";
import { formatCommonArea } from "@/lib/taskLocation";
import {
  FACILITY_TYPES, FACILITY_TYPE_ICON, FACILITY_STATUS_COLOR,
  MAINTENANCE_STATUS_COLOR, MAINTENANCE_STATUS_LABEL,
} from "@/lib/constants";
import { canAddEngTask } from "@/lib/permissions";
import { bustCachedFetch } from "@/lib/cachedFetchJson";
import {
  loadFacilityCache, saveFacilityCache, invalidateFacilityCache,
} from "@/lib/facilityCache";
import {
  computeNextService, getMaintenanceStatus, daysUntilService, formatDateLabel,
} from "@/lib/maintenanceUtils";
import AddFacilityModal from "./AddFacilityModal";
import ErrorBanner from "./ErrorBanner";
import EmptyState from "./EmptyState";
import LoadingState from "./LoadingState";
import { exportCsv } from "@/lib/csvExport";
import { bangkokTodayYmd } from "@/lib/dateUtils";

interface Props {
  buildings: string[];
  activeBuilding: string;
  onScheduleService: (building: string, room: string, note: string) => void;
}

type TypeFilter = "all" | FacilityType;

export default function FacilitiesView({ buildings, activeBuilding, onScheduleService }: Props) {
  const { data: session } = useSession();
  const canWrite = canAddEngTask(session?.user?.roles);

  const [rows, setRows] = useState<Facility[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Facility | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (opts?: { force?: boolean; signal?: AbortSignal }) => {
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
      const res = await fetch("/api/facilities", { cache: "no-store", signal: opts?.signal });
      const j = await res.json().catch(() => ({ error: "invalid JSON" }));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      const list: Facility[] = Array.isArray(j.rows) ? j.rows : [];
      if (opts?.signal?.aborted) return;
      setRows(list);
      saveFacilityCache(list);
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
    const isEdit = !!entry.id;
    const snapshot = rows;
    const optimistic: Facility = {
      id: entry.id || `tmp-${Date.now()}`,
      building: entry.building,
      type: entry.type,
      name: entry.name,
      installDate: entry.installDate,
      lastService: entry.lastService,
      status: entry.status,
      note: entry.note,
      creator: "",
      createdAt: "",
      intervalDays: entry.intervalDays,
    };
    setRows((prev) => {
      if (!prev) return prev;
      if (isEdit) {
        return prev.map((r) => (r.id === entry.id ? { ...r, ...optimistic, id: r.id, creator: r.creator, createdAt: r.createdAt } : r));
      }
      return [...prev, optimistic];
    });
    if (isEdit) setEditTarget(null); else setAddOpen(false);

    try {
      const action = isEdit ? "update" : "add";
      const res = await fetch("/api/facilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...entry }),
      });
      const j = await res.json().catch(() => ({ ok: false, error: "invalid JSON" }));
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      invalidateFacilityCache();
      bustCachedFetch("/api/facilities");
      await load({ force: true });
    } catch (e) {
      setRows(snapshot);
      setErr(e instanceof Error ? e.message : "Network error");
      if (isEdit) setEditTarget(optimistic); else setAddOpen(true);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMarkRepaired(f: Facility) {
    if (!canWrite) return;
    const today = bangkokTodayYmd();
    setSubmitting(true);
    setErr(null);
    const snapshot = rows;
    setRows((prev) =>
      prev ? prev.map((r) =>
        r.id === f.id ? { ...r, status: "ใช้งานได้", lastService: today } : r
      ) : prev
    );
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
      bustCachedFetch("/api/facilities");
      await load({ force: true });
    } catch (e) {
      setRows(snapshot);
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  /** บันทึกว่าทำรอบบำรุงแล้ววันนี้ — จุดที่เคยต้องเปิดแก้ไขแล้วพิมพ์วันเอง. */
  async function handleMarkServiced(f: Facility) {
    if (!canWrite) return;
    const today = bangkokTodayYmd();
    setSubmitting(true);
    setErr(null);
    const snapshot = rows;
    setRows((prev) =>
      prev ? prev.map((r) => (r.id === f.id ? { ...r, lastService: today } : r)) : prev
    );
    try {
      const res = await fetch("/api/facilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: f.id, lastService: today }),
      });
      const j = await res.json().catch(() => ({ ok: false, error: "invalid JSON" }));
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      invalidateFacilityCache();
      bustCachedFetch("/api/facilities");
      await load({ force: true });
    } catch (e) {
      setRows(snapshot);
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  /** รายการถึง/ใกล้ถึงรอบ — โผล่เป็นมุมด่วนบนสุด (เลยกำหนดก่อน). */
  const dueList = useMemo(() => {
    return filtered
      .filter((f) => {
        if (f.status === "ปิดใช้งาน") return false;
        const m = getMaintenanceStatus(f);
        return m === "overdue" || m === "due-soon";
      })
      .sort((a, b) => (daysUntilService(a) ?? 0) - (daysUntilService(b) ?? 0));
  }, [filtered]);

  // Summary counts (respect active building filter)
  const counts = useMemo(() => {
    let working = 0, repair = 0;
    for (const f of filtered) {
      if (f.status === "ใช้งานได้") working++;
      else if (f.status === "ต้องซ่อม" || f.status === "กำลังซ่อม") repair++;
    }
    return { working, repair, total: filtered.length };
  }, [filtered]);

  return (
    <div className="ac-facilities">
      {/* Shared status tokens (audit r8 #10) — the tiles previously
          hardcoded hex and drifted from FACILITY_STATUS_COLOR. */}
      <div className="ac-maintenance-summary">
        <div className="ac-maint-stat" style={{ borderColor: FACILITY_STATUS_COLOR["ใช้งานได้"] }}>
          <div className="ac-maint-stat-num" style={{ color: FACILITY_STATUS_COLOR["ใช้งานได้"] }}>{counts.working}</div>
          <div className="ac-maint-stat-label">ใช้งานได้</div>
        </div>
        <div className="ac-maint-stat" style={{ borderColor: FACILITY_STATUS_COLOR["ต้องซ่อม"] }}>
          <div className="ac-maint-stat-num" style={{ color: FACILITY_STATUS_COLOR["ต้องซ่อม"] }}>{counts.repair}</div>
          <div className="ac-maint-stat-label">ต้อง/กำลังซ่อม</div>
        </div>
        <div className="ac-maint-stat" style={{ borderColor: dueList.length ? "#D97706" : "var(--color-border)" }}>
          <div className="ac-maint-stat-num" style={{ color: dueList.length ? "#D97706" : "var(--color-text-faint)" }}>{dueList.length}</div>
          <div className="ac-maint-stat-label">🔔 ถึงรอบบำรุง</div>
        </div>
        <div className="ac-maint-stat" style={{ borderColor: "var(--color-text-faint)" }}>
          <div className="ac-maint-stat-num" style={{ color: "var(--color-text-faint)" }}>{counts.total}</div>
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
        <div className="ac-facilities-head-actions">
          <button
            type="button"
            className="ac-btn ac-btn-ghost ac-btn-sm"
            onClick={() => {
              if (filtered.length === 0) return;
              const today = bangkokTodayYmd();
              const tag = activeBuilding === "ทั้งหมด" ? "ทั้งหมด" : activeBuilding;
              exportCsv(
                `สาธารณูปโภค_${tag}_${today}.csv`,
                filtered,
                [
                  { header: "ตึก",          value: (f: Facility) => f.building },
                  { header: "ประเภท",       value: (f: Facility) => f.type },
                  { header: "ชื่อ/รุ่น",     value: (f: Facility) => f.name },
                  { header: "วันติดตั้ง",    value: (f: Facility) => f.installDate },
                  { header: "วันบริการล่าสุด",  value: (f: Facility) => f.lastService },
                  { header: "สถานะ",        value: (f: Facility) => f.status },
                  { header: "รอบบำรุง(วัน)",  value: (f: Facility) => f.intervalDays || "" },
                  { header: "หมายเหตุ",     value: (f: Facility) => f.note },
                  { header: "ผู้บันทึก",     value: (f: Facility) => f.creator },
                  { header: "วันที่บันทึก",   value: (f: Facility) => f.createdAt },
                ],
              );
            }}
            disabled={!rows || filtered.length === 0}
            title={filtered.length === 0 ? "ไม่มีข้อมูลให้ดาวน์โหลด" : `ดาวน์โหลด ${filtered.length} รายการ`}
          >⬇ CSV</button>
          {canWrite && (
            <button className="ac-btn ac-btn-primary ac-btn-sm" onClick={() => setAddOpen(true)}>
              + เพิ่ม
            </button>
          )}
        </div>
      </div>

      <ErrorBanner message={err} onRetry={() => void load()} onDismiss={() => setErr(null)} />

      {loading && !rows && (
        <LoadingState label="กำลังโหลดสาธารณูปโภค..." />
      )}

      {!loading && rows && filtered.length === 0 && (
        <EmptyState
          icon="facility"
          title="ยังไม่มีสาธารณูปโภคในตึกนี้"
          description={
            canWrite
              ? "เริ่มต้นด้วยการเพิ่มรอบล้างแอร์ รอบล้างเครื่องซักผ้า ปั๊มน้ำ หรือรายการส่วนกลางอื่น เพื่อจัดรอบบำรุงรักษาและติดตามสถานะใช้งาน"
              : "ยังไม่มีข้อมูลสาธารณูปโภคในตึกนี้ — ติดต่อทีมจัดการเพื่อเพิ่มข้อมูล"
          }
          action={canWrite ? { label: "+ เพิ่มสาธารณูปโภค", onClick: () => setAddOpen(true) } : undefined}
        />
      )}

      {dueList.length > 0 && (
        <section className="ac-fac-due" aria-label="ถึงรอบบำรุง">
          <h3 className="ac-fac-due-head">🔔 ถึงรอบบำรุง <span>({dueList.length})</span></h3>
          <ul className="ac-fac-due-list">
            {dueList.map((f) => {
              const days = daysUntilService(f);
              const overdue = days !== null && days < 0;
              return (
                <li key={`due-${f.id}`} className={`ac-fac-due-row ${overdue ? "is-overdue" : ""}`}>
                  <span className="ac-fac-due-icon" aria-hidden>{FACILITY_TYPE_ICON[f.type] || "🏢"}</span>
                  <span className="ac-fac-due-main">
                    <span className="ac-fac-due-title">
                      <b>{f.building}</b> · {f.type}{f.name ? ` ${f.name}` : ""}
                    </span>
                    <span className="ac-fac-due-sub">
                      รอบทุก {f.intervalDays} วัน · ทำล่าสุด {f.lastService ? formatDateLabel(f.lastService) : "—"}
                    </span>
                  </span>
                  <span className={`ac-fac-due-count ${overdue ? "is-overdue" : ""}`}>
                    {days === null ? "" : overdue ? `เลย ${Math.abs(days)} วัน` : days === 0 ? "วันนี้" : `อีก ${days} วัน`}
                  </span>
                  {canWrite && (f.status === "ต้องซ่อม" || f.status === "กำลังซ่อม" ? (
                    <button
                      className="ac-btn ac-btn-primary ac-btn-sm ac-fac-done-btn"
                      onClick={() => handleMarkRepaired(f)}
                      disabled={submitting}
                      title="ตั้งสถานะเป็น 'ใช้งานได้' + วันบริการล่าสุด = วันนี้"
                    >✓ ซ่อมแล้ว</button>
                  ) : (
                    <button
                      className="ac-btn ac-btn-primary ac-btn-sm ac-fac-done-btn"
                      onClick={() => handleMarkServiced(f)}
                      disabled={submitting}
                      title="บันทึกวันบริการล่าสุด = วันนี้ (เริ่มนับรอบใหม่)"
                    >✓ ทำแล้ววันนี้</button>
                  ))}
                </li>
              );
            })}
          </ul>
        </section>
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
                        {(f.intervalDays || 0) > 0 && (
                          <>
                            {(f.installDate || f.lastService) && <span> · </span>}
                            <span>
                              รอบทุก {f.intervalDays} วัน
                              {(f.intervalDays || 0) >= 28 ? ` (≈ ${Math.round((f.intervalDays || 0) / 30)} เดือน)` : ""}
                            </span>
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
                        {!needsRepair && (m === "overdue" || m === "due-soon") && (
                          <button
                            className="ac-btn ac-btn-primary ac-btn-sm"
                            onClick={() => handleMarkServiced(f)}
                            disabled={submitting}
                            title="บันทึกวันบริการล่าสุด = วันนี้ (เริ่มนับรอบใหม่)"
                          >✓ ทำแล้ววันนี้</button>
                        )}
                        <button
                          className="ac-btn ac-btn-ghost ac-btn-sm"
                          onClick={() => onScheduleService(f.building, formatCommonArea(f.name ? `${f.type} ${f.name}` : f.type), taskNote)}
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
        key={editTarget?.id ?? "edit"}
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
