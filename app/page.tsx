"use client";

import { useEffect, useMemo, useState } from "react";
import { useDashboardData } from "@/lib/useDashboardData";
import type { RoomStatus, RoomView, SheetRow } from "@/types";
import TasksList from "@/components/TasksList";
import SummaryDrawer from "@/components/SummaryDrawer";

const STATUS_LABEL: Record<RoomStatus, string> = {
  occupied: "มีผู้เช่า",
  ready: "พร้อมขาย",
  pending: "รอสัญญา",
  moveout: "แจ้งย้ายออก",
  qc: "รอตรวจ/QC",
  repair: "รอเข้าซ่อม",
  inactive: "ไม่ได้ใช้งาน",
};

const STATUS_DOT: Record<RoomStatus, string> = {
  occupied: "#1E293B",
  ready: "#22C55E",
  pending: "#A855F7",
  moveout: "#EF4444",
  qc: "#F97316",
  repair: "#EAB308",
  inactive: "#E2E8F0",
};

const STATUS_KEYS: RoomStatus[] = ["occupied","ready","pending","moveout","qc","repair","inactive"];

const FILTER_CHIPS: { key: "all" | RoomStatus; label: string }[] = [
  { key: "all", label: "ทุกสถานะ" },
  { key: "ready", label: "ว่าง" },
  { key: "moveout", label: "แจ้งย้ายออก" },
  { key: "repair", label: "รอซ่อม" },
];

const RAW_STATUS_OPTIONS = ["มีคนอยู่", "ว่าง", "รอสัญญา", "แจ้งย้ายออก", "ปรับปรุง"];

function fmtPrice(p: string) {
  const n = parseInt((p || "").replace(/[^0-9]/g, ""), 10);
  if (!n) return "-";
  return n.toLocaleString("th-TH");
}

function isDoneStatus(s: string): boolean {
  const t = (s || "").trim();
  return t === "เสร็จ" || t === "done" || t === "ปิดแล้ว";
}
function isCancelledStatus(s: string): boolean {
  const t = (s || "").trim();
  return t === "ยกเลิก" || t === "cancelled";
}

// Map sidebar task views to ประเภทงาน in sheet
const VIEW_TO_TASK_TYPE: Partial<Record<RoomStatus, string[]>> = {
  moveout: ["ย้ายออก"],
  qc: ["ทำสะอาด"],
  repair: ["ซ่อม"],
};

const VIEW_LABEL: Record<string, string> = {
  today: "งานวันนี้",
  moveout: "งานย้ายออก",
  qc: "งานทำสะอาด/QC",
  repair: "งานรอซ่อม",
};

export default function Home() {
  const { status, rooms, errors, lastUpdated, refresh, tasks } = useDashboardData() as ReturnType<typeof useDashboardData> & { tasks: SheetRow[] };
  const [summaryOpen, setSummaryOpen] = useState(false);

  const buildings = useMemo(() => {
    const set = new Set<string>();
    rooms.forEach((r) => r.building && set.add(r.building));
    return Array.from(set).sort();
  }, [rooms]);

  const [activeBuilding, setActiveBuilding] = useState<string>("ทั้งหมด");
  const [activeFilter, setActiveFilter] = useState<"all" | RoomStatus>("all");
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState<"overview" | "today" | RoomStatus>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<RoomView | null>(null);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  // add-task state
  const [showAddTask, setShowAddTask] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [tDate, setTDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [tType, setTType] = useState<string>("ย้ายเข้า");
  const [tBuilding, setTBuilding] = useState<string>("");
  const [tRoom, setTRoom] = useState<string>("");
  const [tCustomer, setTCustomer] = useState<string>("");
  const [tPhone, setTPhone] = useState<string>("");
  const [tNote, setTNote] = useState<string>("");

  // edit state for room modal
  const [saving, setSaving] = useState(false);
  const [editStatus, setEditStatus] = useState("");
  const [editTenant, setEditTenant] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editContractEnd, setEditContractEnd] = useState("");
  const [editNote, setEditNote] = useState("");

  useEffect(() => {
    if (selectedRoom) {
      setEditStatus(selectedRoom.rawStatus || "");
      setEditTenant(selectedRoom.tenant || "");
      setEditPhone(selectedRoom.phone || "");
      setEditContractEnd(selectedRoom.contractEnd || "");
      setEditNote("");
    }
  }, [selectedRoom]);

  useEffect(() => {
    const onResize = () => { if (window.innerWidth > 980) setSidebarOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const visibleRooms = useMemo(() => {
    return rooms.filter((r) => {
      if (activeBuilding !== "ทั้งหมด" && r.building !== activeBuilding) return false;
      if (activeView === "today" && !r.today) return false;
      if (activeView !== "overview" && activeView !== "today" && r.status !== activeView) return false;
      if (activeFilter !== "all" && r.status !== activeFilter) return false;
      const q = search.trim().toLowerCase();
      if (q && !r.room.toLowerCase().includes(q) && !r.building.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rooms, activeBuilding, activeView, activeFilter, search]);

  // tasks list filtered by active view
  const visibleTasks = useMemo(() => {
    const list = (tasks || []).slice();
    const types = activeView === "today" ? null : VIEW_TO_TASK_TYPE[activeView as RoomStatus];

    return list.filter((t) => {
      if (activeBuilding !== "ทั้งหมด" && t.building !== activeBuilding) return false;
      if (types && !types.includes(t.type)) return false;
      if (activeView === "today") {
        const d = new Date();
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const today = `${dd}/${mm}/${d.getFullYear()}`;
        if (t.date !== today) return false;
        if (isDoneStatus(t.status) || isCancelledStatus(t.status)) return false;
      }
      const q = search.trim().toLowerCase();
      if (q && !t.room.toLowerCase().includes(q) && !t.building.toLowerCase().includes(q) && !(t.customer || "").toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }, [tasks, activeView, activeBuilding, search]);

  const showTasksView = activeView === "today" || activeView === "moveout" || activeView === "qc" || activeView === "repair";

  const stats = useMemo(() => {
    const scope = activeBuilding === "ทั้งหมด" ? rooms : rooms.filter((r) => r.building === activeBuilding);
    let total = 0, ready = 0, moveout = 0, repair = 0;
    scope.forEach((r) => {
      total++;
      if (r.status === "ready") ready++;
      if (r.status === "moveout") moveout++;
      if (r.status === "repair" || r.status === "qc") repair++;
    });
    return { total, ready, moveout, repair };
  }, [rooms, activeBuilding]);

  const sidebarCounts = useMemo(() => {
    const scope = activeBuilding === "ทั้งหมด" ? rooms : rooms.filter((r) => r.building === activeBuilding);
    const c: Record<string, number> = { today: 0 };
    STATUS_KEYS.forEach((k) => (c[k] = 0));
    scope.forEach((r) => { c[r.status]++; if (r.today) c.today++; });
    return { ...c, total: scope.length };
  }, [rooms, activeBuilding]);

  const floorGroups = useMemo(() => {
    const map = new Map<string, RoomView[]>();
    visibleRooms.forEach((r) => {
      const k = r.floor || "-";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    });
    return Array.from(map.entries())
      .map(([floor, list]) => ({ floor, list: list.sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true })) }))
      .sort((a, b) => (a.floor || "").localeCompare(b.floor || "", undefined, { numeric: true }));
  }, [visibleRooms]);

  const buildingTabs = useMemo(() => ["ทั้งหมด", ...buildings], [buildings]);

  async function handleAddTask() {
    if (!tBuilding || !tRoom) { setToast({type:"err", msg:"กรอกตึกและเลขห้อง"}); return; }
    setSavingTask(true);
    try {
      const res = await fetch("/api/sheet/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addTask",
          date: tDate,
          type: tType,
          building: tBuilding,
          room: tRoom,
          customer: tCustomer,
          phone: tPhone,
          note: tNote,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setToast({type:"ok", msg:"เพิ่มงานแล้ว — รีเฟรชข้อมูล"});
        setShowAddTask(false);
        setTCustomer(""); setTPhone(""); setTNote(""); setTRoom("");
        refresh();
      } else {
        setToast({type:"err", msg: data.error || "เพิ่มงานไม่สำเร็จ"});
      }
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : "Network error";
      setToast({type:"err", msg: m});
    } finally {
      setSavingTask(false);
    }
  }

  async function handleSave() {
    if (!selectedRoom) return;
    setSaving(true);
    try {
      const res = await fetch("/api/sheet/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateRoomStatus",
          building: selectedRoom.building,
          room: selectedRoom.room,
          status: editStatus,
          tenant: editTenant,
          phone: editPhone,
          contractEnd: editContractEnd,
          note: editNote,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setToast({type:"ok", msg:"บันทึกแล้ว — รีเฟรชข้อมูล"});
        setSelectedRoom(null);
        refresh();
      } else {
        setToast({type:"err", msg: data.error || "บันทึกไม่สำเร็จ"});
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      setToast({type:"err", msg: msg});
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ac-app">
      <header className="ac-nav">
        <div className="ac-nav-left">
          <button className="ac-hamburger" aria-label="เมนู" onClick={() => setSidebarOpen((v) => !v)}>
            <span /><span /><span />
          </button>
          <div className="ac-logo"><div className="ac-logo-icon">A</div><span className="ac-logo-text">APARTCLOUD</span></div>
          <span className="ac-mode-badge">SALES MODE</span>
          <div className="ac-divider" />
          <nav className="ac-tabs">
            {buildingTabs.map((b) => (
              <button key={b} className={`ac-tab ${activeBuilding === b ? "is-active" : ""}`} onClick={() => setActiveBuilding(b)}>{b}</button>
            ))}
          </nav>
          <select className="ac-tabs-select" value={activeBuilding} onChange={(e) => setActiveBuilding(e.target.value)}>
            {buildingTabs.map((b) => (<option key={b} value={b}>{b}</option>))}
          </select>
        </div>
        <div className="ac-nav-right">
          <button className="ac-add-btn" onClick={() => setShowAddTask(true)} title="เพิ่มงานใหม่">+ เพิ่มงาน</button>
          <button className="ac-icon-btn" aria-label="รีเฟรช" onClick={refresh} title="รีเฟรช">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
          </button>
          <div className="ac-last-updated">อัปเดต: {lastUpdated || "-"}</div>
          <button className="ac-summary-btn" onClick={() => setSummaryOpen(true)}>SUMMARY</button>
          <div className="ac-avatar">CS</div>
        </div>
      </header>

      <div className="ac-body">
        <aside className={`ac-side ${sidebarOpen ? "is-open" : ""}`}>
          <div className="ac-side-group">
            <div className="ac-side-label">วันนี้</div>
            <button className={`ac-side-item ${activeView === "overview" ? "is-active" : ""}`} onClick={() => setActiveView("overview")}>
              <span className="ac-side-icon">▦</span>
              <span className="ac-side-text">ภาพรวม</span>
              <span className="ac-badge ac-badge-indigo">{sidebarCounts.total}</span>
            </button>
            <button className={`ac-side-item ${activeView === "today" ? "is-active" : ""}`} onClick={() => setActiveView("today")}>
              <span className="ac-side-icon">●</span>
              <span className="ac-side-text">งานวันนี้</span>
              <span className="ac-badge ac-badge-red">{sidebarCounts.today}</span>
            </button>
          </div>
          <div className="ac-side-group">
            <div className="ac-side-label">สถานะห้อง</div>
            {(["ready","pending","occupied"] as RoomStatus[]).map((s) => (
              <button key={s} className={`ac-side-item ${activeView === s ? "is-active" : ""}`} onClick={() => setActiveView(s)}>
                <span className="ac-side-icon" style={{ color: STATUS_DOT[s] }}>●</span>
                <span className="ac-side-text">{STATUS_LABEL[s]}</span>
                <span className={`ac-badge ${s === "ready" ? "ac-badge-green" : s === "pending" ? "ac-badge-indigo" : "ac-badge-slate"}`}>{sidebarCounts[s] || 0}</span>
              </button>
            ))}
          </div>
          <div className="ac-side-group">
            <div className="ac-side-label">งาน</div>
            {(["moveout","qc","repair","inactive"] as RoomStatus[]).map((s) => (
              <button key={s} className={`ac-side-item ${activeView === s ? "is-active" : ""}`} onClick={() => setActiveView(s)}>
                <span className="ac-side-icon" style={{ color: STATUS_DOT[s] }}>●</span>
                <span className="ac-side-text">{STATUS_LABEL[s]}</span>
                <span className={`ac-badge ${s === "moveout" ? "ac-badge-red" : s === "qc" ? "ac-badge-orange" : s === "repair" ? "ac-badge-yellow" : "ac-badge-empty"}`}>{sidebarCounts[s] || 0}</span>
              </button>
            ))}
          </div>
        </aside>

        {sidebarOpen && <div className="ac-side-backdrop" onClick={() => setSidebarOpen(false)} />}

        <main className="ac-main">
          {errors.length > 0 && (
            <div className="ac-banner ac-banner-warn">
              <strong>⚠ ต้องตั้งค่าชีต:</strong>{" "}
              {errors.map((e, i) => (<span key={i}>{e}{i < errors.length - 1 ? " • " : ""}</span>))}{" "}
              <a href="https://github.com/chawanansuk/aptdashboard/blob/main/docs/SETUP.md" target="_blank" rel="noreferrer">วิธีตั้งค่า</a>
            </div>
          )}

          {!showTasksView && (
            <>
              <section className="ac-sg">
                <div className="ac-sc"><div className="ac-si ac-si-indigo">▦</div><div className="ac-sc-body"><div className="ac-sc-label">ทั้งหมด</div><div className="ac-sc-num">{stats.total}</div><div className="ac-sc-sub ac-sub-info">{activeBuilding === "ทั้งหมด" ? "ทุกตึก" : activeBuilding}</div></div></div>
                <div className="ac-sc"><div className="ac-si ac-si-green">✓</div><div className="ac-sc-body"><div className="ac-sc-label">ว่าง / พร้อมขาย</div><div className="ac-sc-num">{stats.ready}</div><div className="ac-sc-sub ac-sub-info">พร้อมเสนอลูกค้า</div></div></div>
                <div className="ac-sc"><div className="ac-si ac-si-orange">↗</div><div className="ac-sc-body"><div className="ac-sc-label">แจ้งย้ายออก</div><div className="ac-sc-num">{stats.moveout}</div><div className="ac-sc-sub ac-sub-urgent">ต้องติดตาม</div></div></div>
                <div className="ac-sc"><div className="ac-si ac-si-red">⚒</div><div className="ac-sc-body"><div className="ac-sc-label">ซ่อม / QC</div><div className="ac-sc-num">{stats.repair}</div><div className="ac-sc-sub ac-sub-urgent">รอดำเนินการ</div></div></div>
              </section>

              <section className="ac-fb">
                <div className="ac-chips">
                  {FILTER_CHIPS.map((c) => (<button key={c.key} className={`ac-chip ${activeFilter === c.key ? "is-active" : ""}`} onClick={() => setActiveFilter(c.key)}>{c.label}</button>))}
                </div>
                <div className="ac-search">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                  <input type="text" placeholder="ค้นหาเลขห้อง/ตึก..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              </section>

              <section className="ac-legend">
                {STATUS_KEYS.map((s) => (<div key={s} className="ac-legend-item"><span className="ac-legend-dot" style={{ background: STATUS_DOT[s] }} /><span>{STATUS_LABEL[s]}</span></div>))}
                <div className="ac-legend-item"><span className="ac-legend-dot ac-legend-today" /><span>งานวันนี้</span></div>
              </section>

              {status === "error" && (
                <div className="ac-empty ac-empty-error">
                  ไม่สามารถโหลดข้อมูลได้ ตรวจสอบ ENV และ publish CSV ของ Google Sheet
                  <button className="ac-btn ac-btn-primary" onClick={refresh} style={{marginLeft:8}}>ลองอีกครั้ง</button>
                </div>
              )}

              {floorGroups.map((g) => {
                const counts: Record<RoomStatus, number> = { occupied:0, ready:0, pending:0, moveout:0, qc:0, repair:0, inactive:0 };
                g.list.forEach((r) => counts[r.status]++);
                return (
                  <section key={g.floor} className="ac-fs">
                    <header className="ac-fs-head">
                      <div className="ac-fs-title">ชั้น {g.floor}</div>
                      <div className="ac-fs-stats">
                        {(Object.keys(counts) as RoomStatus[]).map((k) => (counts[k] > 0 ? (
                          <span key={k} className="ac-fs-stat">
                            <span className="ac-fs-stat-dot" style={{ background: STATUS_DOT[k] }} />
                            {STATUS_LABEL[k]} {counts[k]}
                          </span>
                        ) : null))}
                      </div>
                    </header>
                    <div className="ac-rg">
                      {g.list.map((r) => (
                        <button key={`${r.building}-${r.room}`} className={`ac-rc ac-rc-${r.status}`} onClick={() => setSelectedRoom(r)} title={`${r.building} ${r.room} • ${STATUS_LABEL[r.status]}`}>
                          {r.today && <span className="ac-rc-today" />}
                          <span className="ac-rc-num">{r.room}</span>
                          <span className="ac-rc-status">{STATUS_LABEL[r.status]}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
            </>
          )}

          {showTasksView && (
            <TasksList
              tasks={visibleTasks}
              title={VIEW_LABEL[activeView as string] || "งาน"}
              emptyText="ไม่มีงานในรายการนี้"
              onChanged={refresh}
            />
          )}
        </main>
      </div>

      {showAddTask && (
        <div className="ac-modal-backdrop" onClick={() => setShowAddTask(false)}>
          <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
            <header className="ac-modal-head">
              <div>
                <div className="ac-modal-title">เพิ่มงานใหม่</div>
                <div className="ac-modal-sub">บันทึกลงชีต &quot;งาน&quot;</div>
              </div>
              <button className="ac-modal-close" onClick={() => setShowAddTask(false)}>✕</button>
            </header>
            <div className="ac-modal-body">
              <div className="ac-field">
                <label>วันที่</label>
                <input type="date" value={tDate} onChange={(e)=>setTDate(e.target.value)} />
              </div>
              <div className="ac-field">
                <label>ประเภท</label>
                <select value={tType} onChange={(e)=>setTType(e.target.value)}>
                  <option>ย้ายเข้า</option>
                  <option>ย้ายออก</option>
                  <option>ชมห้อง</option>
                  <option>ทำสะอาด</option>
                  <option>ซ่อม</option>
                  <option>อื่นๆ</option>
                </select>
              </div>
              <div className="ac-field">
                <label>ตึก</label>
                <select value={tBuilding} onChange={(e)=>setTBuilding(e.target.value)}>
                  <option value="">— เลือกตึก —</option>
                  {buildings.map((b)=>(<option key={b} value={b}>{b}</option>))}
                </select>
              </div>
              <div className="ac-field">
                <label>เลขห้อง</label>
                <input type="text" value={tRoom} onChange={(e)=>setTRoom(e.target.value)} placeholder="เช่น 101" />
              </div>
              <div className="ac-field">
                <label>ลูกค้า</label>
                <input type="text" value={tCustomer} onChange={(e)=>setTCustomer(e.target.value)} />
              </div>
              <div className="ac-field">
                <label>เบอร์</label>
                <input type="tel" value={tPhone} onChange={(e)=>setTPhone(e.target.value)} />
              </div>
              <div className="ac-field">
                <label>หมายเหตุ</label>
                <textarea rows={2} value={tNote} onChange={(e)=>setTNote(e.target.value)} />
              </div>
            </div>
            <footer className="ac-modal-foot">
              <button className="ac-btn ac-btn-ghost" onClick={()=>setShowAddTask(false)} disabled={savingTask}>ยกเลิก</button>
              <button className="ac-btn ac-btn-primary" onClick={handleAddTask} disabled={savingTask}>{savingTask ? "กำลังบันทึก..." : "บันทึก"}</button>
            </footer>
          </div>
        </div>
      )}

      {selectedRoom && (
        <div className="ac-modal-backdrop" onClick={() => setSelectedRoom(null)}>
          <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
            <header className="ac-modal-head">
              <div>
                <div className="ac-modal-title">{selectedRoom.building} {selectedRoom.room}</div>
                <div className="ac-modal-sub">
                  <span className="ac-legend-dot" style={{ background: STATUS_DOT[selectedRoom.status] }} />
                  {STATUS_LABEL[selectedRoom.status]} · ชั้น {selectedRoom.floor || "-"}
                </div>
              </div>
              <button className="ac-modal-close" onClick={() => setSelectedRoom(null)}>✕</button>
            </header>
            <div className="ac-modal-body">
              <div className="ac-modal-row"><span>ราคา/เดือน</span><strong>{fmtPrice(selectedRoom.price)} บาท</strong></div>

              <label className="ac-field">
                <span>สถานะ (ในชีต)</span>
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                  <option value="">- เลือก -</option>
                  {RAW_STATUS_OPTIONS.map((s) => (<option key={s} value={s}>{s}</option>))}
                </select>
              </label>
              <label className="ac-field">
                <span>ผู้เช่าปัจจุบัน</span>
                <input type="text" value={editTenant} onChange={(e) => setEditTenant(e
                                                                                     .target.value)} placeholder="ชื่อผู้เช่า" />
              </label>
              <label className="ac-field">
                <span>เบอร์ติดต่อ</span>
                <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="08x-xxx-xxxx" />
              </label>
              <label className="ac-field">
                <span>วันสัญญาหมด</span>
                <input type="text" value={editContractEnd} onChange={(e) => setEditContractEnd(e.target.value)} placeholder="dd/MM/yyyy" />
              </label>
              <label className="ac-field">
                <span>หมายเหตุ</span>
                <input type="text" value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="บันทึกเพิ่มเติม" />
              </label>

              {selectedRoom.upcomingTasks.length > 0 && (
                <>
                  <div style={{borderTop:"1px solid #F1F5F9", margin:"6px 0"}} />
                  <div style={{fontSize:12, color:"#6B7280", fontWeight:600}}>งานที่มาถึง</div>
                  {selectedRoom.upcomingTasks.map((t, i) => (
                    <div key={i} className="ac-modal-row">
                      <span>{t.date} · {t.type}</span>
                      <strong>{t.note || t.customer || "-"}</strong>
                    </div>
                  ))}
                </>
              )}
            </div>
            <footer className="ac-modal-foot">
              <button className="ac-btn ac-btn-ghost" onClick={() => setSelectedRoom(null)} disabled={saving}>ยกเลิก</button>
              <button className="ac-btn ac-btn-primary" onClick={handleSave} disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึก"}</button>
            </footer>
          </div>
        </div>
      )}

      {toast && (
        <div className={`ac-toast ${toast.type === "ok" ? "ac-toast-ok" : "ac-toast-err"}`}>
          {toast.msg}
        </div>
      )}
    
      <SummaryDrawer open={summaryOpen} onClose={() => setSummaryOpen(false)} rooms={rooms} tasks={tasks} />
      </div>
  );
}
                                                                                     
