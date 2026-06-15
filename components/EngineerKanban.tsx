"use client";

import { useMemo, useState } from "react";
import type { SheetRow, RoomView } from "@/types";
import { useSession } from "next-auth/react";
import { applyAutoRoomStatus } from "@/lib/applyAutoRoomStatus";
import { parseThaiDate } from "@/lib/dateUtils";
import {
  TASK_STATUS,
  categorizeStatus,
} from "@/lib/taskStatus";
import { computeSla, slaBadgeLabel } from "@/lib/sla";
import {
  parseTaskLocation,
  filterTasksByLocation,
  type LocationFilter,
} from "@/lib/taskLocation";
import TaskDetailDrawer from "./TaskDetailDrawer";
import { taskKey } from "@/lib/taskKey";
import { MOVEOUT_PREP_KINDS, findOpenPrepTask } from "@/lib/moveoutTasks";

interface Props {
  tasks: SheetRow[];
  activeBuilding: string;
  /** Live rooms — used by auto-room-status side effect after task done. */
  rooms?: RoomView[];
  onChanged?: () => void;
  /** Called when a card click should open the legacy task editor (optional). */
  onEditTask?: (t: SheetRow) => void;
  /** Opens the room editor when a moveout-panel row is clicked. */
  onSelectRoom?: (r: RoomView) => void;
  /** Trigger ad-hoc add-task for a specific room (used by moveout panel). */
  onAddTaskForRoom?: (building: string, room: string) => void;
}

/**
 * Engineer Kanban — board view that replaces the bland tasks list with
 * 4 columns of work-in-flight. Cards expose inline action buttons so the
 * engineer can advance a job ("เริ่ม" / "เสร็จ" / "ติดขัด") without
 * opening a modal — one click = one status write.
 *
 * Data model (lib/taskStatus.ts):
 *   pending     — column 1 "รอเริ่ม"   (blank or unknown status)
 *   in_progress — column 2 "กำลังทำ"   (status === "กำลังทำ")
 *   blocked     — column 3 "ติดขัด"    (status === "ติดขัด")
 *   done        — column 4 "เสร็จวันนี้" (date === today)
 *
 * Non-engineer tasks (ย้ายเข้า/ย้ายออก/ชมห้อง) are filtered out — those
 * belong on the Sales Pipeline view.
 */

const ENG_TASK_TYPES = new Set(["ซ่อม", "ทำสะอาด"]);

type ColumnKey = "pending" | "in_progress" | "blocked" | "done";

const COLUMNS: { key: ColumnKey; label: string; emoji: string; accent: string }[] = [
  { key: "pending",     label: "รอเริ่ม",     emoji: "🆕", accent: "var(--color-text-muted)" },
  { key: "in_progress", label: "กำลังทำ",     emoji: "🔧", accent: "#0D9488" },
  { key: "blocked",     label: "ติดขัด",      emoji: "⏸",  accent: "#F97316" },
  { key: "done",        label: "เสร็จวันนี้",   emoji: "✅", accent: "#22C55E" },
];

function todayThai(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}


/** Pure: bucket a list of tasks into the 4 Kanban columns. */
export function groupTasksForKanban(
  tasks: SheetRow[],
  todayStr: string,
): Record<ColumnKey, SheetRow[]> {
  const buckets: Record<ColumnKey, SheetRow[]> = {
    pending: [], in_progress: [], blocked: [], done: [],
  };
  for (const t of tasks) {
    const c = categorizeStatus(t.status);
    if (c === "cancelled") continue; // hide cancelled — they live in the
                                     // tasks list view if anyone needs them
    if (c === "done") {
      // Only show today's completions — older "wins" would crowd out
      // the working columns
      if (t.date === todayStr) buckets.done.push(t);
      continue;
    }
    if (c === "in_progress") { buckets.in_progress.push(t); continue; }
    if (c === "blocked")     { buckets.blocked.push(t); continue; }
    buckets.pending.push(t);
  }
  // Sort each column: oldest date first (most urgent at top)
  for (const k of Object.keys(buckets) as ColumnKey[]) {
    buckets[k].sort((a, b) => {
      const da = parseThaiDate(a.date)?.getTime() ?? 0;
      const db = parseThaiDate(b.date)?.getTime() ?? 0;
      return da - db;
    });
  }
  return buckets;
}

/** Pure: text describing how stale this task is, e.g. "วันนี้" / "เลย 3 วัน". */
export function ageLabel(taskDate: string, now: Date = new Date()): string {
  const d = parseThaiDate(taskDate);
  if (!d) return "";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "วันนี้";
  if (diff === 1) return "พรุ่งนี้";
  if (diff > 1)   return `อีก ${diff} วัน`;
  return `เลย ${Math.abs(diff)} วัน`;
}

export default function EngineerKanban({ tasks, activeBuilding, rooms, onChanged, onEditTask, onSelectRoom, onAddTaskForRoom }: Props) {
  const { data: session } = useSession();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Mobile-only: which single column to show (CSS hides others at <md).
  // Initial = "pending" because that's where new work arrives.
  const [activeMobileCol, setActiveMobileCol] = useState<ColumnKey>("pending");
  // Briefly-highlighted column after a KPI click (Task 32). Cleared
  // by a timeout — desktop sees a ring pulse, mobile sees tab switch.
  const [flashCol, setFlashCol] = useState<ColumnKey | null>(null);
  // Briefly-highlighted task keys (e.g. all overdue) after KPI click.
  const [flashKeys, setFlashKeys] = useState<Set<string>>(new Set());
  // Filter chip: ห้องเช่า vs ส่วนกลาง vs ทั้งหมด (Task 38 follow-up).
  // Default "all" — preserves the prior behaviour for users not yet
  // using common-area tasks.
  const [locFilter, setLocFilter] = useState<LocationFilter>("all");
  // Task selected for the detail drawer (Task 33). Null when no drawer.
  const [drawerTask, setDrawerTask] = useState<SheetRow | null>(null);

  const todayStr = todayThai();

  // Filter: engineer-side tasks + active building + location kind
  const filtered = useMemo(() => {
    const base = (tasks || []).filter((t) => {
      if (!ENG_TASK_TYPES.has(t.type)) return false;
      if (activeBuilding !== "ทั้งหมด" && t.building !== activeBuilding) return false;
      return true;
    });
    return filterTasksByLocation(base, locFilter);
  }, [tasks, activeBuilding, locFilter]);

  const buckets = useMemo(() => groupTasksForKanban(filtered, todayStr), [filtered, todayStr]);

  // Move-out room queue (bridge from sales mode). Surfaces rooms with
  // status="moveout" plus their two prep tasks (ตรวจห้อง / ทำสะอาด) so
  // the engineer can see what's coming and act on it — even though
  // type="อื่นๆ" tasks are filtered out of the regular kanban columns.
  const moveoutQueue = useMemo(() => {
    if (!rooms || rooms.length === 0) return [];
    return rooms
      .filter((r) => r.status === "moveout")
      .filter((r) => activeBuilding === "ทั้งหมด" || r.building === activeBuilding)
      .map((r) => ({
        room: r,
        prep: MOVEOUT_PREP_KINDS.map((kind) => ({
          kind,
          task: findOpenPrepTask(tasks, r.building, r.room, kind.type),
        })),
      }))
      .sort((a, b) => (a.room.building + a.room.room).localeCompare(b.room.building + b.room.room));
  }, [rooms, tasks, activeBuilding]);

  async function moveTo(t: SheetRow, newStatus: string) {
    const k = taskKey(t);
    setBusyKey(k);
    setErr(null);
    try {
      const res = await fetch("/api/sheet/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateTaskStatus",
          date: t.date, building: t.building, room: t.room, type: t.type,
          status: newStatus,
        }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "invalid JSON" }));
      if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onChanged?.();
      // Post-task side effect: auto room status update (or hint toast)
      // when the transition is unambiguous (cleaning done → ready, etc.)
      if (rooms) {
        await applyAutoRoomStatus({
          task: t, newTaskStatus: newStatus, rooms, roles: session?.user?.roles,
        });
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "เปลี่ยนสถานะไม่สำเร็จ");
    } finally {
      setBusyKey(null);
    }
  }

  const totalOpen = buckets.pending.length + buckets.in_progress.length + buckets.blocked.length;
  const overdueTasks = useMemo(() => filtered.filter((t) => {
    if (categorizeStatus(t.status) === "done") return false;
    if (categorizeStatus(t.status) === "cancelled") return false;
    const d = parseThaiDate(t.date);
    if (!d) return false;
    return d.getTime() < new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
  }), [filtered]);
  const overdueCount = overdueTasks.length;

  /**
   * Focus a column — switch mobile tab + flash desktop column. Cleared
   * after 1.2s so the highlight is a brief signal, not a sticky filter.
   */
  function focusColumn(col: ColumnKey) {
    setActiveMobileCol(col);
    setFlashCol(col);
    setTimeout(() => setFlashCol((c) => (c === col ? null : c)), 1200);
  }

  /**
   * Briefly outline all overdue cards (response to "เลยกำหนด" KPI click).
   * Cleared after 1.5s. If a card moves columns mid-flash, the class
   * falls off naturally since `flashKeys` is keyed on task identity.
   */
  function flashOverdue() {
    const keys = new Set(overdueTasks.map(taskKey));
    if (keys.size === 0) return;
    setFlashKeys(keys);
    setTimeout(() => setFlashKeys(new Set()), 1500);
  }

  return (
    <section className="ac-kanban" aria-label="Engineer Kanban">
      <div className="ac-kanban-strip">
        <KpiCell
          label="งานเปิดอยู่"
          value={totalOpen}
          accent="teal"
          onClick={() => focusColumn("pending")}
          ariaLabel={`งานเปิดอยู่ ${totalOpen} งาน — โฟกัสคอลัมน์รอเริ่ม`}
        />
        <KpiCell
          label="เลยกำหนด"
          value={overdueCount}
          accent="red"
          onClick={overdueCount > 0 ? flashOverdue : undefined}
          ariaLabel={`เลยกำหนด ${overdueCount} งาน — ไฮไลต์การ์ดทั้งหมด`}
        />
        <KpiCell
          label="เสร็จวันนี้"
          value={buckets.done.length}
          accent="green"
          onClick={() => focusColumn("done")}
          ariaLabel={`เสร็จวันนี้ ${buckets.done.length} งาน — โฟกัสคอลัมน์เสร็จ`}
        />
      </div>

      {err && (
        <div className="ac-banner ac-banner-warn" role="alert">
          <strong>⚠ </strong>{err}{" "}
          <button className="ac-btn ac-btn-ghost ac-btn-sm" onClick={() => setErr(null)}>ปิด</button>
        </div>
      )}

      {/* Location filter chips (Task 38) — let the engineer narrow the
          board to tenant rooms or common-area items. Default "all"
          preserves the prior view for users not using common-area yet. */}
      <nav
        className="ac-kanban-loc-chips"
        role="radiogroup"
        aria-label="กรองตามประเภทที่ตั้ง"
      >
        {(
          [
            { key: "all",    label: "ทั้งหมด",  icon: "" },
            { key: "room",   label: "ห้องเช่า", icon: "🚪" },
            { key: "common", label: "ส่วนกลาง", icon: "🏢" },
          ] as Array<{ key: LocationFilter; label: string; icon: string }>
        ).map((chip) => (
          <button
            key={chip.key}
            type="button"
            role="radio"
            aria-checked={locFilter === chip.key}
            className={`ac-chip ${locFilter === chip.key ? "is-active" : ""}`}
            onClick={() => setLocFilter(chip.key)}
          >
            {chip.icon && <span aria-hidden>{chip.icon} </span>}
            {chip.label}
          </button>
        ))}
      </nav>

      {/* Move-out queue (sales→engineer bridge). Visible when at least
          one room in scope is flagged "แจ้งย้ายออก". Each row shows the
          status of its prep tasks (ตรวจห้อง / ทำสะอาด) so the engineer
          knows at a glance whether anything needs to be created. Click
          the room name to open RoomModal, or a "+ สร้าง" chip to file a
          missing prep task directly. */}
      {moveoutQueue.length > 0 && (
        <section
          className="ac-kanban-moveout"
          aria-label={`ห้องแจ้งย้ายออก ${moveoutQueue.length} ห้อง`}
        >
          <header className="ac-kanban-moveout-head">
            <span className="ac-kanban-moveout-icon" aria-hidden>🚪</span>
            <h3 className="ac-kanban-moveout-title">
              ห้องแจ้งย้ายออก
              <span className="ac-kanban-moveout-count">{moveoutQueue.length}</span>
            </h3>
            <p className="ac-kanban-moveout-sub">
              เตรียมตรวจห้อง + ทำสะอาด ก่อนปล่อยห้องใหม่
            </p>
          </header>
          <ul className="ac-kanban-moveout-list" role="list">
            {moveoutQueue.map(({ room, prep }) => (
              <li key={`${room.building}|${room.room}`} className="ac-kanban-moveout-row">
                <button
                  type="button"
                  className="ac-kanban-moveout-room"
                  onClick={() => onSelectRoom?.(room)}
                  disabled={!onSelectRoom}
                  title={onSelectRoom ? "เปิดข้อมูลห้อง" : undefined}
                >
                  <span className="ac-kanban-moveout-room-building">{room.building}</span>
                  <span className="ac-kanban-moveout-room-num">{room.room}</span>
                </button>
                <div className="ac-kanban-moveout-prep">
                  {prep.map(({ kind, task }) => {
                    if (task) {
                      const cat = categorizeStatus(task.status);
                      const stateLabel =
                        cat === "done"        ? "เสร็จ"
                        : cat === "in_progress" ? "กำลังทำ"
                        : cat === "blocked"     ? "ติดขัด"
                        : "รอเริ่ม";
                      return (
                        <button
                          key={kind.kind}
                          type="button"
                          className={`ac-kanban-moveout-chip is-state-${cat}`}
                          onClick={() => onEditTask?.(task)}
                          disabled={!onEditTask}
                          title={`${kind.label}: ${stateLabel} (${task.date})`}
                        >
                          <span aria-hidden>{kind.icon}</span>
                          <span>{kind.label}</span>
                          <span className="ac-kanban-moveout-chip-state">{stateLabel}</span>
                        </button>
                      );
                    }
                    return (
                      <button
                        key={kind.kind}
                        type="button"
                        className="ac-kanban-moveout-chip is-state-missing"
                        onClick={() => onAddTaskForRoom?.(room.building, room.room)}
                        disabled={!onAddTaskForRoom}
                        title={`สร้างงาน ${kind.label}`}
                      >
                        <span aria-hidden>{kind.icon}</span>
                        <span>{kind.label}</span>
                        <span className="ac-kanban-moveout-chip-state">+ สร้าง</span>
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Mobile-only tab nav — at <md (768px) the board hides other columns
          and only shows the one matching activeMobileCol. Desktop ≥md shows
          all 4 columns as a normal grid. */}
      <nav
        className="ac-kanban-mobile-tabs ac-show-mobile-only"
        role="tablist"
        aria-label="สลับคอลัมน์งาน"
      >
        {COLUMNS.map((col) => {
          const count = buckets[col.key].length;
          const isActive = activeMobileCol === col.key;
          const isZero = count === 0;
          return (
            <button
              key={col.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`ac-kanban-mobile-tab ${isActive ? "is-active" : ""} ${isZero ? "is-zero" : ""}`}
              onClick={() => setActiveMobileCol(col.key)}
              style={{ borderBottomColor: isActive ? col.accent : "transparent" }}
              title={isZero ? `${col.label} (ไม่มีงาน)` : `${col.label} ${count} งาน`}
            >
              <span aria-hidden>{col.emoji}</span>
              <span>{col.label}</span>
              <span className={`ac-kanban-mobile-tab-count ${isZero ? "is-zero" : ""}`}>{count}</span>
            </button>
          );
        })}
      </nav>

      <div className="ac-kanban-board" data-active-col={activeMobileCol}>
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.key}
            label={col.label}
            emoji={col.emoji}
            accent={col.accent}
            tasks={buckets[col.key]}
            busyKey={busyKey}
            onMove={moveTo}
            onEditTask={onEditTask}
            onSelectTask={setDrawerTask}
            column={col.key}
            isFlashing={flashCol === col.key}
            flashKeys={flashKeys}
          />
        ))}
      </div>

      <TaskDetailDrawer
        task={drawerTask}
        busy={drawerTask ? busyKey === taskKey(drawerTask) : false}
        onClose={() => setDrawerTask(null)}
        onMove={async (t, st) => {
          await moveTo(t, st);
          // Close drawer after a status change so the user sees the
          // updated board state; the next click can re-open with fresh data.
          setDrawerTask(null);
        }}
        onEdit={onEditTask && ((t) => {
          // Hand off to the shared edit modal mounted at page root.
          // Close the drawer first so the modal isn't hidden behind it.
          setDrawerTask(null);
          onEditTask(t);
        })}
      />
    </section>
  );
}

interface KpiCellProps {
  label: string;
  value: number;
  accent: "teal" | "red" | "green";
  onClick?: () => void;
  ariaLabel?: string;
}

function KpiCell({ label, value, accent, onClick, ariaLabel }: KpiCellProps) {
  // Dim KPI when value is 0 so the eye flies to the non-zero stat
  // (typical engineer view: many "งานเปิดอยู่", "เลยกำหนด"/"เสร็จวันนี้"
  // often 0 early in the day).
  const isZero = value === 0;
  const className = `ac-kanban-kpi ac-kanban-kpi-${accent}${onClick ? " is-clickable" : ""}${isZero ? " is-zero" : ""}`;
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-label={ariaLabel}>
        <div className="ac-kanban-kpi-value">{value}</div>
        <div className="ac-kanban-kpi-label">{label}</div>
      </button>
    );
  }
  return (
    <div className={className}>
      <div className="ac-kanban-kpi-value">{value}</div>
      <div className="ac-kanban-kpi-label">{label}</div>
    </div>
  );
}

function KanbanColumn({
  label, emoji, accent, tasks, busyKey, onMove, onEditTask, onSelectTask, column,
  isFlashing, flashKeys,
}: {
  label: string;
  emoji: string;
  accent: string;
  tasks: SheetRow[];
  busyKey: string | null;
  onMove: (t: SheetRow, newStatus: string) => void;
  onEditTask?: (t: SheetRow) => void;
  onSelectTask?: (t: SheetRow) => void;
  column: ColumnKey;
  isFlashing?: boolean;
  flashKeys?: Set<string>;
}) {
  return (
    <div
      className={`ac-kanban-col ${isFlashing ? "is-flash" : ""}`}
      data-column={column}
    >
      <div className="ac-kanban-col-head" style={{ borderTopColor: accent }}>
        <span className="ac-kanban-col-emoji" aria-hidden>{emoji}</span>
        <span className="ac-kanban-col-label">{label}</span>
        <span className="ac-kanban-col-count">{tasks.length}</span>
      </div>
      <div className="ac-kanban-col-body">
        {tasks.length === 0 ? (
          <div className="ac-kanban-col-empty">—</div>
        ) : (
          tasks.map((t) => (
            <KanbanCard
              key={taskKey(t)}
              task={t}
              busy={busyKey === taskKey(t)}
              onMove={onMove}
              onEdit={onEditTask}
              onSelect={onSelectTask}
              column={column}
              flashing={flashKeys?.has(taskKey(t)) ?? false}
            />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Render the creator (email) compactly — show local-part only so the
 * card stays readable when the email is long. Falls back to "—" so
 * cards have a consistent meta row (Task 39). Exported for unit test.
 */
export function creatorLabel(creator: string | undefined): string {
  if (!creator) return "—";
  const at = creator.indexOf("@");
  return at > 0 ? creator.slice(0, at) : creator;
}

function KanbanCard({
  task, busy, onMove, onEdit, onSelect, column, flashing,
}: {
  task: SheetRow;
  busy: boolean;
  onMove: (t: SheetRow, newStatus: string) => void;
  onEdit?: (t: SheetRow) => void;
  /** Click anywhere on the card body → opens TaskDetailDrawer (Task 33). */
  onSelect?: (t: SheetRow) => void;
  column: ColumnKey;
  flashing?: boolean;
}) {
  const typeIcon = task.type === "ซ่อม" ? "🔧" : task.type === "ทำสะอาด" ? "🧹" : "•";
  const age = ageLabel(task.date);
  const overdue = age.startsWith("เลย");
  const location = parseTaskLocation(task);
  const isCommon = location.kind === "common";
  // SLA state — drives the card's color cue (warn/overdue) + optional badge.
  const sla = computeSla(task);
  const slaClass =
    sla.state === "overdue" ? "is-sla-overdue"
    : sla.state === "warn" ? "is-sla-warn"
    : "";
  const slaBadge = slaBadgeLabel(sla);
  const reporter = creatorLabel(task.creator);
  const note = task.note?.trim() || "—";

  return (
    <article
      className={`ac-kanban-card ${onSelect ? "is-clickable" : ""} ${busy ? "is-busy" : ""} ${flashing ? "is-flash" : ""} ${slaClass}`}
      data-type={task.type}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect ? () => onSelect(task) : undefined}
      onKeyDown={onSelect ? (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(task);
        }
      } : undefined}
    >
      <header className="ac-kanban-card-head">
        <span className="ac-kanban-card-type" aria-hidden>
          {isCommon ? "🏢" : typeIcon}
        </span>
        <span className="ac-kanban-card-title">
          {isCommon ? location.label : `ห้อง ${task.room}`}
          <span className="ac-kanban-card-building"> · {task.building}</span>
        </span>
        <span className={`ac-kanban-card-age ${overdue ? "is-overdue" : ""}`}>{age}</span>
      </header>

      {slaBadge && (
        <div className="ac-kanban-card-sla" role="status">⏰ {slaBadge}</div>
      )}

      {/* Note row — always rendered for layout consistency. "—" when
          empty so cards stack uniformly across the column (Task 39). */}
      <div
        className={`ac-kanban-card-note ${note === "—" ? "is-empty" : ""}`}
        title={note === "—" ? "ไม่มีหมายเหตุ" : note}
      >{note}</div>

      {/* Reporter row — always present, "—" if creator field empty in
          the source sheet. Phone block dropped (engineer tasks
          historically don't fill customer/phone; sales-side tasks
          live in a different view). */}
      <div className="ac-kanban-card-meta">
        {/* Hide empty reporter row — clean card when engineer task has no
            creator (proxy: "—" from creatorLabel). Saves vertical space
            and removes visual noise. */}
        {reporter && reporter !== "—" && (
          <span className="ac-kanban-card-reporter" title={task.creator || "ไม่ระบุผู้แจ้ง"}>
            👤 {reporter}
          </span>
        )}
        {/* Task date — small, muted; only when a date is actually set */}
        {task.date && (
          <span className="ac-kanban-card-date" title={`วันที่กำหนด ${task.date}`}>
            📅 {task.date}
          </span>
        )}
      </div>

      <footer
        className="ac-kanban-card-actions"
        onClick={(e) => e.stopPropagation()}
      >
        {busy && <span className="ac-btn-spinner" aria-label="กำลังบันทึก" />}

        {column === "pending" && !busy && (
          <>
            <button
              className="ac-kanban-btn ac-kanban-btn-primary"
              onClick={() => onMove(task, TASK_STATUS.IN_PROGRESS)}
            >▶ เริ่ม</button>
            <button
              className="ac-kanban-btn ac-kanban-btn-ghost"
              onClick={() => onMove(task, TASK_STATUS.CANCELLED)}
              title="ยกเลิกงานนี้"
            >✗ ยกเลิก</button>
          </>
        )}
        {column === "in_progress" && !busy && (
          <>
            <button
              className="ac-kanban-btn ac-kanban-btn-success"
              onClick={() => onMove(task, TASK_STATUS.DONE)}
            >✓ เสร็จ</button>
            <button
              className="ac-kanban-btn ac-kanban-btn-warn"
              onClick={() => onMove(task, TASK_STATUS.BLOCKED)}
            >⏸ ติดขัด</button>
          </>
        )}
        {column === "blocked" && !busy && (
          <>
            <button
              className="ac-kanban-btn ac-kanban-btn-primary"
              onClick={() => onMove(task, TASK_STATUS.IN_PROGRESS)}
            >▶ ทำต่อ</button>
            <button
              className="ac-kanban-btn ac-kanban-btn-success"
              onClick={() => onMove(task, TASK_STATUS.DONE)}
            >✓ เสร็จ</button>
          </>
        )}
        {column === "done" && !busy && (
          <button
            className="ac-kanban-btn ac-kanban-btn-ghost"
            onClick={() => onMove(task, TASK_STATUS.PENDING)}
            title="ดึงกลับเป็นยังไม่เสร็จ"
          >↶ คืน</button>
        )}

        {onEdit && !busy && (
          <button
            className="ac-kanban-btn ac-kanban-btn-link"
            onClick={() => onEdit(task)}
            title="แก้ไขรายละเอียด"
          >…</button>
        )}
      </footer>
    </article>
  );
}
