"use client";

import { memo } from "react";
import type { RoomView } from "@/types";
import { Icon } from "@/lib/icons";
import { buildBuildingGrids } from "@/lib/salesData";
import BuildingGrid from "./BuildingGrid";
import styles from "./sales.module.css";

interface Props {
  rooms: RoomView[];
  onSelect: (r: RoomView) => void;
}

/** Grid (ผัง) view — every building as a colored elevation map. */
function GridBoard({ rooms, onSelect }: Props) {
  const grids = buildBuildingGrids(rooms);

  if (rooms.length === 0) {
    return (
      <div className={styles.empty}>
        <Icon name="facilities" size={36} />
        <span>ไม่มีห้องที่ตรงกับตัวกรอง</span>
      </div>
    );
  }

  return (
    <div className={styles.gridScroll}>
      <span className={styles.gridHint}>ผังทั้งตึก — ระบายสีตามสถานะ (ชั้นสูงสุดอยู่บน)</span>
      {grids.map((g) => (
        <BuildingGrid key={g.building} model={g} onSelect={onSelect} />
      ))}
    </div>
  );
}

export default memo(GridBoard);
