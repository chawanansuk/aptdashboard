"use client";
import { Icon } from "@/lib/icons";

import { useEffect, useMemo, useState } from "react";
import { parseThaiDate } from "@/lib/dateUtils";
import type { Role } from "@/auth";
import EmptyState from "./EmptyState";
import type { Part, Requisition, RoomView, SheetRow } from "@/types";
import {
  buildPeriods, buildMaintDigest, digestToMarkdown, shortDate, groupLabel, type Period,
} from "@/lib/maintLog";
import { TASK_TYPE_COLOR } from "@/lib/constants";
import { canViewFinancials, canAccess } from "@/lib/permissions";
import { formatBaht } from "@/lib/money";
import { toast } from "@/lib/toast";
import { useFocusTrap } from "@/lib/useFocusTrap";
import AiReportModal from "./AiReportModal";
import PageHeader from "./PageHeader";
import RepairLogModal from "./RepairLogModal";

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
  /** ฟิลเตอร์ตึกจากแถบบน (r23) — เดิมหน้านี้เป็นหน้าเดียวในแอปที่เมิน
   *  แถบเลือกตึก กดแล้วไม่มีอะไรเกิดขึ้น. */
  activeBuilding?: string;
  refresh: () => void;
  optimisticAddTask: (t: SheetRow) => void;
}

export default function MaintLogView({ tasks, rooms, roles, activeBuilding = "ทั้งหมด", refresh, optimisticAddTask }: Props) {
  const periods = useMemo(() => buildPeriods(), []);
  const [periodKey, setPeriodKey] = useState(periods[0].key);
  const period: Period = periods.find((p) => p.key === periodKey) ?? periods[0];
  const [logOpen, setLogOpen] = useState(false);
  // r31: AI สรุปช่วงนี้เป็นรายงาน LINE
  const [reportOpen, setReportOpen] = useState(false);
  // r23: กดการ์ดสถิติเพื่อกรองรายการข้างล่าง (ประเภท / เฉพาะยังค้าง)
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [openOnly, setOpenOnly] = useState(false);
  const [search, setSearch] = useState("");

  const scopedTasks = useMemo(
    () => activeBuilding === "ทั้งหมด" ? tasks : tasks.filter((t) => t.building === activeBuilding),
    [tasks, activeBuilding],
  );

  const canCost = canViewFinancials(roles);
  // ค่าอะไหล่ที่เบิกในช่วง (r9) — requisitions × part price. Loaded once
  // when the view opens; any failure (network / role without part.view)
  // simply hides the stat.
  const [reqRows, setReqRows] = useState<Requisition[] | null>(null);
  const [partPrice, setPartPrice] = useState<Map<string, number> | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [reqRes, partRes] = await Promise.all([
          fetch("/api/part-requisitions", { cache: "no-store" }),
          fetch("/api/parts", { cache: "no-store" }),
        ]);
        if (!reqRes.ok || !partRes.ok) return;
        const reqData = await reqRes.json();
        const partData = await partRes.json();
        if (!alive) return;
        setReqRows((reqData.rows || []) as Requisition[]);
        const m = new Map<string, number>();
        for (const p of (partData.rows || []) as Part[]) {
          if (p.price && p.price > 0) m.set(p.id, p.price);
        }
        setPartPrice(m);
      } catch { /* stat stays hidden */ }
    })();
    return () => { alive = false; };
  }, []);

  const partsSpend = useMemo(() => {
    if (!reqRows || !partPrice) return 0;
    let sum = 0;
    for (const r of reqRows) {
      const d = parseThaiDate((r.createdAt || "").split(" ")[0]);
      if (!d) continue;
      const ts = d.setHours(0, 0, 0, 0);
      if (ts < period.start || ts >= period.end) continue;
      const price = partPrice.get(r.partId);
      if (price) sum += price * (r.quantity || 0);
    }
    return sum;
  }, [reqRows, partPrice, period]);
  // Anyone who can OPEN this view can log work in it — gating on
  // task.add.eng hid the button from sales, contradicting ทิศ B
  // (sales operates the app for engineers). Audit r8 bug #1.
  const canLog = canAccess(roles, "maintlog");
  const digest = useMemo(() => buildMaintDigest(scopedTasks, period), [scopedTasks, period]);

  // รายการที่โชว์ = digest กรองตามการ์ดสถิติ + ช่องค้นหา. สถิติด้านบนคง
  // ตัวเลขรวมของช่วงเสมอ (การ์ดคือ "ปุ่มกรอง" ไม่ใช่ผลลัพธ์ของตัวกรอง);
  // export/print ใช้ digest เต็มเช่นกัน — ไฟล์รายงานไม่ควรหายตามฟิลเตอร์.
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filterGroup = (g: (typeof digest.rooms)[number]) => {
      const entries = g.entries.filter((e) => {
        if (typeFilter && e.task.type !== typeFilter) return false;
        if (openOnly && e.done) return false;
        if (q) {
          const hay = `${g.building} ${g.room} ${e.task.note || ""} ${e.task.type}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
      if (!entries.length) return null;
      // ยอดเงินหัวกลุ่มต้องตามรายการที่โชว์จริง ไม่ใช่ยอดเต็มช่วง
      const cost = entries.reduce(
        (s, e) => s + (e.done && typeof e.task.cost === "number" ? e.task.cost : 0), 0);
      return { ...g, entries, cost };
    };
    const notNull = <T,>(x: T | null): x is T => x !== null;
    return {
      rooms: digest.rooms.map(filterGroup).filter(notNull),
      common: digest.common.map(filterGroup).filter(notNull),
    };
  }, [digest, typeFilter, openOnly, search]);

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
        <span className="ac-mlog-room-name">{groupLabel(g)}</span>
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
      <PageHeader
        title={`บันทึกซ่อมบำรุง${activeBuilding !== "ทั้งหมด" ? ` · ${activeBuilding}` : ""}`} icon="maintenance"
        subtitle="งานซ่อม · ทำสะอาด · งานส่วนกลาง — ย้อนดูได้ ~4 เดือน (เก่ากว่านั้นดูในชีตรายงาน)"
        actions={<>
          {canLog && (
            <button className="ac-btn ac-btn-primary" onClick={() => setLogOpen(true)}>
              + ลงบันทึกงาน
            </button>
          )}
          <button
            className="ac-btn ac-btn-secondary"
            onClick={() => setReportOpen(true)}
            disabled={digest.rooms.length === 0 && digest.common.length === 0}
            title="ให้ AI เขียนสรุปช่วงนี้เป็นข้อความอ่านง่าย คัดลอกส่งกลุ่ม LINE ได้เลย"
          ><Icon name="ai" /> สรุปส่ง LINE</button>
          <button className="ac-btn ac-btn-ghost" onClick={exportMd} title="ดาวน์โหลดสรุปช่วงนี้เป็นไฟล์ Markdown (เปิดใน LINE/Notes ได้)">
            <Icon name="download" /> ส่งออก
          </button>
          <button className="ac-btn ac-btn-ghost" onClick={() => window.print()}><Icon name="print" /> พิมพ์</button>
        </>}
      />

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

      {/* Summary strip — การ์ดประเภท/ยังค้าง กดเพื่อกรองรายการข้างล่างได้ (r23) */}
      <div className="ac-mlog-summary">
        <button
          type="button"
          className="ac-mlog-stat ac-mlog-stat-btn"
          onClick={() => { setTypeFilter(null); setOpenOnly(false); }}
          title="ดูทั้งหมด"
        >
          <span className="ac-mlog-stat-num">{digest.doneCount}</span>
          <span className="ac-mlog-stat-label">งานเสร็จ</span>
        </button>
        {digest.countsByType.map(([t, n]) => (
          <button
            key={t}
            type="button"
            className={`ac-mlog-stat ac-mlog-stat-btn ${typeFilter === t ? "is-active" : ""}`}
            onClick={() => { setTypeFilter((cur) => (cur === t ? null : t)); setOpenOnly(false); }}
            title={typeFilter === t ? "กดอีกครั้งเพื่อเลิกกรอง" : `ดูเฉพาะ${t}`}
            aria-pressed={typeFilter === t}
          >
            <span className="ac-mlog-stat-num" style={{ color: TASK_TYPE_COLOR[t] || undefined }}>{n}</span>
            <span className="ac-mlog-stat-label">{t}</span>
          </button>
        ))}
        {digest.openCount > 0 && (
          <button
            type="button"
            className={`ac-mlog-stat ac-mlog-stat-btn is-warn ${openOnly ? "is-active" : ""}`}
            onClick={() => { setOpenOnly((v) => !v); setTypeFilter(null); }}
            title={openOnly ? "กดอีกครั้งเพื่อเลิกกรอง" : "ดูเฉพาะงานที่ยังค้าง"}
            aria-pressed={openOnly}
          >
            <span className="ac-mlog-stat-num">{digest.openCount}</span>
            <span className="ac-mlog-stat-label">ยังค้าง</span>
          </button>
        )}
        {canCost && digest.totalCost > 0 && (
          <div className="ac-mlog-stat is-cost">
            <span className="ac-mlog-stat-num">{digest.totalCost.toLocaleString("th-TH")}</span>
            <span className="ac-mlog-stat-label">ค่าใช้จ่าย (บาท)</span>
          </div>
        )}
        {canCost && partsSpend > 0 && (
          <div className="ac-mlog-stat is-cost">
            <span className="ac-mlog-stat-num">{partsSpend.toLocaleString("th-TH")}</span>
            <span className="ac-mlog-stat-label">ค่าอะไหล่ที่เบิก (บาท)</span>
          </div>
        )}
      </div>

      {/* ค้นหาในบันทึก (r23) — 4 เดือน × 5 ตึก ไล่หาด้วยตายาก */}
      <div className="ac-search ac-search-full ac-no-print ac-mlog-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input
          type="text"
          placeholder="ค้นหาในบันทึก เช่น หลอดไฟ / แอร์ / เลขห้อง..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* V2: these two were the app's only remaining hand-rolled empty
          states (.ac-empty — a dashed box with an emoji). They use the
          shared EmptyState component like every other view now. */}
      {digest.rooms.length === 0 && digest.common.length === 0 ? (
        <EmptyState
          icon="maintenance"
          title={`ยังไม่มีงานซ่อมบำรุงใน${period.label}${activeBuilding !== "ทั้งหมด" ? ` ของ${activeBuilding}` : ""}`}
          action={canLog ? { label: "+ ลงบันทึกงานแรก", onClick: () => setLogOpen(true) } : undefined}
        />
      ) : shown.rooms.length === 0 && shown.common.length === 0 ? (
        <EmptyState
          icon="search"
          tone="warning"
          title="ไม่พบรายการตามเงื่อนไขที่กรอง"
          action={{
            label: "ล้างตัวกรอง",
            onClick: () => { setTypeFilter(null); setOpenOnly(false); setSearch(""); },
          }}
        />
      ) : (
        <>
          {shown.rooms.length > 0 && (
            <div className="ac-fs ac-mlog-section">
              <header className="ac-fs-head"><div className="ac-fs-title"><Icon name="doorOpen" /> รายห้อง</div></header>
              <div className="ac-mlog-rooms">{shown.rooms.map(renderGroup)}</div>
            </div>
          )}
          {shown.common.length > 0 && (
            <div className="ac-fs ac-mlog-section">
              <header className="ac-fs-head"><div className="ac-fs-title"><Icon name="facilities" /> พื้นที่ส่วนกลาง</div></header>
              <div className="ac-mlog-rooms">{shown.common.map(renderGroup)}</div>
            </div>
          )}
        </>
      )}

      <AiReportModal
        open={reportOpen}
        periodLabel={period.label}
        digestMarkdown={digestToMarkdown(digest, period.label, { includeCost: canCost })}
        onClose={() => setReportOpen(false)}
      />
      {logOpen && (
        <RepairLogModal
          rooms={rooms}
          tasks={tasks}
          roles={roles}
          initialBuilding={activeBuilding !== "ทั้งหมด" ? activeBuilding : undefined}
          onClose={() => setLogOpen(false)}
          refresh={refresh}
          optimisticAddTask={optimisticAddTask}
        />
      )}
    </section>
  );
}
