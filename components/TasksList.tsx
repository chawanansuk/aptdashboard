"use client";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { SheetRow } from "@/types";
import { canDeleteTask } from "@/lib/permissions";
import {
  bucketTasks, daysOverdue, URGENCY_META, type Urgency,
} from "@/lib/taskUrgency";
import EmptyState from "./EmptyState";

// dd/MM/yyyy <-> yyyy-MM-dd conversion for <input type="date">
function dmyToIso(s: string): string {
  if (!s) return "";
  const m = s.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!m) return "";
  const d = m[1].padStart(2, "0");
  const mo = m[2].padStart(2, "0");
  let y = m[3];
  if (y.length === 2) y = (parseInt(y, 10) >= 50 ? "19" : "20") + y;
  return `${y}-${mo}-${d}`;
}
function isoToDmy(s: string): string {
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

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

type EditState = {
  match: { date: string; building: string; room: string; type: string };
  date: string;
  customer: string;
  phone: string;
  note: string;
};

export default function TasksList({ tasks, title, emptyText, onChanged }: Props) {
  const { data: session } = useSession();
  const canDelete = canDeleteTask(session?.user?.roles);

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [confirmDel, setConfirmDel] = useState<SheetRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [hideDone, setHideDone] = useState(true);

  const visible = useMemo(
    () => hideDone
      ? tasks.filter((t) => !isDone(t.status) && !isCancelled(t.status))
      : tasks,
    [tasks, hideDone]
  );
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
    setEdit({
      match: { date: t.date, building: t.building, room: t.room, type: t.type },
      date: t.date,
      customer: t.customer || "",
      phone: t.phone || "",
      note: t.note || "",
    });
    setErr(null);
  }

  async function saveEdit() {
    if (!edit) return;
    setSaving(true); setErr(null);
    try {
      await postUpdate({
        action: "updateTask",
        match: edit.match,
        set: {
          date: edit.date,
          customer: edit.customer,
          phone: edit.phone,
          note: edit.note,
        },
      });
      setEdit(null);
      onChanged?.();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally { setSaving(false); }
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
        <EmptyState icon="tasks" title={emptyText || "ไม่มีงานในรายการนี้"} description="ลองเปลี่ยน filter / ช่วงวันที่ หรือกด + เพิ่มงาน เพื่อสร้างใหม่" />
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
        </div>
      </header>
      {err && <div className="ac-banner ac-banner-warn">{err}</div>}

      {visible.length === 0 && (
        <EmptyState icon="tasks" title={hideDone ? "งานทั้งหมดเสร็จแล้ว 🎉" : (emptyText || "ไม่มีงานในรายการนี้")} description={hideDone ? "ปลดล็อก toggle ด้านบนเพื่อดูงานที่เสร็จ/ยกเลิก" : undefined} />
      )}

      {buckets.map((bucket) => (
        <BucketSection
          key={bucket.urgency}
          urgency={bucket.urgency}
          tasks={bucket.tasks}
          busyKey={busyKey}
          canDelete={canDelete}
          onPickStatus={changeStatus}
          onPickEdit={openEdit}
          onPickDelete={(t) => setConfirmDel(t)}
        />
      ))}

      {edit && (
        <div className="ac-modal-backdrop" onClick={() => !saving && setEdit(null)}>
          <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
            <header className="ac-modal-head">
              <div className="ac-modal-title">แก้ไขงาน</div>
              <div className="ac-modal-sub">{edit.match.building}-{edit.match.room} · {edit.match.type}</div>
              <button className="ac-modal-close" onClick={() => !saving && setEdit(null)}>×</button>
            </header>
            <div className="ac-modal-body">
              <div className="ac-field">
                <label>วันที่</label>
                <input
                  type="date"
                  value={dmyToIso(edit.date)}
                  onChange={(e) => setEdit({ ...edit, date: isoToDmy(e.target.value) })}
                />
                <span style={{ fontSize: 11, color: "#9CA3AF" }}>{edit.date || "—"}</span>
              </div>
              <div className="ac-field">
                <label>ลูกค้า</label>
                <input type="text" value={edit.customer}
                  onChange={(e) => setEdit({ ...edit, customer: e.target.value })} />
              </div>
              <div className="ac-field">
                <label>เบอร์</label>
                <input type="tel" value={edit.phone}
                  onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
              </div>
              <div className="ac-field">
                <label>หมายเหตุ (ใส่เวลานัดที่นี่ได้ เช่น "นัด 10 โมง")</label>
                <textarea rows={3} value={edit.note}
                  onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
              </div>
              {err && <div className="ac-banner ac-banner-warn">{err}</div>}
            </div>
            <footer className="ac-modal-foot">
              <button className="ac-btn ac-btn-ghost" disabled={saving} onClick={() => setEdit(null)}>ยกเลิก</button>
              <button className="ac-btn ac-btn-primary" disabled={saving} onClick={saveEdit}>
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </footer>
          </div>
        </div>
      )}

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
  onPickStatus: (t: SheetRow, newStatus: string) => void;
  onPickEdit: (t: SheetRow) => void;
  onPickDelete: (t: SheetRow) => void;
}

function BucketSection({
  urgency, tasks, busyKey, canDelete,
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
        {tasks.map((t) => (
          <TaskCard
            key={`${t.date}|${t.building}|${t.room}|${t.type}`}
            task={t}
            urgency={urgency}
            busyKey={busyKey}
            canDelete={canDelete}
            onPickStatus={onPickStatus}
            onPickEdit={onPickEdit}
            onPickDelete={onPickDelete}
          />
        ))}
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
  onPickStatus: (t: SheetRow, newStatus: string) => void;
  onPickEdit: (t: SheetRow) => void;
  onPickDelete: (t: SheetRow) => void;
}

function TaskCard({
  task, urgency, busyKey, canDelete,
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
      className={`ac-task ac-task-urgency-${urgency} ${done ? "is-done" : ""} ${cancelled ? "is-cancelled" : ""}`}
    >
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
              onClick={() => onPickEdit(t)} title="แก้ไขงาน">แก้ไข</button>
            <button className="ac-btn ac-btn-ghost ac-btn-sm" disabled={busy}
              onClick={() => onPickStatus(t, "ยกเลิก")} title="ยกเลิกงานนี้">ยกเลิก</button>
          </>
        )}
        {(done || cancelled) && (
          <button className="ac-btn ac-btn-ghost ac-btn-sm" disabled={busy}
            onClick={() => onPickStatus(t, "ว่าง")} title="ดึงกลับเป็นยังไม่เสร็จ">คืน</button>
        )}
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
