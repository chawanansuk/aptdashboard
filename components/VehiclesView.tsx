"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { Vehicle } from "@/types";
import type { RoomChoice } from "./AddVehicleModal";
import { canPerform } from "@/lib/permissions";
import { Icon } from "@/lib/icons";
import { exportCsv } from "@/lib/csvExport";
import { getCachedView, setCachedView, bustView } from "@/lib/viewCache";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import AddVehicleModal from "./AddVehicleModal";
import EmptyState from "./EmptyState";
import LoadingState from "./LoadingState";
import ErrorBanner from "./ErrorBanner";

/**
 * Vehicles per room (v3.13.0).
 *
 * Flat list with search + building filter + CSV export. Vehicles
 * link to a room via {building, room} — multiple vehicles per room
 * are supported. Delete is confirm-then-act (no soft-delete; the
 * sheet row goes away).
 */

interface Props {
  buildings: string[];
  activeBuilding: string;
  rooms: RoomChoice[];
}

type SortKey = "location" | "plate" | "model" | "color" | "updated";

// Single key — the view fetches all vehicles and filters client-side.
const VEHICLES_CACHE_KEY = "vehicles";

/** Numeric-aware compare so "ห้อง 2" sorts before "ห้อง 10". */
function naturalCompare(a: string, b: string): number {
  return (a || "").localeCompare(b || "", undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Sortable column header — click cycles asc → desc → off. Visual cue
 * (▲/▼/▾) shows the current direction so users don't have to remember
 * what they clicked last. aria-sort makes the same info available to
 * screen readers.
 */
function SortableTh({
  label, sortKey, sort, onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" } | null;
  onSort: (key: SortKey) => void;
}) {
  const isActive = sort?.key === sortKey;
  const arrow = !isActive ? "▾" : sort.dir === "asc" ? "▲" : "▼";
  const ariaSort = !isActive ? "none" : sort.dir === "asc" ? "ascending" : "descending";
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`ac-vehicles-th-sortable ${isActive ? "is-active" : ""}`}
    >
      <button
        type="button"
        className="ac-vehicles-th-sort-btn"
        onClick={() => onSort(sortKey)}
        title={`เรียงตาม${label}`}
      >
        <span>{label}</span>
        <span className="ac-vehicles-th-sort-arrow" aria-hidden>{arrow}</span>
      </button>
    </th>
  );
}

function compareVehicles(a: Vehicle, b: Vehicle, key: SortKey): number {
  switch (key) {
    case "location":
      // Building first, then numeric room.
      return naturalCompare(a.building, b.building) || naturalCompare(a.room, b.room);
    case "plate": return naturalCompare(a.plate, b.plate);
    case "model": return naturalCompare(a.model, b.model);
    case "color": return naturalCompare(a.color, b.color);
    case "updated": {
      // Empty/unknown timestamps sort last in asc, first in desc — handled
      // by the caller's reverse(). The strings are "yyyy-MM-dd HH:mm" so
      // lexical compare is chronological.
      const av = a.updatedAt || a.createdAt || "";
      const bv = b.updatedAt || b.createdAt || "";
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return av.localeCompare(bv);
    }
  }
}

export default function VehiclesView({ activeBuilding, rooms }: Props) {
  const { data: session } = useSession();
  const canWrite = canPerform(session?.user?.roles, "vehicle.edit");

  const [rows, setRows] = useState<Vehicle[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Vehicle | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  // Sortable columns (Problem #11). null = original API order; we keep
  // a tri-state per column-click cycle: asc → desc → off.
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    // SWR: paint the last result instantly if it's still fresh, then
    // revalidate in the background. A cold/expired cache shows the
    // spinner as before. See lib/viewCache.
    const cached = getCachedView<Vehicle[]>(VEHICLES_CACHE_KEY);
    if (cached) {
      setRows(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setErr(null);
    try {
      const res = await fetch("/api/vehicles", { cache: "no-store", signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const list: Vehicle[] = data.rows || [];
      setRows(list);
      setCachedView(VEHICLES_CACHE_KEY, list);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      // Only surface the error when there's nothing cached to show — a
      // failed background revalidate shouldn't blank out good rows.
      if (!cached) setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal);
    return () => ac.abort();
  }, [load]);

  async function remove(v: Vehicle) {
    if (!confirm(`ลบยานพาหนะ "${v.plate}" ของห้อง ${v.room}?\n\nการลบนี้ไม่สามารถย้อนกลับได้`)) return;
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
      bustView(VEHICLES_CACHE_KEY); // keep the next mount from serving the deleted row
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

  const filtered = useMemo(() => {
    const list = rows || [];
    const q = debouncedSearch.trim().toLowerCase();
    const out = list.filter((v) => {
      if (activeBuilding !== "ทั้งหมด" && v.building !== activeBuilding) return false;
      if (q) {
        const hay = `${v.plate} ${v.model} ${v.color} ${v.room} ${v.note}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (!sort) return out;
    const sorted = [...out].sort((a, b) => compareVehicles(a, b, sort.key));
    return sort.dir === "desc" ? sorted.reverse() : sorted;
  }, [rows, debouncedSearch, activeBuilding, sort]);

  function onClickSort(key: SortKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null; // third click cycles back to default order
    });
  }

  function handleExport() {
    if (filtered.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const tag = activeBuilding === "ทั้งหมด" ? "ทั้งหมด" : activeBuilding;
    exportCsv(
      `ยานพาหนะ_${tag}_${today}.csv`,
      filtered,
      [
        { header: "ตึก",        value: (v: Vehicle) => v.building },
        { header: "ห้อง",       value: (v: Vehicle) => v.room },
        { header: "ทะเบียน",    value: (v: Vehicle) => v.plate },
        { header: "ยี่ห้อ/รุ่น", value: (v: Vehicle) => v.model },
        { header: "สี",         value: (v: Vehicle) => v.color },
        { header: "หมายเหตุ",   value: (v: Vehicle) => v.note },
        { header: "ผู้บันทึก",   value: (v: Vehicle) => v.creator },
        { header: "วันที่บันทึก",  value: (v: Vehicle) => v.createdAt },
        { header: "วันที่ปรับปรุง", value: (v: Vehicle) => v.updatedAt },
      ],
    );
  }

  return (
    <section className="ac-vehicles" aria-label="ยานพาหนะ">
      <header className="ac-vehicles-head">
        <div>
          <h1 className="ac-vehicles-title">
            <Icon name="vehicle" size={22} />
            <span>ยานพาหนะ</span>
            {rows && <span className="ac-vehicles-count">({rows.length})</span>}
          </h1>
        </div>
        <div className="ac-vehicles-actions">
          <button
            type="button"
            className="ac-btn ac-btn-ghost"
            onClick={handleExport}
            disabled={!rows || filtered.length === 0}
            title={filtered.length === 0 ? "ไม่มีข้อมูลให้ดาวน์โหลด" : `ดาวน์โหลด ${filtered.length} รายการ`}
          >
            ⬇ ดาวน์โหลด CSV
          </button>
          {canWrite && (
            <button
              type="button"
              className="ac-btn ac-btn-primary"
              onClick={() => setAddOpen(true)}
            >
              <Icon name="add" size={16} /> เพิ่ม
            </button>
          )}
        </div>
      </header>

      <div className="ac-vehicles-toolbar">
        <input
          type="search"
          className="ac-vehicles-search"
          placeholder="ค้นหาทะเบียน / ห้อง / ยี่ห้อ / สี / หมายเหตุ"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="ค้นหายานพาหนะ"
        />
        {activeBuilding !== "ทั้งหมด" && (
          <span className="ac-vehicles-active-building">ตึก {activeBuilding}</span>
        )}
      </div>

      <ErrorBanner message={err} onRetry={() => load()} onDismiss={() => setErr(null)} />

      {loading && !rows ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="equipment"
          title={rows && rows.length === 0 ? "ยังไม่มียานพาหนะในระบบ" : "ไม่พบรายการตามที่ค้นหา"}
          description={
            rows && rows.length === 0
              ? "เพิ่มยานพาหนะของผู้เช่าเพื่อบันทึกไว้"
              : "ลองเปลี่ยนคำค้นหรือตึกที่เลือก"
          }
          action={
            canWrite && rows && rows.length === 0
              ? { label: "+ เพิ่มคันแรก", onClick: () => setAddOpen(true) }
              : undefined
          }
        />
      ) : (
        <div className="ac-vehicles-table-wrap">
          <table className="ac-vehicles-table">
            <thead>
              <tr>
                <SortableTh label="ตึก/ห้อง" sortKey="location" sort={sort} onSort={onClickSort} />
                <SortableTh label="ทะเบียน" sortKey="plate" sort={sort} onSort={onClickSort} />
                <SortableTh label="ยี่ห้อ/รุ่น" sortKey="model" sort={sort} onSort={onClickSort} />
                <SortableTh label="สี" sortKey="color" sort={sort} onSort={onClickSort} />
                <th scope="col">หมายเหตุ</th>
                <SortableTh label="อัปเดต" sortKey="updated" sort={sort} onSort={onClickSort} />
                {canWrite && <th scope="col" className="ac-vehicles-th-actions">จัดการ</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => {
                const busy = busyIds.has(v.id);
                return (
                  <tr key={v.id}>
                    <td>
                      <div className="ac-vehicles-room">
                        <span className="ac-vehicles-building">{v.building}</span>
                        <span className="ac-vehicles-room-num">ห้อง {v.room}</span>
                      </div>
                    </td>
                    <td className="ac-vehicles-plate">{v.plate}</td>
                    <td>{v.model || "—"}</td>
                    <td>{v.color || "—"}</td>
                    <td className="ac-vehicles-note">{v.note || "—"}</td>
                    <td>
                      <span className="ac-vehicles-time" title={v.updatedAt || v.createdAt}>
                        {(v.updatedAt || v.createdAt || "—").split(" ")[0]}
                      </span>
                    </td>
                    {canWrite && (
                      <td>
                        <div className="ac-vehicles-row-actions">
                          <button
                            type="button"
                            className="ac-btn ac-btn-ghost ac-btn-sm"
                            onClick={() => setEditTarget(v)}
                            disabled={busy}
                          >แก้ไข</button>
                          <button
                            type="button"
                            className="ac-btn ac-btn-ghost ac-btn-sm ac-vehicles-row-delete"
                            onClick={() => remove(v)}
                            disabled={busy}
                            aria-label={`ลบยานพาหนะ ${v.plate}`}
                            title={`ลบยานพาหนะ ${v.plate}`}
                          >🗑</button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AddVehicleModal
        open={addOpen}
        rooms={rooms}
        prefillRoom={activeBuilding !== "ทั้งหมด" ? { building: activeBuilding, room: "" } : null}
        onClose={() => setAddOpen(false)}
        onSaved={() => { bustView(VEHICLES_CACHE_KEY); load(); }}
      />
      <AddVehicleModal
        open={!!editTarget}
        initial={editTarget}
        rooms={rooms}
        onClose={() => setEditTarget(null)}
        onSaved={() => { bustView(VEHICLES_CACHE_KEY); load(); }}
      />
    </section>
  );
}
