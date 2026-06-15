"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomView, SheetRow } from "@/types";
import { Icon } from "@/lib/icons";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { formatBaht } from "@/lib/money";
import { parseThaiDate } from "@/lib/dateUtils";
import { salesMeta, apptKindFromType, APPT_KIND_META } from "@/lib/salesTheme";
import { formatDateShort } from "@/lib/salesData";
import { deriveJourney, TURNOVER_STEP_LABELS, type JourneyAction } from "@/lib/roomJourney";
import { executeJourneyAction } from "@/lib/journeyActions";
import { toast } from "@/lib/toast";
import styles from "./sales.module.css";

interface Props {
  room: RoomView;
  onClose: () => void;
  /** Open the full RoomModal (edit, equipment, history) — keeps the
   *  existing heavyweight detail flow reachable from the light drawer. */
  onOpenFull?: (r: RoomView) => void;
  /** Refetch dashboard data after a journey write. When omitted the
   *  journey section renders read-only (stage shown, no buttons). */
  onRefresh?: () => void;
  /** Live tasks list — passed into the journey executor so the
   *  moveout auto-prep bridge can dup-guard against existing prep tasks. */
  tasks?: SheetRow[];
}

/** Lightweight read-only room summary. Slides in from the right; the
 *  heavy edit modal is one tap away via "เปิดรายละเอียดเต็ม". */
export default function RoomDetailDrawer({ room, onClose, onOpenFull, onRefresh, tasks }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [journeyBusy, setJourneyBusy] = useState(false);

  // ขั้นตอนถัดไป — same state machine as the full modal. Flow-opening
  // actions (booking/viewing) delegate to the full modal via onOpenFull.
  const journey = deriveJourney(room);
  async function runJourney(id: JourneyAction["id"]) {
    if (journeyBusy || !onRefresh) return;
    setJourneyBusy(true);
    try {
      const result = await executeJourneyAction(id, room, { refresh: onRefresh, tasks });
      if (result === "delegate") onOpenFull?.(room);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setJourneyBusy(false);
    }
  }
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

          {/* ขั้นตอนถัดไป — one next-step button, same state machine as
              the full modal. Hidden for rooms outside the journey. */}
          {journey.stage !== "other" && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>ขั้นตอนถัดไป</span>
              <div className={styles.journeyBox}>
                {journey.step && (
                  <ol className={styles.journeySteps} aria-label={`ขั้นตอน ${journey.step[0]} จาก ${journey.step[1]}`}>
                    {TURNOVER_STEP_LABELS.map((label, i) => {
                      const n = i + 1;
                      const state = n < journey.step![0] ? "done" : n === journey.step![0] ? "current" : "todo";
                      return (
                        <li
                          key={label}
                          className={`${styles.journeyStep} ${state === "done" ? styles.journeyStepDone : state === "current" ? styles.journeyStepCurrent : ""}`}
                          title={label}
                        >
                          <span className={styles.journeyDot} aria-hidden>{state === "done" ? "✓" : n}</span>
                          <span className={styles.journeyStepLabel}>{label}</span>
                        </li>
                      );
                    })}
                  </ol>
                )}
                <div className={styles.journeyTitle}>{journey.title}</div>
                {journey.subtitle && <div className={styles.journeySub}>{journey.subtitle}</div>}
                {onRefresh && journey.actions.length > 0 && (
                  <div className={styles.journeyActions}>
                    {journey.actions.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className={`${styles.drawerBtn} ${a.variant === "primary" ? styles.drawerBtnPrimary : styles.drawerBtnGhost}`}
                        disabled={journeyBusy}
                        onClick={() => void runJourney(a.id)}
                      >
                        {journeyBusy ? "กำลังบันทึก…" : a.label}
                      </button>
                    ))}
                  </div>
                )}
                {journey.actions.length === 0 && journey.step && (
                  <div className={styles.journeyWaiting}>⏳ รอปิดงานในกระดานงานช่าง</div>
                )}
              </div>
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
