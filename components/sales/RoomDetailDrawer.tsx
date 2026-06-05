"use client";

import { useEffect, useRef } from "react";
import type { RoomView } from "@/types";
import { Icon } from "@/lib/icons";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { formatBaht } from "@/lib/money";
import { parseThaiDate } from "@/lib/dateUtils";
import { salesMeta, apptKindFromType, APPT_KIND_META } from "@/lib/salesTheme";
import { formatDateShort } from "@/lib/salesData";
import styles from "./sales.module.css";

interface Props {
  room: RoomView;
  onClose: () => void;
  /** Open the full RoomModal (edit, equipment, history) — keeps the
   *  existing heavyweight detail flow reachable from the light drawer. */
  onOpenFull?: (r: RoomView) => void;
}

/** Lightweight read-only room summary. Slides in from the right; the
 *  heavy edit modal is one tap away via "เปิดรายละเอียดเต็ม". */
export default function RoomDetailDrawer({ room, onClose, onOpenFull }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(true, ref);

  // Escape closes the drawer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const meta = salesMeta(room.status);
  const stVars = {
    "--st-base": meta.base,
    "--st-tint": meta.tint,
    "--st-border": meta.border,
  } as React.CSSProperties;

  // Upcoming sales-side appointments for this room (today + future),
  // sorted soonest-first — shown as a mini list.
  const appts = [...(room.todayTasks || []), ...(room.upcomingTasks || [])]
    .filter((t) => apptKindFromType(t.type) !== null)
    .map((t) => ({ task: t, date: parseThaiDate(t.date) }))
    .filter((a): a is { task: typeof a.task; date: Date } => a.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const rent = formatBaht(room.price, { suffix: " ฿" });

  return (
    <>
      <div className={styles.scrim} onClick={onClose} aria-hidden />
      <aside
        ref={ref}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label={`รายละเอียดห้อง ${room.room}`}
        style={stVars}
      >
        <header className={styles.drawerHead}>
          <div className={styles.drawerRoom}>
            <span className={`${styles.drawerRoomNo} ${styles.mono}`}>ห้อง {room.room}</span>
            <span className={styles.drawerStatusPill}>{meta.label}</span>
          </div>
          <button className={styles.drawerClose} onClick={onClose} aria-label="ปิด">
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className={styles.drawerBody}>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>ตึก</span>
              <span className={styles.fieldValue}>{room.building || "—"}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>ชั้น</span>
              <span className={`${styles.fieldValue} ${styles.mono}`}>{room.floor || "—"}</span>
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>ค่าเช่า / เดือน</span>
            <span className={`${styles.fieldValue} ${styles.mono}`}>{rent || "—"}</span>
          </div>

          {room.tenant && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>ผู้เช่าปัจจุบัน</span>
              <span className={styles.fieldValue}>{room.tenant}</span>
            </div>
          )}

          {room.phone && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>เบอร์ติดต่อ</span>
              <a className={`${styles.fieldValue} ${styles.drawerPhone}`} href={`tel:${room.phone}`}>
                <Icon name="phone" size={14} />{room.phone}
              </a>
            </div>
          )}

          {appts.length > 0 && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>นัดหมายถัดไป</span>
              <div className={styles.apptMini}>
                {appts.map((a, i) => {
                  const kind = apptKindFromType(a.task.type);
                  const km = kind ? APPT_KIND_META[kind] : null;
                  const akVars = km
                    ? ({ "--ak-base": km.base, "--ak-tint": km.tint } as React.CSSProperties)
                    : undefined;
                  return (
                    <div key={`${a.task.date}|${a.task.type}|${i}`} className={styles.apptMiniRow} style={akVars}>
                      {km && <span className={styles.apptMiniTag}>{km.label}</span>}
                      <span className={styles.apptMiniDate}>{formatDateShort(a.date)}</span>
                      {a.task.customer && <span>· {a.task.customer}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {onOpenFull && (
          <div className={styles.drawerActions}>
            <button
              className={`${styles.drawerBtn} ${styles.drawerBtnPrimary}`}
              onClick={() => onOpenFull(room)}
            >
              เปิดรายละเอียดเต็ม
            </button>
            <button
              className={`${styles.drawerBtn} ${styles.drawerBtnGhost}`}
              onClick={onClose}
            >
              ปิด
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
