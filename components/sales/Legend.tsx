"use client";

import { SALES_STATUS_ORDER, SALES_STATUS_META } from "@/lib/salesTheme";
import styles from "./sales.module.css";

/** Color key for the four sales statuses. Reads straight from the
 *  single-source palette so it can never drift from the cards/grid. */
export default function Legend() {
  return (
    <div className={styles.legend} aria-label="คำอธิบายสีสถานะ">
      {SALES_STATUS_ORDER.map((s) => {
        const m = SALES_STATUS_META[s];
        return (
          <span key={s} className={styles.legendItem}>
            <span
              className={styles.legendDot}
              style={{ "--st-base": m.base, "--st-border": m.border } as React.CSSProperties}
            />
            {m.label}
          </span>
        );
      })}
    </div>
  );
}
