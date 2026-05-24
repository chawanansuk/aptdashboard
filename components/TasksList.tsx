"use client";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { SheetRow } from "@/types";
import { canDeleteTask, canViewFinancials } from "@/lib/permissions";
import { useEffectiveRoles } from "@/lib/useEffectiveRoles";
import { exportCsv, type CsvColumn } from "@/lib/csvExport";
import { parseTaskLocation } from "@/lib/taskLocation";
import {
  bucketTasks, daysOverdue, URGENCY_META, type Urgency,
} from "@/lib/taskUrgency";
import { TASK_STATUS } from "@/lib/taskStatus";
import { TASK_TYPES } from "@/lib/taskSchema";
import { publishBusEvent } from "@/lib/realtimeBus";
import { usePersistedString } from "@/lib/usePersistedString";
import EmptyState from "./EmptyState";
import EditTaskModal from "./EditTaskModal";

interface Props {
  tasks: SheetRow[];
  title: string;
  emptyText?: string;
  onChanged?: () => void;
}

const TYPE_COLOR: Record<string, string> = {
  "ทำสะอาด": "#EAB308",
  "ย้ายเข้า": "#22C55E",
  "ย้ายออก": "#EF4444",
  "ชมห้อง": "#A855F7",
  "ซ่อม": "#F97316",
};

function isDone(status: string): boolean {
  const s = (status || "").trim();
  return s === "เสร็จ" || s === "done" || s === "ปิดแล้ว";
}
function isCancelled(status: string): boolean {
  const s = (status || "").trim();
  return s === "ยกเลิก" || s === "cancelled";
}

export default function TasksList({ tasks, title, emptyText, onChanged }: Props) {
  const { data: session } = useSession();
  const canDelete = canDeleteTask(session?.user?.roles);
  // Cost column in CSV exposed only to roles that can view financials
  // (effective roles so "view as" hides too).
  const { actualRoles, effectiveRoles } = useEffectiveRoles();
  const effRoles = effectiveRoles.length ? effectiveRoles : actualRoles;
  const canExportCost = canViewFinancials(effRoles);

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Edit modal is now the shared EditTaskModal — we just need to remember
  // which task row was picked. Old EditState shape is gone with the
  // inline modal.
  const [editTask, setEditTask] = useState<SheetRow | null>(null);
  const [confirmDel, setConfirmDel] = useState<SheetRow | null>(null);
  const [saving, setSaving] = useState(false);
  // Persist hideDone + typeFilter across reloads — user-specific
  // workflow preferences. Keyed by title so each TasksList (today /
  // calendar / by-status) keeps its own setting.
  const persistTag = title.replace(/[^\w฀-๿]+/g, "_").slice(0, 40);
  const [hideDoneRaw, setHideDoneRaw] = usePersistedString(
    `tasksList:${persistTag}:hideDone`,
    "1",
    (v) => v === "0" || v === "1",
  );
  const hideDone = hideDoneRaw === "1";
  const setHideDone = (v: boolean) => setHideDoneRaw(v ? "1" : "0");
  /** Filter by task type ("all" or specific TaskType label). Surface as
   *  chip row above the table so the engineer can scope to just งานซ่อม
   *  or just งานทำสะอาด without scrolling. */
  const [typeFilter, setTypeFilter] = usePersistedString(
    `tasksList:${persistTag}:type`,
    "all",
    (v) => v === "all" || (TASK_TYPES as readonly string[]).includes(v),
  );

  /** Bulk-select state — keyed by taskKey "date|bldg|room|type". When
   *  size > 0, the floating action bar appears at the bottom of the
   *  list with options to mark done / cancel / pending on all selected. */
  const [bulkSel, setBulkSel] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  function taskKeyOf(t: SheetRow): string {
    return `${t.date}|${t.building}|${t.room}|${t.type}`;
  }
  function toggleBulk(t: SheetRow) {
    const k = taskKeyOf(t);
    setBulkSel((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }
  function clearBulk() { setBulkSel(new Set()); }
  async function bulkSetStatus(newStatus: string) {
    if (bulkSel.size === 0) return;
    setBulkRunning(true);
    setErr(null);
    const selected = tasks.filter((t) => bulkSel.has(taskKeyOf(t)));
    try {
      // Serial — Apps Script writes are lock-protected; parallel would
      // contend on the same row range anyway. Visible progress is OK.
      for (const t of selected) {
        await postUpdate({
          action: "updateTaskStatus",
          date: t.date, building: t.building, room: t.room, type: t.type,
          status: newStatus,
        });
      }
      clearBulk();
      onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? `Bulk: ${e.message}` : "Bulk update failed");
    } finally {
      setBulkRunning(false);
    }
  }

  async function bulkDelete() {
    if (bulkSel.size === 0) return;
    if (!canDelete) return;
    if (!confirm(`ลบงาน ${bulkSel.size} รายการ?\n\nการลบนี้ไม่สามารถย้อนกลับได้`)) return;
    setBulkRunning(true);
    setErr(null);
    const selected = tasks.filter((t) => bulkSel.has(taskKeyOf(t)));
    try {
      for (const t of selected) {
        await postUpdate({
          action: "deleteTask",
          match: { date: t.date, building: t.building, room: t.room, type: t.type },
        });
      }
      clearBulk();
      onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? `Bulk delete: ${e.message}` : "Bulk delete failed");
    } finally {
      setBulkRunning(false);
    }
  }

  const visible = useMemo(() => {
    let out = tasks;
    if (hideDone) {
      out = out.filter((t) => !isDone(t.status) && !isCancelled(t.status));
    }
    if (typeFilter !== "all") {
      out = out.filter((t) => t.type === typeFilter);
    }
    return out;
  }, [tasks, hideDone, typeFilter]);
  const hiddenCount = tasks.length - visible.length;

  // Group remaining tasks into urgency buckets — drives sort + section headers
  const buckets = useMemo(() => bucketTasks(visible), [visible]);

  async function postUpdate(payload: Record<string, unknown>) {
    const res = await fetch("/api/sheet/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({ ok: false, error: "invalid JSON response" }));
    console.log("[write] task action", payload.action, res.status, data);
    if (!data.ok) {
      const statusSuffix = res.status !== 200 ? ` (HTTP ${res.status})` : "";
      throw new Error(`${data.error || "ไม่สำเร็จ"}${statusSuffix}`);
    }
    // Broadcast to other tabs so they refresh — sender refreshes
    // via the onChanged callback already wired in the parent.
    publishBusEvent({ kind: "data-changed", source: "task", ts: Date.now() });
  }

  async function changeStatus(t: SheetRow, newStatus: string) {
    const k = `${t.date}|${t.building}|${t.room}|${t.type}`;
    setBusyKey(k); setErr(null);
    try {
      await postUpdate({
        action: "updateTaskStatus",
        date: t.date, building: t.building, room: t.room, type: t.type,
        status: newStatus,
      });
      onChanged?.();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally { setBusyKey(null); }
  }

  function openEdit(t: SheetRow) {
    setEditTask(t);
    setErr(null);
  }

  async function doDelete() {
    if (!confirmDel) return;
    const t = confirmDel;
    setSaving(true); setErr(null);
    try {
      await postUpdate({
        action: "deleteTask",
        match: { date: t.date, building: t.building, room: t.room, type: t.type },
      });
      setConfirmDel(null);
      onChanged?.();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally { setSaving(false); }
  }

  if (!tasks.length) {
    return (
      <section className="ac-tasks">
        <header className="ac-tasks-head">
          <h3 className="ac-tasks-title">{title}</h3>
        </header>
        <EmptyState
          icon="tasks"
          title={emptyText || "ไม่มีงานในรายการนี้"}
          description="ลองเปลี่ยนตัวกรองสถานะ/ช่วงวันที่ หรือสร้างงานใหม่ด้วยปุ่ม + ด้านล่าง"
        />
      </section>
    );
  }

  // Computed before render — easy to scan from one place
  const overdueCount = buckets.find((b) => b.urgency === "overdue")?.tasks.length ?? 0;
  const todayCount   = buckets.find((b) => b.urgency === "today")?.tasks.length ?? 0;

  return (
    <section className="ac-tasks">
      <header className="ac-tasks-head">
        <h3 className="ac-tasks-title">
          {title} <span className="ac-tasks-count">({visible.length}{hideDone && hiddenCount > 0 ? ` / ${tasks.length}` : ""})</span>
        </h3>
        <div className="ac-tasks-head-actions">
          {/* Quick urgency summary — at-a-glance status line */}
          {(overdueCount > 0 || todayCount > 0) && (
            <div className="ac-tasks-summary" aria-label="สรุปงานเร่งด่วน">
              {overdueCount > 0 && (
                <span className="ac-tasks-summary-pill is-overdue">
                  เลยกำหนด {overdueCount}
                </span>
              )}
              {todayCount > 0 && (
                <span className="ac-tasks-summary-pill is-today">
                  วันนี้ {todayCount}
                </span>
              )}
            </div>
          )}
          <label className="ac-tasks-toggle">
            <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
            <span>ซ่อนงานเสร็จ/ยกเลิก{hideDone && hiddenCount > 0 ? ` (${hiddenCount})` : ""}</span>
          </label>
          <button
            type="button"
            className="ac-btn ac-btn-ghost ac-btn-sm"
            disabled={visible.length === 0}
            title={visible.length === 0 ? "ไม่มีข้อมูลให้ดาวน์โหลด" : `ดาวน์โหลด ${visible.length} งาน`}
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10);
              // Slug title for filename — fall back to "งาน" if empty.
              const tag = (title || "งาน").replace(/[^\w฀-๿]+/g, "_").slice(0, 40);
              const columns: CsvColumn<SheetRow>[] = [
                { header: "วันที่",    value: (t) => t.date },
                { header: "ประเภท",    value: (t) => t.type },
                { header: "ตึก",       value: (t) => t.building },
                { header: "ห้อง/พื้นที่",value: (t) => parseTaskLocation(t).label },
                { header: "สถานะ",     value: (t) => t.status },
                { header: "ลูกค้า",    value: (t) => t.customer },
                { header: "โทร",       value: (t) => t.phone },
                { header: "หมายเหตุ",  value: (t) => t.note },
                { header: "ผู้สร้าง",   value: (t) => t.creator || "" },
                { header: "วันที่สร้าง",  value: (t) => t.createdAt || "" },
              ];
              // Append cost column only for management (parity with
              // TaskDetailDrawer / InsightsCards gating).
              if (canExportCost) {
                columns.push({ header: "ค่าใช้จ่าย", value: (t) => t.cost ?? "" });
              }
              exportCsv(`${tag}_${today}.csv`, visible, columns);
            }}
          >⬇ CSV</button>
          <button
            type="button"
            className="ac-btn ac-btn-ghost ac-btn-sm ac-no-print"
            onClick={() => window.print()}
            title="พิมพ์/บันทึก PDF"
          >🖨 พิมพ์</button>
        </div>
      </header>

      {/* Type filter chips — quick scope to one task type (e.g. ซ่อม only) */}
      <nav className="ac-tasks-type-chips" role="radiogroup" aria-label="กรองตามประเภทงาน">
        <button
          type="button"
          role="radio"
          aria-checked={typeFilter === "all"}
          className={`ac-chip ${typeFilter === "all" ? "is-active" : ""}`}
          onClick={() => setTypeFilter("all")}
        >ทั้งหมด</button>
        {TASK_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={typeFilter === t}
            className={`ac-chip ${typeFilter === t ? "is-active" : ""}`}
            onClick={() => setTypeFilter(t)}
          >{t}</button>
        ))}
      </nav>

      {err && <div className="ac-banner ac-banner-warn">{err}</div>}

      {visible.length === 0 && (
        <EmptyState
          icon={hideDone ? "celebration" : "tasks"}
          tone={hideDone ? "celebration" : "neutral"}
          title={hideDone ? "งานทั้งหมดเสร็จแล้ว 🎉" : (emptyText || "ไม่มีงานในรายการนี้")}
          description={hideDone ? "ปลดล็อก toggle ด้านบนเพื่อดูงานที่เสร็จ/ยกเลิก" : undefined}
        />
      )}

      {buckets.map((bucket) => (
        <BucketSection
          key={bucket.urgency}
          urgency={bucket.urgency}
          tasks={bucket.tasks}
          busyKey={busyKey}
          canDelete={canDelete}
          bulkSel={bulkSel}
          onToggleSelect={toggleBulk}
          onPickStatus={changeStatus}
          onPickEdit={openEdit}
          onPickDelete={(t) => setConfirmDel(t)}
        />
      ))}

      <EditTaskModal
        task={editTask}
        onClose={() => setEditTask(null)}
        onSaved={() => onChanged?.()}
      />

      {confirmDel && (
        <div className="ac-modal-backdrop" onClick={() => !saving && setConfirmDel(null)}>
          <div className="ac-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <header className="ac-modal-head">
              <div className="ac-modal-title">ยืนยันการลบงาน</div>
              <button className="ac-modal-close" onClick={() => !saving && setConfirmDel(null)}>×</button>
            </header>
            <div className="ac-modal-body">
              <p>ลบงาน <strong>{confirmDel.type}</strong> ที่ <strong>{confirmDel.building}-{confirmDel.room}</strong> วันที่ <strong>{confirmDel.date}</strong> ?</p>
              <p style={{ color: "#EF4444", fontSize: 13 }}>การลบเป็นการลบถาวร ไม่สามารถกู้คืนได้</p>
              {err && <div className="ac-banner ac-banner-warn">{err}</div>}
            </div>
            <footer className="ac-modal-foot">
              <button className="ac-btn ac-btn-ghost" disabled={saving} onClick={() => setConfirmDel(null)}>ยกเลิก</button>
              <button className="ac-btn ac-btn-danger" disabled={saving} onClick={doDelete}>
                {saving ? "กำลังลบ..." : "ลบถาวร"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Bulk action bar — floating at bottom when ≥1 task selected. */}
      {bulkSel.size > 0 && (
        <div className="ac-bulk-bar" role="region" aria-label="เลือกหลายงาน">
          <span className="ac-bulk-bar-count">
            เลือก {bulkSel.size} งาน
          </span>
          <div className="ac-bulk-bar-actions">
            <button
              type="button"
              className="ac-btn ac-btn-primary ac-btn-sm"
              disabled={bulkRunning}
              onClick={() => bulkSetStatus(TASK_STATUS.DONE)}
            >✓ ทำเสร็จทั้งหมด</button>
            <button
              type="button"
              className="ac-btn ac-btn-ghost ac-btn-sm"
              disabled={bulkRunning}
              onClick={() => bulkSetStatus(TASK_STATUS.PENDING)}
            >↶ คืนทั้งหมด</button>
            <button
              type="button"
              className="ac-btn ac-btn-ghost ac-btn-sm"
              disabled={bulkRunning}
              onClick={() => bulkSetStatus(TASK_STATUS.CANCELLED)}
            >✗ ยกเลิกทั้งหมด</button>
            {canDelete && (
              <button
                type="button"
                className="ac-btn ac-btn-danger ac-btn-sm"
                disabled={bulkRunning}
                onClick={bulkDelete}
              >🗑 ลบทั้งหมด</button>
            )}
            <button
              type="button"
              className="ac-btn ac-btn-ghost ac-btn-sm"
              disabled={bulkRunning}
              onClick={clearBulk}
            >ล้าง</button>
          </div>
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------- */
/* Bucket section — one urgency group (header + cards)                  */
/* -------------------------------------------------------------------- */

interface BucketSectionProps {
  urgency: Urgency;
  tasks: SheetRow[];
  busyKey: string | null;
  canDelete: boolean;
  /** Bulk selection — set of task keys currently checked. */
  bulkSel: Set<string>;
  onToggleSelect: (t: SheetRow) => void;
  onPickStatus: (t: SheetRow, newStatus: string) => void;
  onPickEdit: (t: SheetRow) => void;
  onPickDelete: (t: SheetRow) => void;
}

function BucketSection({
  urgency, tasks, busyKey, canDelete, bulkSel, onToggleSelect,
  onPickStatus, onPickEdit, onPickDelete,
}: BucketSectionProps) {
  const meta = URGENCY_META[urgency];
  return (
    <section className={`ac-task-bucket ac-task-bucket-${meta.tone}`}>
      <header className="ac-task-bucket-head">
        <span className={`ac-task-bucket-marker ac-task-bucket-marker-${meta.tone}`} aria-hidden />
        <span className="ac-task-bucket-label">{meta.label}</span>
        <span className="ac-task-bucket-count">{tasks.length}</span>
      </header>
      <div className="ac-tasks-list">
        {tasks.map((t) => {
          const tk = `${t.date}|${t.building}|${t.room}|${t.type}`;
          return (
            <TaskCard
              key={tk}
              task={t}
              urgency={urgency}
              busyKey={busyKey}
              canDelete={canDelete}
              selected={bulkSel.has(tk)}
              onToggleSelect={onToggleSelect}
              onPickStatus={onPickStatus}
              onPickEdit={onPickEdit}
              onPickDelete={onPickDelete}
            />
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- */
/* Task card — single row                                                */
/* -------------------------------------------------------------------- */

interface TaskCardProps {
  task: SheetRow;
  urgency: Urgency;
  busyKey: string | null;
  canDelete: boolean;
  selected: boolean;
  onToggleSelect: (t: SheetRow) => void;
  onPickStatus: (t: SheetRow, newStatus: string) => void;
  onPickEdit: (t: SheetRow) => void;
  onPickDelete: (t: SheetRow) => void;
}

function TaskCard({
  task, urgency, busyKey, canDelete, selected, onToggleSelect,
  onPickStatus, onPickEdit, onPickDelete,
}: TaskCardProps) {
  const t = task;
  const k = `${t.date}|${t.building}|${t.room}|${t.type}`;
  const done = isDone(t.status);
  const cancelled = isCancelled(t.status);
  const dot = TYPE_COLOR[t.type] || "#64748B";
  const overdueDays = urgency === "overdue" ? daysOverdue(t) : 0;
  const busy = busyKey === k;

  return (
    <div
      className={`ac-task ac-task-urgency-${urgency} ${done ? "is-done" : ""} ${cancelled ? "is-cancelled" : ""} ${selected ? "is-bulk-selected" : ""}`}
    >
      <input
        type="checkbox"
        className="ac-task-bulk-check"
        checked={selected}
        onChange={() => onToggleSelect(t)}
        onClick={(e) => e.stopPropagation()}
        aria-label="เลือกเพื่อแก้ไขรวม"
      />
      <div className="ac-task-dot" style={{ background: dot }} />
      <div className="ac-task-main">
        <div className="ac-task-line1">
          <span className="ac-task-type">{t.type}</span>
          <span className="ac-task-room">{t.building}-{t.room}</span>
          <span className="ac-task-date">{t.date}</span>
          {/* Urgency badges — only when meaningful */}
          {urgency === "overdue" && (
            <span className="ac-task-urgency-badge is-overdue">
              เลย {overdueDays} วัน
            </span>
          )}
          {urgency === "today" && !done && !cancelled && (
            <span className="ac-task-urgency-badge is-today">วันนี้</span>
          )}
          {urgency === "tomorrow" && (
            <span className="ac-task-urgency-badge is-tomorrow">พรุ่งนี้</span>
          )}
        </div>
        <div className="ac-task-line2">
          {t.customer && <span>{t.customer}</span>}
          {t.phone && <span>· {t.phone}</span>}
          {t.note && <span className="ac-task-note">· {t.note}</span>}
          {t.creator && <span className="ac-task-creator">· โดย {t.creator}</span>}
        </div>
      </div>
      <div className="ac-task-actions">
        {!done && !cancelled && (
          <>
            <button className="ac-btn ac-btn-primary ac-btn-sm" disabled={busy}
              onClick={() => onPickStatus(t, "เสร็จ")}>
              {busy ? "..." : "ปิดงาน"}
            </button>
            <button className="ac-btn ac-btn-ghost ac-btn-sm" disabled={busy}
              onClick={() => onPickStatus(t, "ยกเลิก")} title="ยกเลิกงานนี้">ยกเลิก</button>
          </>
        )}
        {(done || cancelled) && (
          <button className="ac-btn ac-btn-ghost ac-btn-sm" disabled={busy}
            onClick={() => onPickStatus(t, TASK_STATUS.PENDING)} title="ดึงกลับเป็นยังไม่เสร็จ">คืน</button>
        )}
        {/* Edit button is always available — fixing typos on a closed
            job is a legitimate need. Backend still gates by task.edit. */}
        <button className="ac-btn ac-btn-ghost ac-btn-sm" disabled={busy}
          onClick={() => onPickEdit(t)} title="แก้ไขงาน">แก้ไข</button>
        {canDelete && (
          <button className="ac-btn ac-btn-danger ac-btn-sm" disabled={busy}
            onClick={() => onPickDelete(t)} title="ลบงานนี้ถาวร">ลบ</button>
        )}
        <span className={`ac-task-status ${done ? "is-done" : ""} ${cancelled ? "is-cancelled" : ""}`}>
          {done ? "เสร็จแล้ว" : cancelled ? "ยกเลิก" : (t.status || "ว่าง")}
        </span>
      </div>
    </div>
  );
}
