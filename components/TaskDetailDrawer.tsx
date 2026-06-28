"use client";

import { useEffect, useRef, useState } from "react";
import type { SheetRow } from "@/types";
import { parseRepairLog } from "@/lib/repairLog";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { parseTaskLocation } from "@/lib/taskLocation";
import { computeSla, slaBadgeLabel } from "@/lib/sla";
import { categorizeStatus, TASK_STATUS } from "@/lib/taskStatus";
import { useSession } from "next-auth/react";
import { canPerform, canViewFinancials } from "@/lib/permissions";
import { useEffectiveRoles } from "@/lib/useEffectiveRoles";
import { taskKey } from "@/lib/taskKey";
import { useTaskTimer, formatDuration } from "@/lib/useTaskTimer";
import { ageLabel } from "./EngineerKanban";

/**
 * Task Detail Drawer — Task 33.
 *
 * Slides from the right when an engineer clicks a Kanban card. Shows
 * every field on the task (so the engineer doesn't need to open a
 * separate edit modal to see context), plus the same status-change
 * buttons that live inline on the card. Inline buttons stay — drawer
 * is the "give me more context" path, not the only path.
 *
 * Single tab for now. Multi-tab (ประวัติ / ผู้เช่า) deferred — both
 * need data the dashboard doesn't currently expose:
 *   - ประวัติ: audit log (Task 18, blocked on schema)
 *   - ผู้เช่า: tenant.view PII (management only) + room lookup wiring
 *
 * Esc + click-outside + focus-trap follow the same conventions as
 * RoomModal / AddTaskModal so the keyboard shortcuts feel consistent.
 */

interface Props {
  task: SheetRow | null;
  onClose: () => void;
  /** Status change — same shape as Kanban inline actions. */
  onMove: (t: SheetRow, newStatus: string) => void | Promise<void>;
  /** Open the shared edit modal for this task. When omitted, the
   *  "แก้ไข" button is hidden (e.g. a read-only consumer). */
  onEdit?: (t: SheetRow) => void;
  /** Append a "what was fixed" line to a ซ่อม task's note. When omitted
   *  the repair-log capture box is hidden (non-engineer consumers). */
  onLogRepair?: (t: SheetRow, resolution: string) => void | Promise<void>;
  busy?: boolean;
}

function fmtBaht(cost: number | undefined): string {
  if (cost == null || cost === 0) return "—";
  return `฿ ${cost.toLocaleString("th-TH")}`;
}

function statusLabel(status: string): { label: string; tone: "ok" | "warn" | "info" | "muted" } {
  const t = (status || "").trim();
  const cat = categorizeStatus(t);
  if (cat === "done")        return { label: t || "เสร็จ", tone: "ok" };
  if (cat === "cancelled")   return { label: t || "ยกเลิก", tone: "muted" };
  if (cat === "in_progress") return { label: t || "กำลังทำ", tone: "info" };
  if (cat === "blocked")     return { label: t || "ติดขัด", tone: "warn" };
  return { label: t || "รอเริ่ม", tone: "muted" };
}

export default function TaskDetailDrawer({ task, onClose, onMove, onEdit, onLogRepair, busy }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const open = !!task;
  useFocusTrap(open, ref);

  // Repair-log capture (ซ่อม tasks only). Local input; submit appends a
  // timestamped line to the note via onLogRepair, then clears.
  const [repairText, setRepairText] = useState("");

  // Time tracking (Task 35) — gated by role; sales doesn't track hours
  const { data: session } = useSession();
  void session; // kept for future per-user gating
  // Use effective roles so "view as" works for both feature gates.
  const { actualRoles, effectiveRoles } = useEffectiveRoles();
  const roles = effectiveRoles.length ? effectiveRoles : actualRoles;
  const canTrackTime = canPerform(roles, "time.track");
  const canSeeCost = canViewFinancials(roles);
  // useTaskTimer accepts null to no-op when no task is open — keeps
  // hook order stable for the conditional render.
  const tKey = task ? taskKey(task) : null;
  const timer = useTaskTimer(canTrackTime && open ? tKey : null);

  // Esc to close — mirrors AddTaskModal's pattern.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Clear the repair input whenever a different task opens, so text typed
  // for one room doesn't bleed into the next.
  const taskIdent = task ? taskKey(task) : null;
  useEffect(() => { setRepairText(""); }, [taskIdent]);

  if (!task) return null;

  const loc = parseTaskLocation(task);
  const sla = computeSla(task);
  const slaBadge = slaBadgeLabel(sla);
  const stat = statusLabel(task.status);
  const cat = categorizeStatus(task.status);
  const age = ageLabel(task.date);

  // Repair log only applies to ซ่อม tasks. `problem` is the original
  // issue text; `entries` are the timestamped "what was fixed" lines.
  const isRepair = task.type === "ซ่อม";
  const repair = isRepair ? parseRepairLog(task.note) : null;

  // Action visibility — same rules as inline KanbanCard buttons,
  // centralised here so changing one doesn't desync the other.
  const canStart  = cat === "pending";
  const canDone   = cat === "in_progress" || cat === "blocked";
  const canBlock  = cat === "in_progress";
  const canCancel = cat !== "done" && cat !== "cancelled";

  return (
    <>
      <div className="ac-summary-overlay" onClick={onClose} aria-hidden />
      <aside
        ref={ref}
        className="ac-summary-drawer is-open"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ac-task-drawer-title"
      >
        <header className="ac-summary-head">
          <div>
            <h2 id="ac-task-drawer-title" className="ac-task-drawer-title">
              {loc.kind === "common" ? <>🏢 {loc.label}</> : <>🚪 {loc.label}</>}
            </h2>
            <div className="ac-task-drawer-sub">
              {task.building}{task.type ? ` · ${task.type}` : ""}
            </div>
          </div>
          <button className="ac-summary-close" onClick={onClose} aria-label="ปิด" type="button">×</button>
        </header>

        <div className="ac-summary-body">
          <dl className="ac-task-drawer-grid">
            <dt>สถานะ</dt>
            <dd>
              <span className={`ac-task-status-badge is-${stat.tone}`}>{stat.label}</span>
              {age && <span className="ac-task-drawer-age"> · {age}</span>}
            </dd>

            <dt>วันที่กำหนด</dt>
            <dd>{task.date || "—"}</dd>

            {slaBadge && (
              <>
                <dt>SLA</dt>
                <dd className="ac-task-drawer-sla">⏰ {slaBadge}</dd>
              </>
            )}

            <dt>ผู้แจ้ง</dt>
            <dd>{task.creator || "—"}</dd>

            <dt>วันที่แจ้ง</dt>
            <dd>{task.createdAt || "—"}</dd>

            {canSeeCost && (
              <>
                <dt>ค่าใช้จ่าย</dt>
                <dd>{fmtBaht(task.cost)}</dd>
              </>
            )}

            {(task.customer || task.phone) && (
              <>
                <dt>ผู้ติดต่อ</dt>
                <dd>
                  {task.customer || "—"}
                  {task.phone && (
                    <>
                      {" · "}
                      <a className="ac-task-drawer-phone" href={`tel:${task.phone}`}>📞 {task.phone}</a>
                    </>
                  )}
                </dd>
              </>
            )}

            <dt>{isRepair ? "อาการ/ปัญหา" : "หมายเหตุ"}</dt>
            <dd className="ac-task-drawer-note">
              {(repair ? repair.problem : task.note?.trim()) || "—"}
            </dd>
          </dl>

          {/* Repair log — "ห้องนี้ซ่อมอะไรไปบ้าง". History of fixes plus an
              optional box to add a new one. Engineer-facing (onLogRepair). */}
          {isRepair && (
            <section className="ac-repair-log" aria-label="บันทึกการซ่อม">
              <header className="ac-repair-log-head">🔧 บันทึกการซ่อม</header>
              {repair && repair.entries.length > 0 ? (
                <ul className="ac-repair-log-list">
                  {repair.entries.map((e, i) => (
                    <li key={i} className="ac-repair-log-item">
                      <span className="ac-repair-log-date">{e.date}</span>
                      <span className="ac-repair-log-text">{e.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ac-repair-log-empty">ยังไม่มีบันทึกการซ่อม</p>
              )}

              {onLogRepair && (
                <div className="ac-repair-log-add">
                  <textarea
                    className="ac-repair-log-input"
                    rows={2}
                    placeholder="ซ่อมอะไรไป? เช่น เติมน้ำยา ล้างคอยล์"
                    value={repairText}
                    onChange={(e) => setRepairText(e.target.value)}
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="ac-btn ac-btn-primary ac-btn-sm"
                    disabled={busy || !repairText.trim()}
                    onClick={async () => {
                      await onLogRepair(task, repairText);
                      setRepairText("");
                    }}
                  >+ บันทึก</button>
                </div>
              )}
            </section>
          )}

          {/* Time tracker (Task 35) — engineer/management only */}
          {canTrackTime && (
            <section className="ac-task-timer" aria-label="จับเวลาทำงาน">
              <header className="ac-task-timer-head">
                <span className="ac-task-timer-label">เวลาทำงาน</span>
                <span className={`ac-task-timer-total ${timer.status === "running" ? "is-running" : ""}`}>
                  {timer.status === "running" && <span className="ac-task-timer-pulse" aria-hidden />}
                  {formatDuration(timer.totalMin)} ชม.
                </span>
              </header>
              <div className="ac-task-timer-actions">
                {timer.status === "idle" && (
                  <button
                    type="button"
                    className="ac-btn ac-btn-primary"
                    onClick={timer.start}
                  >▶ เริ่มจับเวลา</button>
                )}
                {timer.status === "running" && (
                  <button
                    type="button"
                    className="ac-btn ac-btn-danger"
                    onClick={timer.stop}
                  >⏸ หยุดจับเวลา</button>
                )}
                {timer.status === "submitting" && (
                  <button type="button" className="ac-btn ac-btn-ghost" disabled>
                    กำลังบันทึก…
                  </button>
                )}
              </div>
              {timer.error && (
                <div className="ac-task-timer-error" role="alert">
                  ⚠ {timer.error}{" "}
                  <button
                    type="button"
                    className="ac-btn ac-btn-ghost ac-btn-sm"
                    onClick={timer.clearError}
                  >ปิด</button>
                </div>
              )}
              {timer.logs.length > 0 && (
                <details className="ac-task-timer-logs">
                  <summary>{timer.logs.length} ครั้งที่ผ่านมา</summary>
                  <ul>
                    {timer.logs.slice().reverse().slice(0, 10).map((l) => (
                      <li key={l.id}>
                        <span className="ac-task-timer-log-time">
                          {l.startedAt.split(" ")[1]?.slice(0, 5)}–{l.endedAt.split(" ")[1]?.slice(0, 5) || "…"}
                        </span>
                        {" · "}
                        <strong>{formatDuration(l.durationMin)} ชม.</strong>
                        {" · "}
                        <span className="ac-task-timer-log-user">{l.user.split("@")[0]}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          )}
        </div>

        {(canStart || canDone || canBlock || canCancel || onEdit) && (
          <footer className="ac-task-drawer-foot">
            {busy && <span className="ac-btn-spinner" aria-label="กำลังบันทึก" />}
            {onEdit && (
              <button
                type="button"
                className="ac-btn ac-btn-ghost"
                onClick={() => onEdit(task)}
                disabled={busy}
                title="แก้ไขรายละเอียดงาน"
              >✎ แก้ไข</button>
            )}
            {canStart && (
              <button
                type="button"
                className="ac-btn ac-btn-primary"
                onClick={() => onMove(task, TASK_STATUS.IN_PROGRESS)}
                disabled={busy}
              >▶ เริ่ม</button>
            )}
            {canDone && (
              <button
                type="button"
                className="ac-btn ac-btn-success"
                onClick={() => onMove(task, TASK_STATUS.DONE)}
                disabled={busy}
              >✓ เสร็จ</button>
            )}
            {canBlock && (
              <button
                type="button"
                className="ac-btn ac-btn-ghost"
                onClick={() => onMove(task, TASK_STATUS.BLOCKED)}
                disabled={busy}
              >⏸ ติดขัด</button>
            )}
            {canCancel && (
              <button
                type="button"
                className="ac-btn ac-btn-ghost"
                onClick={() => onMove(task, TASK_STATUS.CANCELLED)}
                disabled={busy}
                title="ยกเลิกงานนี้"
              >✗ ยกเลิก</button>
            )}
          </footer>
        )}
      </aside>
    </>
  );
}
