"use client";

import { useMemo, useState } from "react";
import type { RoomView } from "@/types";
import { parseThaiDate } from "@/lib/dateUtils";

interface Props {
  rooms: RoomView[];
  activeBuilding: string;
  onSelectRoom: (r: RoomView) => void;
}

type SortKey = "tenant" | "building" | "contractEnd" | "daysLeft";
type SortDir = "asc" | "desc";

function daysUntil(s: string): number | null {
  const d = parseThaiDate(s);
  if (!d) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function TenantsView({ rooms, activeBuilding, onSelectRoom }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "expiringSoon" | "expired" | "occupied">("all");
  const [sortKey, setSortKey] = useState<SortKey>("daysLeft");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const tenants = useMemo(() => {
    const scope = activeBuilding === "ทั้งหมด" ? rooms : rooms.filter((r) => r.building === activeBuilding);
    // Only rooms with tenant info
    let list = scope.filter((r) => (r.tenant && r.tenant.trim()) || r.status === "occupied" || r.status === "moveout");

    if (filter === "occupied") list = list.filter((r) => r.status === "occupied" || r.status === "moveout");
    if (filter === "expiringSoon") list = list.filter((r) => {
      const d = daysUntil(r.contractEnd);
      return d !== null && d >= 0 && d <= 30;
    });
    if (filter === "expired") list = list.filter((r) => {
      const d = daysUntil(r.contractEnd);
      return d !== null && d < 0;
    });

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => {
        const hay = `${r.tenant || ""} ${r.phone || ""} ${r.room} ${r.building}`.toLowerCase();
        return hay.includes(q);
      });
    }

    // sort
    list = list.slice().sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "tenant") return (a.tenant || "").localeCompare(b.tenant || "") * dir;
      if (sortKey === "building") return (`${a.building} ${a.room}`).localeCompare(`${b.building} ${b.room}`, undefined, { numeric: true }) * dir;
      if (sortKey === "contractEnd") {
        const da = parseThaiDate(a.contractEnd)?.getTime() ?? Infinity;
        const db = parseThaiDate(b.contractEnd)?.getTime() ?? Infinity;
        return (da - db) * dir;
      }
      if (sortKey === "daysLeft") {
        const da = daysUntil(a.contractEnd) ?? Infinity;
        const db = daysUntil(b.contractEnd) ?? Infinity;
        return (da - db) * dir;
      }
      return 0;
    });

    return list;
  }, [rooms, activeBuilding, search, filter, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  }

  function sortIcon(k: SortKey) {
    if (sortKey !== k) return "↕";
    return sortDir === "asc" ? "▲" : "▼";
  }

  return (
    <div className="ac-tenants">
      <header className="ac-page-head">
        <h2 className="ac-page-title">ผู้เช่า {activeBuilding !== "ทั้งหมด" && `· ${activeBuilding}`}</h2>
        <p className="ac-page-sub">ทั้งหมด {tenants.length} คน</p>
      </header>

      <section className="ac-fb">
        <div className="ac-chips">
          {([
            { k: "all", label: "ทั้งหมด" },
            { k: "occupied", label: "เช่าอยู่" },
            { k: "expiringSoon", label: "สัญญาใกล้หมด (30 วัน)" },
            { k: "expired", label: "สัญญาหมดแล้ว" },
          ] as const).map((c) => (
            <button key={c.k} className={`ac-chip ${filter === c.k ? "is-active" : ""}`} onClick={() => setFilter(c.k)}>{c.label}</button>
          ))}
        </div>
        <div className="ac-search ac-search-full">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="text" placeholder="ค้นหาชื่อ / เบอร์ / ห้อง..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </section>

      <section className="ac-table-wrap ac-tasks">
        <table className="ac-table ac-table-hover">
          <thead>
            <tr>
              <th onClick={() => toggleSort("tenant")} className="sortable">ชื่อผู้เช่า {sortIcon("tenant")}</th>
              <th>เบอร์</th>
              <th onClick={() => toggleSort("building")} className="sortable">ห้อง {sortIcon("building")}</th>
              <th onClick={() => toggleSort("contractEnd")} className="sortable">สัญญาหมด {sortIcon("contractEnd")}</th>
              <th onClick={() => toggleSort("daysLeft")} className="sortable num">คงเหลือ {sortIcon("daysLeft")}</th>
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 && (
              <tr><td colSpan={5} className="ac-empty" style={{ textAlign: "center" }}>ไม่พบผู้เช่าในเงื่อนไขนี้</td></tr>
            )}
            {tenants.map((r) => {
              const days = daysUntil(r.contractEnd);
              const cls = days === null ? "" : days < 0 ? "expired" : days <= 30 ? "soon" : "ok";
              return (
                <tr key={`${r.building}-${r.room}`} onClick={() => onSelectRoom(r)} style={{ cursor: "pointer" }}>
                  <td><strong>{r.tenant || "—"}</strong></td>
                  <td>{r.phone ? <a href={`tel:${r.phone.replace(/[^0-9+]/g, "")}`} onClick={(e) => e.stopPropagation()}>{r.phone}</a> : "—"}</td>
                  <td>{r.building} {r.room}</td>
                  <td>{r.contractEnd || "—"}</td>
                  <td className="num">
                    {days === null ? "—" : (
                      <span className={`ac-days-pill ${cls}`}>
                        {days < 0 ? `เลย ${-days} วัน` : `${days} วัน`}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
