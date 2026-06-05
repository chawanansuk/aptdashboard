"use client";

import type { RoomView } from "@/types";
import { salesMeta } from "@/lib/salesTheme";
import type { BuildingGridModel } from "@/lib/salesData";
import styles from "./sales.module.css";

interface Props {
  model: BuildingGridModel;
  onSelect: (r: RoomView) => void;
}

/** One building rendered as a floor-by-floor elevation (highest floor on
 *  top). Each room is a status-colored cell; hover shows a tooltip, click
 *  opens the detail drawer. */
export default function BuildingGrid({ model, onSelect }: Props) {
  return (
    <div className={styles.gbBuilding}>
      <div className={styles.gbHead}>
        <div>
          <span className={styles.gbName}>{model.building}</span>{" "}
          <span className={styles.gbMeta}>{model.total} ห้อง · {model.floorCount} ชั้น</span>
        </div>
        <span className={styles.gbBadge}>
          เช่าแล้ว <b>{model.occupiedPct}%</b> · ว่าง <b>{model.vacant}</b>
        </span>
      </div>
      <div className={styles.gbFloors}>
        {model.floors.map((fg) => (
          <div key={fg.floor} className={styles.gbFloorRow}>
            <span className={styles.gbFloorLabel}>
              {fg.floor === "—" ? "—" : `ชั้น ${fg.floor}`}
            </span>
            <div className={styles.gbCells}>
              {fg.rooms.map((r) => {
                const m = salesMeta(r.status);
                const vars = {
                  "--st-base": m.base, "--st-tint": m.tint, "--st-border": m.border,
                } as React.CSSProperties;
                return (
                  <button
                    key={`${r.building}|${r.room}`}
                    className={styles.gcell}
                    style={vars}
                    onClick={() => onSelect(r)}
                    title={`ห้อง ${r.room} · ${m.label}`}
                    aria-label={`ห้อง ${r.room} ${m.label}`}
                  >
                    {r.room}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
