"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { Vehicle } from "@/types";
import { canPerform } from "@/lib/permissions";
import EmptyState from "./EmptyState";
import LoadingState from "./LoadingState";
import AddVehicleModal from "./AddVehicleModal";

/**
 * Vehicles tab inside RoomModal — lists vehicles linked to one
 * specific room. Reuses the global /api/vehicles endpoint and
 * filters client-side (rows are small per room, network overhead
 * trivial; lets us refresh once when AddVehicleModal saves).
 *
 * Add/Edit modal pre-fills + locks {building, room} so the user
 * can't accidentally re-assign a vehicle to a different room from
 * this context (use the global "ยานพาหนะ" page for that).
 */

interface Props {
  building: string;
  room: string;
}

export default function RoomVehiclesTab({ building, room }: Props) {
  const { data: session } = useSession();
  const canWrite = canPerform(session?.user?.roles, "vehicle.edit");

  const [rows, setRows] = useState<Vehicle[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Vehicle | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/vehicles", { cache: "no-store", signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setRows(data.rows || []);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal);
    return () => ac.abort();
  }, [load]);

  const forThisRoom = useMemo(
    () => (rows || []).filter((v) => v.building === building && v.room === room),
    [rows, building, room],
  );

  async function remove(v: Vehicle) {
    if (!confirm(`ลบยานพาหนะ "${v.plate}"?\n\nการลบนี้ไม่สามารถย้อนกลับได้`)) return;
    setBusyIds((s) => new Set(s).add(v.id));
    try {
      const res = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: v.id }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "invalid JSON" }));
      if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRows((prev) => (prev || []).filter((r) => r.id !== v.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setBusyIds((s) => {
        const next = new Set(s);
        next.delete(v.id);
        return next;
      });
    }
  }

  // Static room list for the modal (always just this one room — the
  // modal locks building+room when prefillRoom has both)
  const thisRoomList = useMemo(
    () => [{ building, room }],
    [building, room],
  );

  return (
    <div className="ac-room-vehicles">
      <header className="ac-room-vehicles-head">
        <span className="ac-room-vehicles-count">
          {forThisRoom.length > 0
            ? `${forThisRoom.length} คัน`
            : "ยังไม่มีบันทึก"}
        </span>
        {canWrite && (
          <button
            type="button"
            className="ac-btn ac-btn-primary ac-btn-sm"
            onClick={() => setAddOpen(true)}
          >+ เพิ่ม</button>
        )}
      </header>

      {err && (
        <div className="ac-banner ac-banner-warn" role="alert">
          <strong>⚠ </strong>{err}{" "}
          <button className="ac-btn ac-btn-ghost ac-btn-sm" onClick={() => setErr(null)}>ปิด</button>
        </div>
      )}

      {loading && !rows ? (
        <LoadingState />
      ) : forThisRoom.length === 0 ? (
        <EmptyState
          icon="equipment"
          title="ห้องนี้ยังไม่มียานพาหนะ"
          description="เพิ่มมอเตอร์ไซค์/รถของผู้เช่าเพื่อบันทึกไว้"
          action={
            canWrite
              ? { label: "+ เพิ่มคันแรก", onClick: () => setAddOpen(true) }
              : undefined
          }
          compact
        />
      ) : (
        <ul className="ac-room-vehicles-list">
          {forThisRoom.map((v) => {
            const busy = busyIds.has(v.id);
            return (
              <li key={v.id} className="ac-room-vehicles-item">
                <div className="ac-room-vehicles-main">
                  <div className="ac-room-vehicles-plate">{v.plate}</div>
                  <div className="ac-room-vehicles-meta">
                    {[v.model, v.color].filter(Boolean).join(" · ") || "—"}
                  </div>
                  {v.note && (
                    <div className="ac-room-vehicles-note">{v.note}</div>
                  )}
                </div>
                {canWrite && (
                  <div className="ac-room-vehicles-actions">
                    <button
                      type="button"
                      className="ac-btn ac-btn-ghost ac-btn-sm"
                      onClick={() => setEditTarget(v)}
                      disabled={busy}
                    >แก้</button>
                    <button
                      type="button"
                      className="ac-btn ac-btn-danger ac-btn-sm"
                      onClick={() => remove(v)}
                      disabled={busy}
                    >ลบ</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AddVehicleModal
        open={addOpen}
        rooms={thisRoomList}
        prefillRoom={{ building, room }}
        onClose={() => setAddOpen(false)}
        onSaved={() => load()}
      />
      <AddVehicleModal
        open={!!editTarget}
        initial={editTarget}
        rooms={thisRoomList}
        onClose={() => setEditTarget(null)}
        onSaved={() => load()}
      />
    </div>
  );
}
