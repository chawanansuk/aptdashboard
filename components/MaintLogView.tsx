"use client";

import { useMemo, useState } from "react";
import type { Role } from "@/auth";
import type { RoomView, SheetRow } from "@/types";
import {
  buildPeriods, buildMaintDigest, digestToMarkdown, shortDate,
  COMMON_AREA_ROOM, MAINT_TYPES, type Period,
} from "@/lib/maintLog";
import { TASK_TYPE_COLOR } from "@/lib/constants";
import { canViewFinancials, canPerform } from "@/lib/permissions";
import { formatBaht } from "@/lib/money";
import { parseCostInput } from "@/lib/taskCost";
import { resilientPost } from "@/lib/resilientWrite";
import { toast } from "@/lib/toast";
import { publishBusEvent } from "@/lib/realtimeBus";
import { todayThaiDate } from "@/lib/moveoutTasks";

/**
 * บันทึกซ่อมบำรุง — the engineer section's week/month story:
 * what got fixed/cleaned where, per room AND common areas, with cost
 * totals, inline logging (incl. ส่วนกลาง), .md export and print.
 *
 * Data: digests the ALREADY-LOADED task feed (open + last 120 days) —
 * zero extra fetches; the view itself is lazy-loaded, so users who
 * never open it pay nothing.
 */

interface Props {
  tasks: SheetRow[];
  rooms: RoomView[];
  roles: Role[] | undefined;
  refresh: () => void;
  optimisticAddTask: (t: SheetRow) => void;
}

export default function MaintLogView({ tasks, rooms, roles, refresh, optimisticAddTask }: Props) {
  const periods = useMemo(() => buildPeriods(), []);
  const [periodKey, setPeriodKey] = useState(periods[0].key);
  const period: Period = periods.find((p) => p.key === periodKey) ?? periods[0];
  const [logOpen, setLogOpen] = useState(false);

  const canCost = canViewFinancials(roles);
  const canLog = canPerform(roles, "task.add.eng");
  const digest = useMemo(() => buildMaintDigest(tasks, period), [tasks, period]);

  function exportMd() {
    const md = digestToMarkdown(digest, period.label, { includeCost: canCost });
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `บันทึกซ่อมบำรุง-${period.label}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  const renderGroup = (g: ReturnType<typeof buildMaintDigest>["rooms"][number]) => (
    <div key={`${g.building}|${g.room}`} className="ac-mlog-room">
      <div className="ac-mlog-room-head">
        <span className="ac-mlog-room-name">
          {g.room === COMMON_AREA_ROOM ? `${g.building} · ส่วนกลาง` : `${g.building} ${g.room}`}
        </span>
        {canCost && g.cost > 0 && (
          <span className="ac-mlog-room-cost">{formatBaht(String(g.cost), { suffix: " ฿" })}</span>
        )}
      </div>
      <ul className="ac-mlog-list">
        {g.entries.map((e, i) => (
          <li key={i} className={`ac-mlog-item ${e.done ? "" : "is-open"}`}>
            <span className="ac-mlog-date">{shortDate(e.time)}</span>
            <span
              className="ac-mlog-type"
              style={{ background: `${TASK_TYPE_COLOR[e.task.type] || "#64748B"}22`, color: TASK_TYPE_COLOR[e.task.type] || "#64748B" }}
            >{e.task.type}</span>
            <span className="ac-mlog-note">
              {(e.task.note || "").trim() || e.task.type}
              {!e.done && <span className="ac-mlog-open-tag"> · ยังค้าง</span>}
            </span>
            {canCost && e.done && typeof e.task.cost === "number" && e.task.cost > 0 && (
              <span className="ac-mlog-cost">{e.task.cost.toLocaleString("th-TH")} บ.</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <section className="ac-mlog">
      <header className="ac-page-head ac-mlog-head">
        <div>
          <h2 className="ac-h2">🔧 บันทึกซ่อมบำรุง</h2>
          <p className="ac-text-muted ac-mlog-sub">
            งานซ่อม · ทำสะอาด · งานส่วนกลาง — ย้อนดูได้ ~4 เดือน (เก่ากว่านั้นดูในชีตรายงาน)
          </p>
        </div>
        <div className="ac-mlog-actions ac-no-print">
          {canLog && (
            <button className="ac-btn ac-btn-primary" onClick={() => setLogOpen(true)}>
              + ลงบันทึกงาน
            </button>
          )}
          <button className="ac-btn ac-btn-ghost" onClick={exportMd} title="ดาวน์โหลดสรุปช่วงนี้เป็นไฟล์ .md">
            ⬇ .md
          </button>
          <button className="ac-btn ac-btn-ghost" onClick={() => window.print()}>🖨 พิมพ์</button>
        </div>
      </header>

      {/* Period chips */}
      <div className="ac-chips ac-mlog-periods ac-no-print" role="tablist" aria-label="เลือกช่วงเวลา">
        {periods.map((p) => (
          <button
            key={p.key}
            className={`ac-chip ${p.key === periodKey ? "is-active" : ""}`}
            onClick={() => setPeriodKey(p.key)}
            role="tab"
            aria-selected={p.key === periodKey}
          >{p.label}</button>
        ))}
      </div>

      {/* Summary strip */}
      <div className="ac-mlog-summary">
        <div className="ac-mlog-stat">
          <span className="ac-mlog-stat-num">{digest.doneCount}</span>
          <span className="ac-mlog-stat-label">งานเสร็จ</span>
        </div>
        {digest.countsByType.map(([t, n]) => (
          <div key={t} className="ac-mlog-stat">
            <span className="ac-mlog-stat-num" style={{ color: TASK_TYPE_COLOR[t] || undefined }}>{n}</span>
            <span className="ac-mlog-stat-label">{t}</span>
          </div>
        ))}
        {digest.openCount > 0 && (
          <div className="ac-mlog-stat is-warn">
            <span className="ac-mlog-stat-num">{digest.openCount}</span>
            <span className="ac-mlog-stat-label">ยังค้าง</span>
          </div>
        )}
        {canCost && digest.totalCost > 0 && (
          <div className="ac-mlog-stat is-cost">
            <span className="ac-mlog-stat-num">{digest.totalCost.toLocaleString("th-TH")}</span>
            <span className="ac-mlog-stat-label">ค่าใช้จ่าย (บาท)</span>
          </div>
        )}
      </div>

      {digest.rooms.length === 0 && digest.common.length === 0 ? (
        <div className="ac-empty">
          <div className="ac-empty-icon">🧰</div>
          <p>ยังไม่มีงานซ่อมบำรุงใน{period.label}</p>
          {canLog && (
            <button className="ac-btn ac-btn-primary" onClick={() => setLogOpen(true)}>
              + ลงบันทึกงานแรก
            </button>
          )}
        </div>
      ) : (
        <>
          {digest.rooms.length > 0 && (
            <div className="ac-fs ac-mlog-section">
              <header className="ac-fs-head"><div className="ac-fs-title">🏠 รายห้อง</div></header>
              <div className="ac-mlog-rooms">{digest.rooms.map(renderGroup)}</div>
            </div>
          )}
          {digest.common.length > 0 && (
            <div className="ac-fs ac-mlog-section">
              <header className="ac-fs-head"><div className="ac-fs-title">🏢 พื้นที่ส่วนกลาง</div></header>
              <div className="ac-mlog-rooms">{digest.common.map(renderGroup)}</div>
            </div>
          )}
        </>
      )}

      {logOpen && (
        <LogModal
          rooms={rooms}
          onClose={() => setLogOpen(false)}
          refresh={refresh}
          optimisticAddTask={optimisticAddTask}
        />
      )}
    </section>
  );
}

/* ====================================================================
 * LogModal — quick maintenance entry: a room OR a common area.
 * Common-area convention: room column = "ส่วนกลาง", the spot goes at
 * the head of the note ("[โถงชั้น 1] เปลี่ยนหลอดไฟ").
 * ==================================================================== */

function LogModal({ rooms, onClose, refresh, optimisticAddTask }: {
  rooms: RoomView[];
  onClose: () => void;
  refresh: () => void;
  optimisticAddTask: (t: SheetRow) => void;
}) {
  const buildings = useMemo(
    () => Array.from(new Set(rooms.map((r) => r.building))),
    [rooms],
  );
  const [area, setArea] = useState<"room" | "common">("room");
  const [building, setBuilding] = useState(buildings[0] || "");
  const [room, setRoom] = useState("");
  const [spot, setSpot] = useState("");
  const [type, setType] = useState<string>("ซ่อม");
  const [note, setNote] = useState("");
  const [cost, setCost] = useState("");
  const [doneAlready, setDoneAlready] = useState(true);
  const [saving, setSaving] = useState(false);

  const roomOptions = useMemo(
    () => rooms.filter((r) => r.building === building).map((r) => r.room),
    [rooms, building],
  );

  async function submit() {
    const detail = note.trim();
    if (!detail) { toast.error("กรอกรายละเอียดงานก่อน"); return; }
    if (area === "room" && !room.trim()) { toast.error("เลือกห้องก่อน"); return; }
    const finalRoom = area === "room" ? room.trim() : COMMON_AREA_ROOM;
    const finalNote = area === "common" && spot.trim() ? `[${spot.trim()}] ${detail}` : detail;
    const costNum = cost ? parseCostInput(cost) : 0;
    const body = {
      action: "addTask",
      date: todayThaiDate(),
      type,
      building,
      room: finalRoom,
      note: finalNote,
      ...(doneAlready ? { status: "เสร็จ" } : {}),
      ...(costNum > 0 ? { cost: costNum } : {}),
    };
    setSaving(true);
    try {
      const { data } = await resilientPost("/api/sheet/update", body);
      if (!data.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      if (data.skipped) {
        toast.info("มีงานแบบเดียวกันของวันนี้อยู่แล้ว — ไม่บันทึกซ้ำ");
      } else {
        toast.success("ลงบันทึกแล้ว ✓");
        optimisticAddTask({
          date: todayThaiDate(), type, building, room: finalRoom,
          customer: "", phone: "", note: finalNote,
          status: doneAlready ? "เสร็จ" : "",
          ...(costNum > 0 ? { cost: costNum } : {}),
        });
      }
      publishBusEvent({ kind: "data-changed", source: "task", ts: Date.now() });
      refresh();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ", {
        description: "ข้อมูลในฟอร์มยังอยู่ ลองกดบันทึกอีกครั้ง",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ac-modal-backdrop" onClick={onClose}>
      <div className="ac-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="ลงบันทึกงานซ่อมบำรุง">
        <header className="ac-modal-head">
          <div className="ac-modal-title">📝 ลงบันทึกงานซ่อมบำรุง</div>
          <button type="button" className="ac-modal-close" onClick={onClose} aria-label="ปิด">✕</button>
        </header>
        <div className="ac-modal-body">
          {/* Area toggle */}
          <div className="ac-mlog-areatoggle" role="radiogroup" aria-label="พื้นที่">
            <button
              type="button"
              className={`ac-btn ${area === "room" ? "ac-btn-primary" : "ac-btn-ghost"}`}
              onClick={() => setArea("room")}
              aria-pressed={area === "room"}
            >🏠 ห้องพัก</button>
            <button
              type="button"
              className={`ac-btn ${area === "common" ? "ac-btn-primary" : "ac-btn-ghost"}`}
              onClick={() => setArea("common")}
              aria-pressed={area === "common"}
            >🏢 ส่วนกลาง</button>
          </div>

          <div className="ac-field">
            <label htmlFor="mlog-bld">ตึก</label>
            <select id="mlog-bld" value={building} onChange={(e) => setBuilding(e.target.value)}>
              {buildings.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          {area === "room" ? (
            <div className="ac-field">
              <label htmlFor="mlog-room">ห้อง</label>
              <input
                id="mlog-room" list="mlog-room-list" value={room}
                onChange={(e) => setRoom(e.target.value)} placeholder="เช่น 204"
              />
              <datalist id="mlog-room-list">
                {roomOptions.map((r) => <option key={r} value={r} />)}
              </datalist>
            </div>
          ) : (
            <div className="ac-field">
              <label htmlFor="mlog-spot">จุด/บริเวณ (ไม่บังคับ)</label>
              <input
                id="mlog-spot" value={spot} onChange={(e) => setSpot(e.target.value)}
                placeholder="เช่น โถงชั้น 1, ลานจอดรถ, ดาดฟ้า"
              />
            </div>
          )}

          <div className="ac-field">
            <label htmlFor="mlog-type">ประเภท</label>
            <select id="mlog-type" value={type} onChange={(e) => setType(e.target.value)}>
              {MAINT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="ac-field">
            <label htmlFor="mlog-note">ทำอะไรไป *</label>
            <textarea
              id="mlog-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น เปลี่ยนหลอดไฟทางเดิน 2 หลอด / ล้างแอร์ / เติมน้ำยาถังดับเพลิง / ทาสีรั้ว"
            />
          </div>

          <div className="ac-field">
            <label htmlFor="mlog-cost">ค่าใช้จ่าย (บาท ไม่บังคับ)</label>
            <input
              id="mlog-cost" inputMode="numeric" value={cost}
              onChange={(e) => setCost(e.target.value)} placeholder="เช่น 350"
            />
          </div>

          <label className="ac-mlog-donechk">
            <input
              type="checkbox" checked={doneAlready}
              onChange={(e) => setDoneAlready(e.target.checked)}
            />
            <span>งานเสร็จแล้ว (ติ๊กออกถ้าเพิ่งเริ่ม/ยังไม่เสร็จ)</span>
          </label>
        </div>
        <footer className="ac-modal-foot">
          <button className="ac-btn ac-btn-ghost" onClick={onClose} disabled={saving}>ยกเลิก</button>
          <button className="ac-btn ac-btn-primary" onClick={() => void submit()} disabled={saving}>
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </footer>
      </div>
    </div>
  );
}
