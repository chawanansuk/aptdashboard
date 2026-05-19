"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { RoomEquipment, EquipmentType, EquipmentStatus } from "@/types";
import {
  EQUIPMENT_TYPES, EQUIPMENT_TYPE_ICON, EQUIPMENT_STATUS_COLOR,
  MAINTENANCE_STATUS_COLOR, MAINTENANCE_STATUS_LABEL,
} from "@/lib/constants";
import {
  computeNextService, getMaintenanceStatus, daysUntilService,
} from "@/lib/maintenanceUtils";
import { canAddEngTask } from "@/lib/permissions";
import EmptyState from "./EmptyState";
import LoadingState from "./LoadingState";
import {
  loadEquipmentCache, saveEquipmentCache, invalidateEquipmentCache,
} from "@/lib/equipmentCache";
import AddEquipmentModal from "./AddEquipmentModal";

interface Props {
  building: string;
  room: string;
}

type FilterKey = "all" | EquipmentType;

function formatDateLabel(s: string): string {
  if (!s) return "—";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export default function RoomEquipmentTab({ building, room }: Props) {
  const { data: session } = useSession();
  const canWrite = canAddEngTask(session?.user?.roles);

  const [rows, setRows] = useState<RoomEquipment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RoomEquipment | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    setErr(null);
    if (!opts?.force) {
      const cached = loadEquipmentCache(building, room);
      if (cached) {
        setRows(cached);
        return;
      }
    }
    setLoading(true);
    try {
      const url = `/api/room-equipment?building=${encodeURIComponent(building)}&room=${encodeURIComponent(room)}`;
      const res = await fetch(url, { cache: "no-store" });
      const j = await res.json().catch(() => ({ error: "invalid JSON" }));
      if (!res.ok) {
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const list: RoomEquipment[] = Array.isArray(j.rows) ? j.rows : [];
      setRows(list);
      saveEquipmentCache(building, room, list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [building, room]);

  useEffect(() => {
    setRows(null);
    load();
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

      {err && <div className="ac-banner ac-banner-warn">{err}</div>}

      {loading && !rows && (
        <LoadingState label="กำลังโหลดอุปกรณ์..." size="compact" />
      )}

      {!loading && rows && filtered.length === 0 && (
        <EmptyState
          icon="tasks"
          title={filter === "all" ? "ยังไม่มีอุปกรณ์ในห้องนี้" : `ไม่มีอุปกรณ์ประเภท "${filter}"`}
          description={filter === "all" && canWrite ? "เริ่มต้นด้วยการเพิ่มแอร์ ตู้เย็น หรือเครื่องซักผ้า" : undefined}
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
    </div>
  );
}
