"use client";

import { useMemo, useState } from "react";
import type { RoomView } from "@/types";
import { Icon } from "@/lib/icons";
import { SALES_STATUS_META, toSalesStatus, type SalesStatus } from "@/lib/salesTheme";
import {
  applyBoardFilter, distinctFloors, countByStatus, type BoardFilter,
} from "@/lib/salesData";
import CardView from "./CardView";
import GridBoard from "./GridBoard";
import styles from "./sales.module.css";

export type ViewMode = "card" | "grid";

interface Props {
  /** Rooms already scoped to the active building (all statuses). */
  rooms: RoomView[];
  viewMode: ViewMode;
  onChangeViewMode: (v: ViewMode) => void;
  onSelect: (r: RoomView) => void;
}

/** Status chips shown in the filter row (occupied is governed by the
 *  separate toggle, not a chip). */
const FILTER_STATUSES: SalesStatus[] = ["available", "pending", "moveout"];

export default function RoomBoard({ rooms, viewMode, onChangeViewMode, onSelect }: Props) {
  const [statuses, setStatuses] = useState<Set<SalesStatus>>(new Set());
  const [floor, setFloor] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showOccupied, setShowOccupied] = useState(false);

  const floors = useMemo(() => distinctFloors(rooms), [rooms]);
  const occupiedCount = useMemo(() => countByStatus(rooms, "occupied"), [rooms]);
  const statusCounts = useMemo(() => {
    const c: Record<SalesStatus, number> = { available: 0, pending: 0, moveout: 0, occupied: 0 };
    for (const r of rooms) c[toSalesStatus(r.status)]++;
    return c;
  }, [rooms]);

  const filter: BoardFilter = { statuses, floor, search, showOccupied };
  const filtered = useMemo(() => applyBoardFilter(rooms, filter), [rooms, statuses, floor, search, showOccupied]);
  const vacantShown = useMemo(() => countByStatus(filtered, "available"), [filtered]);

  function toggleStatus(s: SalesStatus) {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }

  return (
    <div className={styles.board}>
      {/* Header: title + count + view toggle */}
      <div className={styles.boardHead}>
        <div className={styles.boardTitleWrap}>
          <h3 className={styles.boardTitle}>ห้องว่าง &amp; สถานะ</h3>
          <span className={styles.boardCount}>
            แสดง <b>{filtered.length}</b> ห้อง · ว่าง <b>{vacantShown}</b>
          </span>
        </div>
        <div className={styles.viewToggle} role="tablist" aria-label="สลับมุมมอง">
          <button
            role="tab"
            aria-selected={viewMode === "card"}
            className={`${styles.viewBtn} ${viewMode === "card" ? styles.active : ""}`}
            onClick={() => onChangeViewMode("card")}
          >
            <Icon name="grid" size={15} /> การ์ด
          </button>
          <button
            role="tab"
            aria-selected={viewMode === "grid"}
            className={`${styles.viewBtn} ${viewMode === "grid" ? styles.active : ""}`}
            onClick={() => onChangeViewMode("grid")}
          >
            <Icon name="table" size={15} /> ตาราง
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.chipGroup}>
          {FILTER_STATUSES.map((s) => {
            const m = SALES_STATUS_META[s];
            const on = statuses.has(s);
            return (
              <button
                key={s}
                className={`${styles.chip} ${on ? styles.on : ""}`}
                style={{ "--st-base": m.base, "--st-tint": m.tint, "--st-border": m.border } as React.CSSProperties}
                onClick={() => toggleStatus(s)}
                aria-pressed={on}
              >
                <span className={styles.chipDot} />
                {m.label}
                <span className={styles.chipNum}>{statusCounts[s]}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.floorGroup}>
          <button
            className={`${styles.floorBtn} ${floor === "all" ? styles.active : ""}`}
            onClick={() => setFloor("all")}
          >
            ทั้งหมด
          </button>
          {floors.map((f) => (
            <button
              key={f}
              className={`${styles.floorBtn} ${floor === f ? styles.active : ""}`}
              onClick={() => setFloor(f)}
            >
              {f === "—" ? "—" : f}
            </button>
          ))}
        </div>

        <label className={styles.toggleOcc}>
          <input
            type="checkbox"
            checked={showOccupied}
            onChange={(e) => setShowOccupied(e.target.checked)}
          />
          <span className={styles.switch} />
          แสดงห้องที่มีผู้เช่าด้วย ({occupiedCount} ห้อง)
        </label>

        <div className={styles.searchWrap}>
          <Icon name="search" size={15} />
          <input
            className={styles.search}
            type="search"
            placeholder="ค้นหาเลขห้อง หรือชื่อลูกค้า"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="ค้นหาห้อง"
          />
        </div>
      </div>

      {/* View */}
      {viewMode === "card"
        ? <CardView rooms={filtered} onSelect={onSelect} />
        : <GridBoard rooms={filtered} onSelect={onSelect} />}
    </div>
  );
}
