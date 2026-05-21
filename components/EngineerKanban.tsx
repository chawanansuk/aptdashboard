"use client";

import { useMemo, useState } from "react";
import type { SheetRow } from "@/types";
import { parseThaiDate } from "@/lib/dateUtils";
import {
  TASK_STATUS,
  categorizeStatus,
  type StatusCategory,
} from "@/lib/taskStatus";

interface Props {
  tasks: SheetRow[];
  activeBuilding: string;
  onChanged?: () => void;
  /** Called when a card click should open the legacy task editor (optional). */
  onEditTask?: (t: SheetRow) => void;
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

function taskKey(t: SheetRow): string {
  return `${t.date}|${t.building}|${t.room}|${t.type}`;
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

export default function EngineerKanban({ tasks, activeBuilding, onChanged, onEditTask }: Props) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Mobile-only: which single column to show (CSS hides others at <md).
  // Initial = "pending" because that's where new work arrives.
  const [activeMobileCol, setActiveMobileCol] = useState<ColumnKey>("pending");

  const todayStr = useMemo(() => todayThai(), []);

  // Filter: engineer-side tasks + active building
  const filtered = useMemo(() => {
    return (tasks || []).filter((t) => {
      if (!ENG_TASK_TYPES.has(t.type)) return false;
      if (activeBuilding !== "ทั้งหมด" && t.building !== activeBuilding) return false;
      return true;
    });
  }, [tasks, activeBuilding]);

  const buckets = useMemo(() => groupTasksForKanban(filtered, todayStr), [filtered, todayStr]);

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
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "เปลี่ยนสถานะไม่สำเร็จ");
    } finally {
      setBusyKey(null);
    }
  }

  const totalOpen = buckets.pending.length + buckets.in_progress.length + buckets.blocked.length;
  const overdueCount = filtered.filter((t) => {
    if (categorizeStatus(t.status) === "done") return false;
    if (categorizeStatus(t.status) === "cancelled") return false;
    const d = parseThaiDate(t.date);
    if (!d) return false;
    return d.getTime() < new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
  }).length;

  return (
    <section className="ac-kanban" aria-label="Engineer Kanban">
      <div className="ac-kanban-strip">
        <KpiCell label="งานเปิดอยู่" value={totalOpen} accent="teal" />
        <KpiCell label="เลยกำหนด"   value={overdueCount} accent="red" />
        <KpiCell label="เสร็จวันนี้" value={buckets.done.length} accent="green" />
      </div>

      {err && (
        <div className="ac-banner ac-banner-warn" role="alert">
          <strong>⚠ </strong>{err}{" "}
          <button className="ac-btn ac-btn-ghost ac-btn-sm" onClick={() => setErr(null)}>ปิด</button>
        </div>
      )}

      {/* Mobile-only tab nav — at <md (768px) the board hides other columns
          and only shows the one matching activeMobileCol. Desktop ≥md shows
          all 4 columns as a normal grid. */}
      <nav
        className="ac-kanban-mobile-tabs ac-show-mobile-only"
        role="tablist"
        aria-label="สลับคอลัมน์งาน"
      >
        {COLUMNS.map((col) => (
          <button
            key={col.key}
            type="button"
            role="tab"
            aria-selected={activeMobileCol === col.key}
            className={`ac-kanban-mobile-tab ${activeMobileCol === col.key ? "is-active" : ""}`}
            onClick={() => setActiveMobileCol(col.key)}
            style={{ borderBottomColor: activeMobileCol === col.key ? col.accent : "transparent" }}
          >
            <span aria-hidden>{col.emoji}</span>
            <span>{col.label}</span>
            <span className="ac-kanban-mobile-tab-count">{buckets[col.key].length}</span>
          </button>
        ))}
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
            column={col.key}
          />
        ))}
      </div>
    </section>
  );
}

function KpiCell({ label, value, accent }: { label: string; value: number; accent: "teal" | "red" | "green" }) {
  return (
    <div className={`ac-kanban-kpi ac-kanban-kpi-${accent}`}>
      <div className="ac-kanban-kpi-value">{value}</div>
      <div className="ac-kanban-kpi-label">{label}</div>
    </div>
  );
}

function KanbanColumn({
  label, emoji, accent, tasks, busyKey, onMove, onEditTask, column,
}: {
  label: string;
  emoji: string;
  accent: string;
  tasks: SheetRow[];
  busyKey: string | null;
  onMove: (t: SheetRow, newStatus: string) => void;
  onEditTask?: (t: SheetRow) => void;
  column: ColumnKey;
}) {
  return (
    <div className="ac-kanban-col" data-column={column}>
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
              column={column}
            />
          ))
        )}
      </div>
    </div>
  );
}

function KanbanCard({
  task, busy, onMove, onEdit, column,
}: {
  task: SheetRow;
  busy: boolean;
  onMove: (t: SheetRow, newStatus: string) => void;
  onEdit?: (t: SheetRow) => void;
  column: ColumnKey;
}) {
  const typeIcon = task.type === "ซ่อม" ? "🔧" : task.type === "ทำสะอาด" ? "🧹" : "•";
  const age = ageLabel(task.date);
  const overdue = age.startsWith("เลย");

  return (
    <article className={`ac-kanban-card ${busy ? "is-busy" : ""}`} data-type={task.type}>
      <header className="ac-kanban-card-head">
        <span className="ac-kanban-card-type" aria-hidden>{typeIcon}</span>
        <span className="ac-kanban-card-title">
          ห้อง {task.room}
          <span className="ac-kanban-card-building"> · {task.building}</span>
        </span>
        <span className={`ac-kanban-card-age ${overdue ? "is-overdue" : ""}`}>{age}</span>
      </header>

      {task.note && (
        <div className="ac-kanban-card-note" title={task.note}>{task.note}</div>
      )}

      {(task.customer || task.phone) && (
        <div className="ac-kanban-card-meta">
          {task.customer && <span>{task.customer}</span>}
          {task.phone && (
            <a href={`tel:${task.phone}`} className="ac-kanban-card-phone" onClick={(e) => e.stopPropagation()}>
              📞 {task.phone}
            </a>
          )}
        </div>
      )}

      <footer className="ac-kanban-card-actions">
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
            >✗</button>
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
