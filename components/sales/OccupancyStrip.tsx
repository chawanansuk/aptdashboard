"use client";

import { memo } from "react";
import { abbreviateBuilding } from "@/lib/buildingAbbrev";
import { SALES_STATUS_ORDER, SALES_STATUS_META } from "@/lib/salesTheme";
import type { BuildingOccupancy } from "@/lib/salesData";
import styles from "./sales.module.css";

interface Props {
  buildings: BuildingOccupancy[];
  /** Currently filtered building, or null when showing all. */
  selected: string | null;
  /** Toggle filter to this building (parent decides; clicking the
   *  active one clears back to "ทั้งหมด"). */
  onSelect: (building: string) => void;
}

/**
 * อัตราการเช่าต่อตึก — one small card per building with a segmented
 * status bar. Clicking a card filters the whole board to that building
 * (syncs the topbar tab); clicking the active one clears the filter.
 */
function OccupancyStrip({ buildings, selected, onSelect }: Props) {
  if (buildings.length === 0) return null;

  return (
    <section className={styles.occStrip} aria-label="อัตราการเช่าต่อตึก">
      <div className={styles.occHead}>
        <h3 className={styles.boardTitle}>อัตราการเช่าต่อตึก</h3>
        <span className={styles.subtitle}>
          สัดส่วนห้องที่มีผู้เช่า · ห้องว่าง · ทั้งหมด · คลิกเพื่อกรองตึก
        </span>
      </div>

      <div className={styles.occGrid}>
        {buildings.map((b) => {
          const active = selected === b.building;
          return (
            <button
              key={b.building}
              type="button"
              className={`${styles.occCard} ${active ? styles.occCardActive : ""}`}
              onClick={() => onSelect(b.building)}
              aria-pressed={active}
              title={`${b.building} · เช่าแล้ว ${b.occupiedPct}% · ว่าง ${b.vacant} จาก ${b.total} ห้อง`}
            >
              <div className={styles.occCardTop}>
                <span className={styles.occAvatar} aria-hidden>{abbreviateBuilding(b.building)}</span>
                <span className={styles.occName}>{b.building}</span>
                <span className={`${styles.occPct} ${styles.mono}`}>{b.occupiedPct}%</span>
              </div>

              <div className={styles.occBar} role="img" aria-label={`เช่าแล้ว ${b.occupiedPct}%`}>
                {SALES_STATUS_ORDER.map((s) => {
                  const n = b.counts[s];
                  if (n === 0) return null;
                  const pct = (n / b.total) * 100;
                  return (
                    <span
                      key={s}
                      className={styles.occBarSeg}
                      style={{ width: `${pct}%`, background: SALES_STATUS_META[s].base }}
                    />
                  );
                })}
              </div>

              <div className={styles.occMeta}>
                <span>ว่าง <b className={styles.mono}>{b.vacant}</b></span>
                <span className={styles.mono}>{b.occupied}/{b.total} เช่าแล้ว</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default memo(OccupancyStrip);
