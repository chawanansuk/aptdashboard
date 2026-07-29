"use client";

import { forwardRef } from "react";
import { Icon } from "@/lib/icons";
import { apptKindFromType, APPT_KIND_META } from "@/lib/salesTheme";
import {
  groupAppointmentsByDay, groupAppointmentsByBuilding, formatDateShort,
  type Appointment, type OverdueAppointment,
} from "@/lib/salesData";
import { formatSheetPhone, sheetPhoneDigits } from "@/lib/phoneFormat";
import styles from "./sales.module.css";

interface Props {
  appointments: Appointment[];
  /** เลยนัด — past-dated sales tasks still open (see buildOverdueAppointments).
   *  Rendered as a red group ABOVE the day groups so a missed viewing or
   *  move-in can't silently vanish from the rail. */
  overdue?: OverdueAppointment[];
  /** Click an appointment → jump to its room (opens drawer). Matched by
   *  building+room against the room list in the parent. */
  onSelectRoom?: (building: string, room: string) => void;
}

/** One appointment card — shared by the overdue group and the day groups. */
function ApptCard({
  a, overdueDays, onSelectRoom, showBuilding = false,
}: {
  a: Appointment;
  overdueDays?: number;
  onSelectRoom?: (building: string, room: string) => void;
  /** Overdue cards aren't building-grouped, so they still print it. */
  showBuilding?: boolean;
}) {
  const kind = apptKindFromType(a.task.type);
  const km = kind ? APPT_KIND_META[kind] : null;
  const akVars = km
    ? ({ "--ak-base": km.base, "--ak-tint": km.tint } as React.CSSProperties)
    : undefined;
  // Sheets strips the leading 0 from numeric phone cells (0624705817 →
  // 624705817) — that number both DISPLAYS wrong and fails to dial.
  const tel = sheetPhoneDigits(a.task.phone || "");
  const phoneLabel = formatSheetPhone(a.task.phone || "");
  return (
    <div className={styles.appt} style={akVars}>
      <button
        className={styles.apptMain}
        onClick={() => onSelectRoom?.(a.task.building, a.task.room)}
        title={`เปิดห้อง ${a.task.building} ${a.task.room}`}
      >
        <span className={styles.apptTopline}>
          {km && <span className={styles.apptDot} aria-hidden />}
          <span className={styles.apptCust}>
            {a.task.customer || "—"}
          </span>
          {overdueDays !== undefined && (
            <span className={styles.apptOverdueChip}>
              เลย {overdueDays} วัน
            </span>
          )}
        </span>
        <span className={styles.apptSub}>
          {km && <span className={styles.apptTag}>{km.label}</span>}
          <span className={styles.apptRoom}>
            {/* Building lives in the group header — repeating it on every
                card is what pushed the phone into a wrapped 2-line block. */}
            {showBuilding && <>{a.task.building} · </>}
            ห้อง <span className={styles.mono}>{a.task.room}</span>
          </span>
          {phoneLabel && (
            <span className={`${styles.apptPhone} ${styles.mono}`}>{phoneLabel}</span>
          )}
          {overdueDays !== undefined && (
            <span className={`${styles.apptRoom} ${styles.mono}`}>
              {formatDateShort(a.date)}
            </span>
          )}
        </span>
      </button>
      {tel && (
        <a
          className={styles.apptCall}
          href={`tel:${tel}`}
          title={`โทร ${phoneLabel}`}
          aria-label={`โทรหา ${a.task.customer || phoneLabel}`}
        >
          <Icon name="phone" size={17} />
        </a>
      )}
    </div>
  );
}

/**
 * นัดหมายข้างหน้า — grouped by day (วันนี้ / พรุ่งนี้ / เสาร์ 7 มิ.ย.),
 * plus an "เลยนัด" alert group pinned on top when open sales tasks have
 * slipped past their date.
 *
 * The source sheet has no time-of-day column (date is dd/MM/yyyy only),
 * so we group by calendar day rather than show a clock time — the day
 * header carries the temporal context instead.
 */
const AppointmentsRail = forwardRef<HTMLDivElement, Props>(
  function AppointmentsRail({ appointments, overdue = [], onSelectRoom }, ref) {
    const days = groupAppointmentsByDay(appointments);
    const isEmpty = appointments.length === 0 && overdue.length === 0;

    return (
      <div className={styles.rail} ref={ref}>
        <div className={styles.railHead}>
          <h3 className={styles.railTitle}>📅 นัดหมายข้างหน้า</h3>
          <span className={styles.railCount}>{appointments.length} นัด</span>
        </div>

        {isEmpty ? (
          <div className={styles.empty}>
            <Icon name="calendarClock" size={32} />
            <span>ยังไม่มีนัดหมายข้างหน้า</span>
          </div>
        ) : (
          <div className={styles.railScroll}>
            {overdue.length > 0 && (
              <div className={styles.railDay} data-tone="overdue">
                <div className={styles.railDayHead}>
                  <span className={styles.railDayLabel}>⚠️ เลยนัด — โทรตามลูกค้า</span>
                  <span className={styles.railDayCount}>{overdue.length}</span>
                </div>
                {overdue.map((o, i) => (
                  <ApptCard
                    key={`od|${o.task.date}|${o.task.building}|${o.task.room}|${i}`}
                    a={o}
                    overdueDays={o.daysOverdue}
                    onSelectRoom={onSelectRoom}
                    showBuilding
                  />
                ))}
              </div>
            )}
            {days.map((d) => (
              <div key={d.key} className={styles.railDay} data-tone={d.tone}>
                <div className={styles.railDayHead}>
                  <span className={styles.railDayLabel}>{d.label}</span>
                  <span className={styles.railDayCount}>{d.items.length}</span>
                </div>
                {groupAppointmentsByBuilding(d.items).map((b) => (
                  <div key={b.building} className={styles.railBuilding}>
                    <div className={styles.railBuildingHead}>
                      <span className={styles.railBuildingName}>{b.building}</span>
                      <span className={styles.railBuildingCount}>{b.items.length}</span>
                    </div>
                    {b.items.map((a, i) => (
                      <ApptCard
                        key={`${a.task.date}|${a.task.building}|${a.task.room}|${i}`}
                        a={a}
                        onSelectRoom={onSelectRoom}
                      />
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
);

export default AppointmentsRail;
