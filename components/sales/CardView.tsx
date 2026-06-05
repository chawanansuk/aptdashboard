"use client";

import { memo } from "react";
import type { RoomView } from "@/types";
import { Icon } from "@/lib/icons";
import { salesMeta } from "@/lib/salesTheme";
import { groupByBuildingFloor } from "@/lib/salesData";
import styles from "./sales.module.css";

interface Props {
  rooms: RoomView[];
  onSelect: (r: RoomView) => void;
}

/** Card view — rooms grouped ตึก → ชั้น, each a status-tinted card. */
function CardView({ rooms, onSelect }: Props) {
  const groups = groupByBuildingFloor(rooms);

  if (rooms.length === 0) {
    return (
      <div className={styles.empty}>
        <Icon name="facilities" size={36} />
        <span>ไม่มีห้องที่ตรงกับตัวกรอง</span>
      </div>
    );
  }

  return (
    <div className={styles.cardScroll}>
      {groups.map((bg) => (
        <div key={bg.building} className={styles.cvBuilding}>
          <div className={styles.cvBuildingHead}>
            <Icon name="facilities" size={16} />
            <span className={styles.cvBuildingName}>{bg.building}</span>
            <span className={styles.cvBuildingMeta}>· {bg.total} ห้อง</span>
          </div>
          {bg.floors.map((fg) => (
            <div key={fg.floor} className={styles.cvFloor}>
              <span className={styles.cvFloorLabel}>
                {fg.floor === "—" ? "ไม่ระบุชั้น" : `ชั้น ${fg.floor}`}
              </span>
              <div className={styles.cvGrid}>
                {fg.rooms.map((r) => <RoomCard key={`${r.building}|${r.room}`} room={r} onSelect={onSelect} />)}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function RoomCard({ room, onSelect }: { room: RoomView; onSelect: (r: RoomView) => void }) {
  const m = salesMeta(room.status);
  const vars = {
    "--st-base": m.base, "--st-tint": m.tint, "--st-border": m.border,
  } as React.CSSProperties;
  return (
    <button
      className={styles.roomCard}
      style={vars}
      onClick={() => onSelect(room)}
      title={`ห้อง ${room.room} · ${m.label}`}
    >
      <div className={styles.roomCardTop}>
        <span className={`${styles.roomNo} ${styles.mono}`}>{room.room}</span>
        <span className={styles.roomDot} />
      </div>
      <span className={styles.roomPill}>{m.label}</span>
      {room.tenant
        ? <span className={styles.roomSub}>{room.tenant}</span>
        : room.price && <span className={`${styles.roomSub} ${styles.mono}`}>{room.price}</span>}
    </button>
  );
}

export default memo(CardView);
