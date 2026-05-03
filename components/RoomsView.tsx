"use client";

import { useMemo } from "react";
import type { RoomStatus, RoomView } from "@/types";
import { STATUS_LABEL, STATUS_DOT, STATUS_KEYS, FILTER_CHIPS } from "@/lib/constants";

interface Stats {
  total: number;
  ready: number;
  moveout: number;
  repair: number;
}

interface Props {
  visibleRooms: RoomView[];
  stats: Stats;
  activeBuilding: string;
  activeFilter: "all" | RoomStatus;
  onChangeFilter: (f: "all" | RoomStatus) => void;
  search: string;
  onChangeSearch: (s: string) => void;
  bulkMode: boolean;
  bulkSelected: Set<string>;
  onToggleBulkMode: () => void;
  onToggleBulkRoom: (building: string, room: string) => void;
  onSelectRoom: (r: RoomView) => void;
}

export default function RoomsView({
  visibleRooms, stats, activeBuilding, activeFilter, onChangeFilter,
  search, onChangeSearch, bulkMode, bulkSelected, onToggleBulkMode, onToggleBulkRoom, onSelectRoom,
}: Props) {
  const floorGroups = useMemo(() => {
    const map = new Map<string, RoomView[]>();
    visibleRooms.forEach((r) => {
      const k = r.floor || "-";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    });
    return Array.from(map.entries())
      .map(([floor, list]) => ({
        floor,
        list: list.sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true })),
      }))
      .sort((a, b) => (a.floor || "").localeCompare(b.floor || "", undefined, { numeric: true }));
  }, [visibleRooms]);

  return (
    <>
      <section className="ac-sg">
        <div className="ac-sc"><div className="ac-si ac-si-indigo">▦</div><div className="ac-sc-body"><div className="ac-sc-label">ทั้งหมด</div><div className="ac-sc-num">{stats.total}</div><div className="ac-sc-sub ac-sub-info">{activeBuilding === "ทั้งหมด" ? "ทุกตึก" : activeBuilding}</div></div></div>
        <div className="ac-sc"><div className="ac-si ac-si-green">✓</div><div className="ac-sc-body"><div className="ac-sc-label">ว่าง / พร้อมขาย</div><div className="ac-sc-num">{stats.ready}</div><div className="ac-sc-sub ac-sub-info">พร้อมเสนอลูกค้า</div></div></div>
        <div className="ac-sc"><div className="ac-si ac-si-orange">↗</div><div className="ac-sc-body"><div className="ac-sc-label">แจ้งย้ายออก</div><div className="ac-sc-num">{stats.moveout}</div><div className="ac-sc-sub ac-sub-urgent">ต้องติดตาม</div></div></div>
        <div className="ac-sc"><div className="ac-si ac-si-red">⚒</div><div className="ac-sc-body"><div className="ac-sc-label">ซ่อม / QC</div><div className="ac-sc-num">{stats.repair}</div><div className="ac-sc-sub ac-sub-urgent">รอดำเนินการ</div></div></div>
      </section>

      <section className="ac-fb">
        <div className="ac-chips">
          {FILTER_CHIPS.map((c) => (
            <button key={c.key} className={`ac-chip ${activeFilter === c.key ? "is-active" : ""}`} onClick={() => onChangeFilter(c.key)}>{c.label}</button>
          ))}
        </div>
        <div className="ac-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="text" placeholder="ค้นหา ห้อง / ตึก / ผู้เช่า / เบอร์..." value={search} onChange={(e) => onChangeSearch(e.target.value)} />
        </div>
        <button
          className={`ac-btn ac-btn-sm ${bulkMode ? "ac-btn-primary" : "ac-btn-ghost"}`}
          onClick={onToggleBulkMode}
          title="เลือกหลายห้องพร้อมกัน"
        >{bulkMode ? "✕ ออกจากเลือก" : "☑ เลือกหลาย"}</button>
      </section>

      <section className="ac-legend">
        {STATUS_KEYS.map((s) => (
          <div key={s} className="ac-legend-item">
            <span className="ac-legend-dot" style={{ background: STATUS_DOT[s] }} />
            <span>{STATUS_LABEL[s]}</span>
          </div>
        ))}
        <div className="ac-legend-item"><span className="ac-legend-dot ac-legend-today" /><span>งานวันนี้</span></div>
      </section>

      {floorGroups.map((g) => {
        const counts: Record<RoomStatus, number> = { occupied: 0, ready: 0, pending: 0, moveout: 0, qc: 0, repair: 0, inactive: 0 };
        g.list.forEach((r) => counts[r.status]++);
        return (
          <section key={g.floor} className="ac-fs">
            <header className="ac-fs-head">
              <div className="ac-fs-title">ชั้น {g.floor}</div>
              <div className="ac-fs-stats">
                {(Object.keys(counts) as RoomStatus[]).map((k) => (counts[k] > 0 ? (
                  <span key={k} className="ac-fs-stat">
                    <span className="ac-fs-stat-dot" style={{ background: STATUS_DOT[k] }} />
                    {STATUS_LABEL[k]} {counts[k]}
                  </span>
                ) : null))}
              </div>
            </header>
            <div className="ac-rg">
              {g.list.map((r) => {
                const k = `${r.building}|${r.room}`;
                const checked = bulkSelected.has(k);
                return (
                  <button
                    key={`${r.building}-${r.room}`}
                    className={`ac-rc ac-rc-${r.status} ${bulkMode ? "is-bulk" : ""} ${checked ? "is-checked" : ""}`}
                    onClick={() => bulkMode ? onToggleBulkRoom(r.building, r.room) : onSelectRoom(r)}
                    title={`${r.building} ${r.room} • ${STATUS_LABEL[r.status]}`}
                  >
                    {r.today && <span className="ac-rc-today" />}
                    {bulkMode && <span className="ac-rc-check">{checked ? "✓" : ""}</span>}
                    <span className="ac-rc-num">{r.room}</span>
                    <span className="ac-rc-status">{STATUS_LABEL[r.status]}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
