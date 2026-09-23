"use client";

import { memo, useMemo } from "react";
import type { RoomView, SheetRow } from "@/types";
import { Icon } from "@/lib/icons";
import { STATUS_LABEL } from "@/lib/constants";
import { formatBaht } from "@/lib/money";
import { parseThaiDate } from "@/lib/dateUtils";
import { buildingSortIndex, formatDateShort, scopeRooms } from "@/lib/salesData";
import EmptyState from "./EmptyState";

interface Props {
  rooms: RoomView[];
  activeBuilding: string;
  onSelectRoom: (r: RoomView) => void;
  /** Jump to the full "พร้อมขาย" room view. */
  onSeeAll?: () => void;
  /** Rows per section — the card sits next to the งานวันนี้ card, so it
   *  shows the head of each list, not all 300 rooms. */
  limit?: number;
}

const byBuildingThenRoom = (a: RoomView, b: RoomView) =>
  buildingSortIndex(a.building) - buildingSortIndex(b.building) ||
  a.building.localeCompare(b.building) ||
  a.room.localeCompare(b.room, undefined, { numeric: true });

/** Nearest upcoming ย้ายออก appointment, as "dd/MM" — the date a
 *  notice-given room actually frees up. */
function moveoutDate(r: RoomView): string | null {
  let best: Date | null = null;
  const all: SheetRow[] = [...(r.todayTasks || []), ...(r.upcomingTasks || [])];
  for (const t of all) {
    if (t.type !== "ย้ายออก") continue;
    const d = parseThaiDate(t.date);
    if (d && (!best || d.getTime() < best.getTime())) best = d;
  }
  return best ? formatDateShort(best) : null;
}

/**
 * Overview "พร้อมให้เช่า" card (V2 Direction B) — the vacancy side of the
 * first screen, next to งานวันนี้. Read-only: a row opens the same
 * RoomModal the room grid opens, so every action (จอง, นัดชม, …) stays
 * in the one place it already lives.
 */
function ReadyRoomsCard({ rooms, activeBuilding, onSelectRoom, onSeeAll, limit = 4 }: Props) {
  const { ready, leaving } = useMemo(() => {
    const scoped = scopeRooms(rooms, activeBuilding);
    return {
      ready: scoped.filter((r) => r.status === "ready").sort(byBuildingThenRoom),
      leaving: scoped.filter((r) => r.status === "moveout").sort(byBuildingThenRoom),
    };
  }, [rooms, activeBuilding]);

  const row = (r: RoomView) => {
    const price = r.status === "ready" ? formatBaht(r.price) : "";
    const out = r.status === "moveout" ? moveoutDate(r) : null;
    const note = r.status === "ready"
      ? (r.needsCleaning ? "ต้องทำสะอาดก่อนเข้าอยู่" : "ว่าง พร้อมเข้าอยู่")
      : "แจ้งย้ายออกแล้ว";
    return (
      <li key={`${r.building}|${r.room}`}>
        <button
          type="button"
          className={`ac-ready-row ac-ready-row-${r.status}`}
          onClick={() => onSelectRoom(r)}
          aria-label={`ห้อง ${r.room} อาคาร ${r.building} · ${STATUS_LABEL[r.status]}`}
        >
          <span className="ac-ready-num">{r.room}</span>
          <span className="ac-ready-main">
            <span className="ac-ready-where">{r.building}{r.floor ? ` · ชั้น ${r.floor}` : ""}</span>
            <span className="ac-ready-note">{note}</span>
          </span>
          <span className="ac-ready-end">
            {price || (out ? `ย้ายออก ${out}` : "")}
          </span>
        </button>
      </li>
    );
  };

  return (
    <section className="ac-ready-card" aria-label="พร้อมให้เช่า">
      <header className="ac-tasks-head">
        <h3 className="ac-tasks-title">
          พร้อมให้เช่า <span className="ac-tasks-count">({ready.length})</span>
        </h3>
        {onSeeAll && ready.length > 0 && (
          <button type="button" className="ac-tasks-seeall" onClick={onSeeAll}>
            {ready.length > limit ? `ดูทั้งหมด ${ready.length} ห้อง` : "ดูทั้งหมด"} <Icon name="next" />
          </button>
        )}
      </header>
      {ready.length === 0 ? (
        <EmptyState icon="rooms" compact title="ยังไม่มีห้องว่างพร้อมขาย" />
      ) : (
        <ul className="ac-ready-list">{ready.slice(0, limit).map(row)}</ul>
      )}
      {leaving.length > 0 && (
        <>
          <h4 className="ac-ready-sub">ใกล้ว่าง <span>({leaving.length})</span></h4>
          <ul className="ac-ready-list">{leaving.slice(0, limit).map(row)}</ul>
        </>
      )}
    </section>
  );
}

export default memo(ReadyRoomsCard);
