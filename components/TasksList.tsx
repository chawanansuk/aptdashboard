"use client";
import { useState } from "react";
import type { SheetRow } from "@/types";

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
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [confirmDel, setConfirmDel] = useState<SheetRow | null>(null);
  const [saving, setSaving] = useState(false);

  async function postUpdate(payload: unknown) {
    const res = await fetch("/api/sheet/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "ไม่สำเร็จ");
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
        <div className="ac-empty">{emptyText || "ไม่มีงานในรายการนี้"}</div>
      </section>
    );
  }

  return (
    <section className="ac-tasks">
      <header className="ac-tasks-head">
        <h3 className="ac-tasks-title">
          {title} <span className="ac-tasks-count">({tasks.length})</span>
        </h3>
      </header>
      {err && <div className="ac-banner ac-banner-warn">{err}</div>}

      <div className="ac-tasks-list">
        {tasks.map((t) => {
          const k = `${t.date}|${t.building}|${t.room}|${t.type}`;
          const done = isDone(t.status);
          const cancelled = isCancelled(t.status);
          const dot = TYPE_COLOR[t.type] || "#64748B";

          return (
            <div key={k} className={`ac-task ${done ? "is-done" : ""} ${cancelled ? "is-cancelled" : ""}`}>
              <div className="ac-task-dot" style={{ background: dot }} />
              <div className="ac-task-main">
                <div className="ac-task-line1">
                  <span className="ac-task-type">{t.type}</span>
                  <span className="ac-task-room">{t.building}-{t.room}</span>
                  <span className="ac-task-date">{t.date}</span>
                </div>
                <div className="ac-task-line2">
                  {t.customer && <span>{t.customer}</span>}
                  {t.phone && <span>· {t.phone}</span>}
                  {t.note && <span className="ac-task-note">· {t.note}</span>}
                </div>
              </div>
              <div className="ac-task-actions">
                {!done && !cancelled && (
                  <>
                    <button className="ac-btn ac-btn-primary ac-btn-sm" disabled={busyKey === k}
                      onClick={() => changeStatus(t, "เสร็จ")}>
                      {busyKey === k ? "..." : "ปิดงาน"}
                    </button>
                    <button className="ac-btn ac-btn-ghost ac-btn-sm" disabled={busyKey === k}
                      onClick={() => openEdit(t)} title="แก้ไขงาน">แก้ไข</button>
                    <button className="ac-btn ac-btn-ghost ac-btn-sm" disabled={busyKey === k}
                      onClick={() => changeStatus(t, "ยกเลิก")} title="ยกเลิกงานนี้">ยกเลิก</button>
                  </>
                )}
                {(done || cancelled) && (
                  <button className="ac-btn ac-btn-ghost ac-btn-sm" disabled={busyKey === k}
                    onClick={() => changeStatus(t, "ว่าง")} title="ดึงกลับเป็นยังไม่เสร็จ">คืน</button>
                )}
                <button className="ac-btn ac-btn-danger ac-btn-sm" disabled={busyKey === k}
                  onClick={() => setConfirmDel(t)} title="ลบงานนี้ถาวร">ลบ</button>
                <span className={`ac-task-status ${done ? "is-done" : ""} ${cancelled ? "is-cancelled" : ""}`}>
                  {done ? "เสร็จแล้ว" : cancelled ? "ยกเลิก" : (t.status || "ว่าง")}
                </span>
              </div>
            </div>
          );
        })}
      </div>

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
                <input type="text" value={edit.date}
                  onChange={(e) => setEdit({ ...edit, date: e.target.value })}
                  placeholder="dd/MM/yyyy" />
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
