"use client";

import { memo, useMemo } from "react";
import type { Role } from "@/auth";
import type { RoomView } from "@/types";
import { Icon } from "@/lib/icons";
import { canAccess, canViewTenant } from "@/lib/permissions";
import { scopeRooms } from "@/lib/salesData";
import { byBuildingThenRoom, isBooked, sortPendingByMoveIn } from "@/lib/moveIns";
import EmptyState from "./EmptyState";
import RoomListRow from "./RoomListRow";

interface Props {
  rooms: RoomView[];
  activeBuilding: string;
  onSelectRoom: (r: RoomView) => void;
  /** Jump to the full room view behind a section. Each link shows only
   *  to roles that can open that view (engineers can't open พร้อมขาย —
   *  the link used to bounce them with "ไม่มีสิทธิ์"). */
  onSeeAll?: (view: SectionView) => void;
  /** Tenant names are shown only to roles that may see them. The rooms
   *  API already blanks them for everyone else; this also covers View-as,
   *  where a manager previewing sales still receives the names. */
  roles?: Role[];
  /** Open the new-appointment form as a ย้ายเข้า for this room (the same
   *  flow as the room window's "บันทึกวันย้ายเข้า"). Passed only to roles
   *  that may add sales tasks — without it the "ยังไม่นัดวันเข้า" marker
   *  stays a plain label. */
  onScheduleMoveIn?: (r: RoomView) => void;
  /** Rows per section — the card sits next to the งานวันนี้ card, so it
   *  shows the head of each list, not all 300 rooms. */
  limit?: number;
}

type SectionView = "ready" | "pending" | "moveout";

/**
 * Overview "พร้อมให้เช่า" card (V2 Direction B) — the vacancy side of the
 * first screen, next to งานวันนี้. Read-only: a row opens the same
 * RoomModal the room grid opens, so every action (จอง, นัดชม, …) stays
 * in the one place it already lives.
 */
function ReadyRoomsCard({ rooms, activeBuilding, onSelectRoom, onSeeAll, roles, onScheduleMoveIn, limit = 4 }: Props) {
  const showNames = canViewTenant(roles);
  const { ready, booked, leaving } = useMemo(() => {
    const scoped = scopeRooms(rooms, activeBuilding);
    return {
      ready: scoped.filter((r) => r.status === "ready").sort(byBuildingThenRoom),
      booked: sortPendingByMoveIn(scoped.filter(isBooked)),
      leaving: scoped.filter((r) => r.status === "moveout").sort(byBuildingThenRoom),
    };
  }, [rooms, activeBuilding]);

  const row = (r: RoomView) => (
    <RoomListRow
      key={`${r.building}|${r.room}`}
      r={r}
      showNames={showNames}
      onSelect={onSelectRoom}
      onScheduleMoveIn={onScheduleMoveIn}
    />
  );

  const seeAll = (view: SectionView, count: number) =>
    onSeeAll && count > 0 && canAccess(roles, view) && (
      <button type="button" className="ac-tasks-seeall" onClick={() => onSeeAll(view)}>
        {count > limit ? `ดูทั้งหมด ${count} ห้อง` : "ดูทั้งหมด"} <Icon name="next" />
      </button>
    );

  return (
    <section className="ac-ready-card" aria-label="พร้อมให้เช่า">
      <header className="ac-tasks-head">
        <h3 className="ac-tasks-title">
          พร้อมให้เช่า <span className="ac-tasks-count">({ready.length})</span>
        </h3>
        {seeAll("ready", ready.length)}
      </header>
      {ready.length === 0 ? (
        <EmptyState icon="rooms" compact title="ยังไม่มีห้องว่างพร้อมขาย" />
      ) : (
        <ul className="ac-ready-list">{ready.slice(0, limit).map(row)}</ul>
      )}
      {booked.length > 0 && (
        <>
          <h4 className="ac-ready-sub">รอเข้าอยู่ <span>({booked.length})</span>{seeAll("pending", booked.length)}</h4>
          <ul className="ac-ready-list">{booked.slice(0, limit).map(row)}</ul>
        </>
      )}
      {leaving.length > 0 && (
        <>
          <h4 className="ac-ready-sub">ใกล้ว่าง <span>({leaving.length})</span>{seeAll("moveout", leaving.length)}</h4>
          <ul className="ac-ready-list">{leaving.slice(0, limit).map(row)}</ul>
        </>
      )}
    </section>
  );
}

export default memo(ReadyRoomsCard);
