"use client";

import { useMemo, useRef, useState } from "react";
import type { RoomView, SheetRow, RoomStatus } from "@/types";
import { usePersistedString } from "@/lib/usePersistedString";
import {
  scopeRooms, buildAppointments, buildKpis, buildOccupancyByBuilding,
  buildAppointmentsTrend,
} from "@/lib/salesData";
import KpiRow from "./KpiRow";
import OccupancyStrip from "./OccupancyStrip";
import RoomBoard, { type ViewMode } from "./RoomBoard";
import AppointmentsRail from "./AppointmentsRail";
import RoomDetailDrawer from "./RoomDetailDrawer";
import Legend from "./Legend";
import styles from "./sales.module.css";

interface Props {
  rooms: RoomView[];
  tasks: SheetRow[];
  activeBuilding: string;
  /** Opens the app's full RoomModal (edit/equipment/history). */
  onSelectRoom: (r: RoomView) => void;
  onQuickAddLead: () => void;
  /** Jump to a sidebar status view (KPI cards). */
  onChangeView?: (v: RoomStatus) => void;
  /** Filter to a building (syncs the topbar tab). Used by the occupancy
   *  strip — clicking a building card here moves the shared filter. */
  onChangeBuilding?: (b: string) => void;
  /** "อัปเดต …" timestamp for the subtitle. */
  lastUpdated?: string;
}

const isViewMode = (v: string): v is ViewMode => v === "card" || v === "grid";

/**
 * ภาพรวมขาย v2 — deep-navy sales dashboard.
 *
 * Self-contained presentation: scopes by the active building, derives
 * KPIs + appointments, and renders the KPI row, room board (card/grid),
 * and appointments rail. A lightweight detail drawer opens on room click;
 * "เปิดรายละเอียดเต็ม" forwards to the app's existing RoomModal so no
 * edit/equipment functionality is lost.
 */
export default function SalesPipelineV2({
  rooms, tasks, activeBuilding, onSelectRoom, onChangeView, onChangeBuilding, lastUpdated,
}: Props) {
  const [viewModeRaw, setViewMode] = usePersistedString("salesViewMode", "card", isViewMode);
  const viewMode: ViewMode = isViewMode(viewModeRaw) ? viewModeRaw : "card";
  const [selected, setSelected] = useState<RoomView | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  const scopedRooms = useMemo(() => scopeRooms(rooms, activeBuilding), [rooms, activeBuilding]);
  const appointments = useMemo(() => buildAppointments(tasks, activeBuilding), [tasks, activeBuilding]);
  const kpis = useMemo(() => buildKpis(scopedRooms, appointments), [scopedRooms, appointments]);
  // Real backwards-looking trend for the appointments KPI only — room
  // status counts need daily snapshots we don't have, so those three
  // cards stay on the placeholder until a snapshot endpoint exists.
  const apptTrend = useMemo(() => buildAppointmentsTrend(tasks, activeBuilding), [tasks, activeBuilding]);
  // Occupancy strip always lists every building (so a user can switch
  // away from the current filter), so it reads from the full room list.
  const occupancy = useMemo(() => buildOccupancyByBuilding(rooms), [rooms]);
  const selectedBuilding = activeBuilding === "ทั้งหมด" ? null : activeBuilding;

  function toggleBuilding(b: string) {
    // Clicking the already-active building clears the filter.
    onChangeBuilding?.(b === activeBuilding ? "ทั้งหมด" : b);
  }

  function selectByRoom(building: string, room: string) {
    const r = rooms.find((x) => x.building === building && x.room === room);
    if (r) setSelected(r);
  }

  function openFull(r: RoomView) {
    setSelected(null);
    onSelectRoom(r);
  }

  return (
    <div className={styles.root}>
      {/* Section 1 — heading + legend */}
      <header className={styles.head}>
        <div className={styles.titleWrap}>
          <h2 className={styles.title}>ภาพรวมขาย</h2>
          <span className={styles.subtitle}>
            สถานะห้องและงานขายทั้ง 5 ตึก{lastUpdated ? ` · อัปเดต ${lastUpdated}` : ""}
          </span>
        </div>
        <Legend />
      </header>

      {/* Section 2 — KPI row */}
      <KpiRow
        kpis={kpis}
        trends={{ appointments: apptTrend }}
        onAvailable={onChangeView ? () => onChangeView("ready") : undefined}
        onPending={onChangeView ? () => onChangeView("pending") : undefined}
        onMoveout={onChangeView ? () => onChangeView("moveout") : undefined}
        onAppointments={() => railRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
      />

      {/* Occupancy strip — per-building, click to filter (only when the
          parent wired onChangeBuilding; harmless no-op otherwise). */}
      {onChangeBuilding && (
        <OccupancyStrip
          buildings={occupancy}
          selected={selectedBuilding}
          onSelect={toggleBuilding}
        />
      )}

      {/* Sections 3 + 4 — board + appointments rail */}
      <div className={styles.split}>
        <RoomBoard
          rooms={scopedRooms}
          viewMode={viewMode}
          onChangeViewMode={setViewMode}
          onSelect={setSelected}
        />
        <AppointmentsRail
          ref={railRef}
          appointments={appointments}
          onSelectRoom={selectByRoom}
        />
      </div>

      {selected && (
        <RoomDetailDrawer
          room={selected}
          onClose={() => setSelected(null)}
          onOpenFull={openFull}
        />
      )}
    </div>
  );
}
