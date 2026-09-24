"use client";

import { memo, useMemo } from "react";
import type { Role } from "@/auth";
import type { RoomView, SheetRow } from "@/types";
import { Icon } from "@/lib/icons";
import { STATUS_LABEL } from "@/lib/constants";
import { canViewTenant } from "@/lib/permissions";
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
  /** Tenant names are shown only to roles that may see them — the rooms
   *  API already blanks them for everyone else; this only picks the
   *  wording for a blank ("จองแล้ว" vs "ยังไม่ได้ใส่ชื่อ"). */
  roles?: Role[];
  /** Rows per section — the card sits next to the งานวันนี้ card, so it
   *  shows the head of each list, not all 300 rooms. */
  limit?: number;
}

const byBuildingThenRoom = (a: RoomView, b: RoomView) =>
  buildingSortIndex(a.building) - buildingSortIndex(b.building) ||
  a.building.localeCompare(b.building) ||
  a.room.localeCompare(b.room, undefined, { numeric: true });

/** Nearest open appointment of `type` (today or later) — the date a
 *  notice-given room frees up (ย้ายออก) or a booked room fills (ย้ายเข้า). */
export function nextAppointment(r: RoomView, type: "ย้ายออก" | "ย้ายเข้า"): Date | null {
  let best: Date | null = null;
  const all: SheetRow[] = [...(r.todayTasks || []), ...(r.upcomingTasks || [])];
  for (const t of all) {
    if (t.type !== type) continue;
    const d = parseThaiDate(t.date);
    if (d && (!best || d.getTime() < best.getTime())) best = d;
  }
  return best;
}

/** รอสัญญา rooms in the order someone should look at them: soonest
 *  move-in first; rooms booked WITHOUT a move-in appointment last — those
 *  are the ones to chase ("ยังไม่นัดวันเข้า"). */
export function sortPendingByMoveIn(rooms: RoomView[]): RoomView[] {
  const at = (r: RoomView) => nextAppointment(r, "ย้ายเข้า")?.getTime() ?? Number.POSITIVE_INFINITY;
  return [...rooms].sort((a, b) => at(a) - at(b) || byBuildingThenRoom(a, b));
}

/**
 * Overview "พร้อมให้เช่า" card (V2 Direction B) — the vacancy side of the
 * first screen, next to งานวันนี้. Read-only: a row opens the same
 * RoomModal the room grid opens, so every action (จอง, นัดชม, …) stays
 * in the one place it already lives.
 */
function ReadyRoomsCard({ rooms, activeBuilding, onSelectRoom, onSeeAll, roles, limit = 4 }: Props) {
  const showNames = canViewTenant(roles);
  const { ready, booked, leaving } = useMemo(() => {
    const scoped = scopeRooms(rooms, activeBuilding);
    return {
      ready: scoped.filter((r) => r.status === "ready").sort(byBuildingThenRoom),
      booked: sortPendingByMoveIn(scoped.filter((r) => r.status === "pending")),
      leaving: scoped.filter((r) => r.status === "moveout").sort(byBuildingThenRoom),
    };
  }, [rooms, activeBuilding]);

  const row = (r: RoomView) => {
    const price = r.status === "ready" ? formatBaht(r.price) : "";
    const outAt = r.status === "moveout" ? nextAppointment(r, "ย้ายออก") : null;
    const inAt = r.status === "pending" ? nextAppointment(r, "ย้ายเข้า") : null;
    // What the team wrote on the room wins over the generic line — for a
    // booked room that is usually "who, and when they move in".
    const fallback = r.status === "ready"
      ? (r.needsCleaning ? "ต้องทำสะอาดก่อนเข้าอยู่" : "ว่าง พร้อมเข้าอยู่")
      : r.status === "pending" ? "" : "แจ้งย้ายออกแล้ว";
    const note = (r.note || "").trim() || fallback;
    const who = r.status === "pending"
      ? (r.tenant?.trim() || (showNames ? "ยังไม่ได้ใส่ชื่อผู้จอง" : "จองแล้ว"))
      : null;
    const end = r.status === "ready" ? price
      : r.status === "moveout" ? (outAt ? `ย้ายออก ${formatDateShort(outAt)}` : "")
      : inAt ? `เข้า ${formatDateShort(inAt)}` : null;
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
            <span className="ac-ready-where">
              {who ? <>{who}<span className="ac-ready-where-sub"> · {r.building}</span></> : <>{r.building}{r.floor ? ` · ชั้น ${r.floor}` : ""}</>}
            </span>
            {note && <span className="ac-ready-note" title={note}>{note}</span>}
          </span>
          {end === null ? (
            <span className="ac-ready-end is-missing">ยังไม่นัดวันเข้า</span>
          ) : (
            <span className="ac-ready-end">{end}</span>
          )}
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
      {booked.length > 0 && (
        <>
          <h4 className="ac-ready-sub">รอเข้าอยู่ <span>({booked.length})</span></h4>
          <ul className="ac-ready-list">{booked.slice(0, limit).map(row)}</ul>
        </>
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
