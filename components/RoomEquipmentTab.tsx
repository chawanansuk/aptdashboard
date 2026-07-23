"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { RoomEquipment, EquipmentType, EquipmentStatus, SheetRow } from "@/types";
import {
  EQUIPMENT_TYPES, EQUIPMENT_TYPE_ICON, EQUIPMENT_STATUS_COLOR,
  MAINTENANCE_STATUS_COLOR, MAINTENANCE_STATUS_LABEL,
} from "@/lib/constants";
import {
  computeNextService, getMaintenanceStatus, daysUntilService, formatDateLabel,
} from "@/lib/maintenanceUtils";
import { canAddEngTask } from "@/lib/permissions";
import EmptyState from "./EmptyState";
import LoadingState from "./LoadingState";
import {
  loadEquipmentCache, saveEquipmentCache, invalidateEquipmentCache,
} from "@/lib/equipmentCache";
import { bustCachedFetch } from "@/lib/cachedFetchJson";
import AddEquipmentModal from "./AddEquipmentModal";

interface Props {
  building: string;
  room: string;
  /** Optional: past tasks for this room (from RoomView.pastTasks).
   *  When supplied, a "ประวัติซ่อม" section lists past ซ่อม tasks
   *  as a proxy for equipment service history. */
  pastTasks?: SheetRow[];
}

type FilterKey = "all" | EquipmentType;

export default function RoomEquipmentTab({ building, room, pastTasks }: Props) {
  const { data: session } = useSession();
  const canWrite = canAddEngTask(session?.user?.roles);

  const [rows, setRows] = useState<RoomEquipment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RoomEquipment | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (opts?: { force?: boolean; signal?: AbortSignal }) => {
    setErr(null);
    if (!opts?.force) {
      const cached = loadEquipmentCache(building, room);
      if (cached) {
        setRows(cached);
        return;
      }
    }
    setLoading(true);
    const url = `/api/room-equipment?building=${encodeURIComponent(building)}&room=${encodeURIComponent(room)}`;
    // Problem #5 — the skeleton used to spin forever when the API hung.
    // Cap each attempt at 8s via an AbortController timer, and try up to
    // RETRIES additional times with exponential backoff for transient
    // network/5xx blips before surfacing the error UI.
    const FETCH_TIMEOUT_MS = 8000;
    const RETRIES = 2;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      const timeoutCtrl = new AbortController();
      const timer = setTimeout(() => timeoutCtrl.abort(), FETCH_TIMEOUT_MS);
      const forwardAbort = () => timeoutCtrl.abort();
      opts?.signal?.addEventListener("abort", forwardAbort);
      try {
        const res = await fetch(url, { cache: "no-store", signal: timeoutCtrl.signal });
        const j = await res.json().catch(() => ({ error: "invalid JSON" }));
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        const list: RoomEquipment[] = Array.isArray(j.rows) ? j.rows : [];
        // Guard against late completion overwriting newer data after the
        // user switched to a different room.
        if (opts?.signal?.aborted) return;
        setRows(list);
        saveEquipmentCache(building, room, list);
        setLoading(false);
        return;
      } catch (e) {
        if (opts?.signal?.aborted) return;
        const isLastAttempt = attempt === RETRIES;
        if (isLastAttempt) {
          // Translate the AbortError we triggered via our timer into a
          // friendlier message — the raw "AbortError" string isn't useful.
          const msg =
            e instanceof Error
              ? (timeoutCtrl.signal.aborted ? "หมดเวลา — เครือข่ายช้าหรือไม่ตอบ" : e.message)
              : "Network error";
          setErr(msg);
          setLoading(false);
          return;
        }
        // Exponential backoff: 1s, 2s before next attempt.
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      } finally {
        clearTimeout(timer);
        opts?.signal?.removeEventListener("abort", forwardAbort);
      }
    }
  }, [building, room]);

  useEffect(() => {
    const ctrl = new AbortController();
    setRows(null);
    load({ signal: ctrl.signal });
    return () => ctrl.abort();
  }, [load]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (filter === "all") return rows;
    return rows.filter((r) => r.type === filter);
  }, [rows, filter]);

  async function handleSubmit(entry: {
    id?: string;
    type: EquipmentType;
    brand: string;
    installDate: string;
    lastService: string;
    status: EquipmentStatus;
    note: string;
    intervalDays: number;
  }) {
    setSubmitting(true);
    setErr(null);
    const isEdit = !!entry.id;
    // ----- Optimistic update -----
    const snapshot = rows;
    const optimistic: RoomEquipment = {
      id: entry.id || `tmp-${Date.now()}`,
      building, room,
      type: entry.type,
      brand: entry.brand,
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
      const res = await fetch("/api/room-equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, building, room, ...entry }),
      });
      const j = await res.json().catch(() => ({ ok: false, error: "invalid JSON" }));
      if (!res.ok || !j.ok) {
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      invalidateEquipmentCache(building, room);
      bustCachedFetch("/api/maintenance-plan");
      // Reconcile with canonical data (gets real id, createdAt, creator)
      await load({ force: true });
    } catch (e) {
      // Rollback
      setRows(snapshot);
      setErr(e instanceof Error ? e.message : "Network error");
      if (isEdit) setEditTarget(optimistic); else setAddOpen(true);
    } finally {
      setSubmitting(false);
    }
  }

  /** Quick action: mark this equipment as repaired (status=ปกติ, lastService=today) */
  async function handleMarkRepaired(eq: RoomEquipment) {
    if (!canWrite) return;
    const today = new Date().toISOString().slice(0, 10);
    setSubmitting(true);
    setErr(null);
    // Optimistic
    const snapshot = rows;
    setRows((prev) =>
      prev ? prev.map((r) =>
        r.id === eq.id ? { ...r, status: "ปกติ", lastService: today } : r
      ) : prev
    );
    try {
      const res = await fetch("/api/room-equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          building, room,
          id: eq.id,
          status: "ปกติ",
          lastService: today,
        }),
      });
      const j = await res.json().catch(() => ({ ok: false, error: "invalid JSON" }));
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      invalidateEquipmentCache(building, room);
      bustCachedFetch("/api/maintenance-plan");
      await load({ force: true });
    } catch (e) {
      setRows(snapshot);
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ac-equipment-tab">
      <div className="ac-equipment-toolbar">
        <div className="ac-chips ac-equipment-chips">
          <button
            className={`ac-chip ${filter === "all" ? "is-active" : ""}`}
            onClick={() => setFilter("all")}
          >ทั้งหมด {rows ? `(${rows.length})` : ""}</button>
          {EQUIPMENT_TYPES.map((t) => {
            const count = rows ? rows.filter((r) => r.type === t).length : 0;
            if (count === 0 && filter !== t) return null;
            return (
              <button
                key={t}
                className={`ac-chip ${filter === t ? "is-active" : ""}`}
                onClick={() => setFilter(t)}
              >{EQUIPMENT_TYPE_ICON[t] || ""} {t} ({count})</button>
            );
          })}
        </div>
        {canWrite && (
          <button className="ac-btn ac-btn-primary ac-btn-sm" onClick={() => setAddOpen(true)}>
            + เพิ่ม
          </button>
        )}
      </div>

      {/* Soft banner — heads-up when a refresh failed but we still have
          cached rows to show. The blocking error UI below covers the
          first-load-failed case. */}
      {err && rows && <div className="ac-banner ac-banner-warn">{err}</div>}

      {loading && !rows && (
        <LoadingState label="กำลังโหลดอุปกรณ์..." size="compact" />
      )}

      {/* First-load failure (no rows yet) — replace the dead skeleton
          with an actionable error state + retry. Problem #5. */}
      {!loading && err && !rows && (
        <EmptyState
          icon="equipment"
          tone="warning"
          title="โหลดข้อมูลอุปกรณ์ไม่สำเร็จ"
          description={err}
          action={{ label: "ลองใหม่", onClick: () => void load({ force: true }) }}
        />
      )}

      {!loading && rows && filtered.length === 0 && (
        <EmptyState
          icon={filter === "all" ? "equipment" : "search"}
          tone={filter === "all" ? "neutral" : "warning"}
          title={filter === "all" ? "ยังไม่มีอุปกรณ์ในห้องนี้" : `ไม่มีอุปกรณ์ประเภท "${filter}"`}
          description={
            filter === "all"
              ? (canWrite
                  ? "เพิ่มแอร์ ตู้เย็น เครื่องซักผ้า เครื่องทำน้ำอุ่น เพื่อจัดรอบบำรุงและบันทึกประวัติซ่อม"
                  : "ห้องนี้ยังไม่มีข้อมูลอุปกรณ์ในระบบ")
              : "ลองเลือกประเภทอื่น หรือ \"ทั้งหมด\" เพื่อดูอุปกรณ์ทั้งหมดในห้อง"
          }
          action={filter === "all" && canWrite ? { label: "+ เพิ่มอุปกรณ์", onClick: () => setAddOpen(true) } : undefined}
        />
      )}

      <ul className="ac-equipment-list">
        {filtered.map((eq) => {
          const statusColor = EQUIPMENT_STATUS_COLOR[eq.status] || "#94A3B8";
          const icon = EQUIPMENT_TYPE_ICON[eq.type] || "🔧";
          const needsRepair = eq.status === "ต้องซ่อม" || eq.status === "กำลังซ่อม" || eq.status === "ใช้ไม่ได้";
          return (
            <li key={eq.id} className="ac-equipment-card">
              <div className="ac-equipment-card-icon" aria-hidden="true">{icon}</div>
              <div className="ac-equipment-card-main">
                <div className="ac-equipment-card-line1">
                  <span className="ac-equipment-card-type">{eq.type}</span>
                  <span
                    className="ac-equipment-card-status"
                    style={{ background: statusColor + "22", color: statusColor }}
                  >{eq.status}</span>
                </div>
                {eq.brand && (
                  <div className="ac-equipment-card-brand">{eq.brand}</div>
                )}
                <div className="ac-equipment-card-meta">
                  {eq.installDate && <span>ติดตั้ง {formatDateLabel(eq.installDate)}</span>}
                  {eq.lastService && (
                    <>
                      {eq.installDate && <span> · </span>}
                      <span>ซ่อมล่าสุด {formatDateLabel(eq.lastService)}</span>
                    </>
                  )}
                </div>
                {(() => {
                  const next = computeNextService(eq);
                  if (!next) return null;
                  const m = getMaintenanceStatus(eq);
                  const days = daysUntilService(eq);
                  const color = MAINTENANCE_STATUS_COLOR[m] || "#94A3B8";
                  const tail =
                    days === null ? "" :
                    days < 0 ? ` (เลย ${Math.abs(days)} วัน)` :
                    days === 0 ? " (วันนี้)" :
                    ` (อีก ${days} วัน)`;
                  return (
                    <div className="ac-equipment-card-meta">
                      <span
                        className="ac-equipment-card-status"
                        style={{ background: color + "22", color }}
                      >
                        {MAINTENANCE_STATUS_LABEL[m]} · บำรุงครั้งต่อไป {formatDateLabel(next)}{tail}
                      </span>
                    </div>
                  );
                })()}
                {eq.note && (
                  <div className="ac-equipment-card-note">{eq.note}</div>
                )}
              </div>
              {canWrite && (
                <div className="ac-equipment-card-actions">
                  {needsRepair && (
                    <button
                      className="ac-btn ac-btn-primary ac-btn-sm"
                      onClick={() => handleMarkRepaired(eq)}
                      disabled={submitting}
                      title="ตั้งสถานะเป็น 'ปกติ' + วันซ่อมล่าสุด = วันนี้"
                    >✓ ซ่อมแล้ว</button>
                  )}
                  <button
                    className="ac-btn ac-btn-ghost ac-btn-sm"
                    onClick={() => setEditTarget(eq)}
                    disabled={submitting}
                  >แก้ไข</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <AddEquipmentModal
        open={addOpen}
        building={building}
        room={room}
        submitting={submitting}
        onClose={() => setAddOpen(false)}
        onSubmit={handleSubmit}
      />

      <AddEquipmentModal
        key={editTarget?.id ?? "edit"}
        open={!!editTarget}
        building={building}
        room={room}
        submitting={submitting}
        initial={editTarget ? {
          id: editTarget.id,
          type: editTarget.type,
          brand: editTarget.brand,
          installDate: editTarget.installDate,
          lastService: editTarget.lastService,
          status: editTarget.status,
          note: editTarget.note,
          intervalDays: editTarget.intervalDays || 0,
        } : undefined}
        onClose={() => setEditTarget(null)}
        onSubmit={handleSubmit}
      />

      {/* Service history (Task 30 / C4) — past ซ่อม tasks for this room.
          Proxies "equipment service history" since tasks don't have an
          equipment_id link in the current schema. */}
      {pastTasks && pastTasks.filter((t) => t.type === "ซ่อม").length > 0 && (
        <details className="ac-equipment-history">
          <summary>
            ประวัติซ่อม ({pastTasks.filter((t) => t.type === "ซ่อม").length})
          </summary>
          <ul className="ac-equipment-history-list">
            {/* pastTasks are ALREADY newest-first (useRoomHistory /
                feed buckets both sort desc) — the old .reverse() here
                surfaced the oldest 20 and hid recent repairs (audit r8). */}
            {pastTasks
              .filter((t) => t.type === "ซ่อม")
              .slice(0, 20)
              .map((t, i) => (
                <li key={`${t.date}-${i}`}>
                  <span className="ac-equipment-history-date">{t.date}</span>
                  <span className="ac-equipment-history-status">{t.status || "—"}</span>
                  {t.note && <span className="ac-equipment-history-note">{t.note}</span>}
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
