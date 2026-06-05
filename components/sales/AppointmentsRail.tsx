"use client";

import { forwardRef } from "react";
import { Icon } from "@/lib/icons";
import { apptKindFromType, APPT_KIND_META } from "@/lib/salesTheme";
import { groupAppointmentsByDay, type Appointment } from "@/lib/salesData";
import styles from "./sales.module.css";

interface Props {
  appointments: Appointment[];
  /** Click an appointment → jump to its room (opens drawer). Matched by
   *  building+room against the room list in the parent. */
  onSelectRoom?: (building: string, room: string) => void;
}

/**
 * นัดหมายข้างหน้า — grouped by day (วันนี้ / พรุ่งนี้ / เสาร์ 7 มิ.ย.).
 *
 * The source sheet has no time-of-day column (date is dd/MM/yyyy only),
 * so we group by calendar day rather than show a clock time — the day
 * header carries the temporal context instead.
 */
const AppointmentsRail = forwardRef<HTMLDivElement, Props>(
  function AppointmentsRail({ appointments, onSelectRoom }, ref) {
    const days = groupAppointmentsByDay(appointments);

    return (
      <div className={styles.rail} ref={ref}>
        <div className={styles.railHead}>
          <h3 className={styles.railTitle}>📅 นัดหมายข้างหน้า</h3>
          <span className={styles.railCount}>{appointments.length} นัด</span>
        </div>

        {appointments.length === 0 ? (
          <div className={styles.empty}>
            <Icon name="calendarClock" size={32} />
            <span>ยังไม่มีนัดหมายข้างหน้า</span>
          </div>
        ) : (
          <div className={styles.railScroll}>
            {days.map((d) => (
              <div key={d.key} className={styles.railDay}>
                <div className={styles.railDayHead}>
                  <span className={styles.railDayLabel}>{d.label}</span>
                  <span className={styles.railDayCount}>{d.items.length} นัด</span>
                </div>
                {d.items.map((a, i) => {
                  const kind = apptKindFromType(a.task.type);
                  const km = kind ? APPT_KIND_META[kind] : null;
                  const akVars = km
                    ? ({ "--ak-base": km.base, "--ak-tint": km.tint } as React.CSSProperties)
                    : undefined;
                  return (
                    <button
                      key={`${a.task.date}|${a.task.building}|${a.task.room}|${i}`}
                      className={styles.appt}
                      style={akVars}
                      onClick={() => onSelectRoom?.(a.task.building, a.task.room)}
                    >
                      <span className={styles.apptMain}>
                        <span className={styles.apptTopline}>
                          {km && <span className={styles.apptTag}>{km.label}</span>}
                          <span className={styles.apptRoom}>
                            {a.task.building} · <span className={styles.mono}>{a.task.room}</span>
                          </span>
                        </span>
                        {a.task.customer && <span className={styles.apptCust}>{a.task.customer}</span>}
                        {a.task.phone && (
                          <span className={styles.apptPhone}>
                            <Icon name="phone" size={12} />{a.task.phone}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
);

export default AppointmentsRail;
