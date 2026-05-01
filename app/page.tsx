"use client";

import { useEffect, useMemo, useState } from "react";

type RoomStatus =
  | "occupied"
  | "ready"
  | "pending"
  | "moveout"
  | "qc"
  | "repair"
  | "inactive";

type Room = {
  number: string;
  status: RoomStatus;
  today?: boolean;
};

type Floor = {
  name: string;
  rooms: Room[];
};

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

const PROJECTS = ["ทั้งหมด", "Project A", "Project B", "Project C"];

const FILTER_CHIPS: { key: "all" | RoomStatus; label: string }[] = [
  { key: "all", label: "ทุกสถานะ" },
  { key: "ready", label: "ว่าง" },
  { key: "moveout", label: "แจ้งย้ายออก" },
  { key: "repair", label: "รอซ่อม" },
];

function genFloor(name: string, count: number, seed: number): Floor {
  const statuses: RoomStatus[] = [
    "occupied",
    "ready",
    "pending",
    "moveout",
    "qc",
    "repair",
    "inactive",
  ];
  const rooms: Room[] = [];
  for (let i = 1; i <= count; i++) {
    const idx = (i * 7 + seed * 3) % statuses.length;
    const status = statuses[idx];
    const today =
      (status === "moveout" || status === "qc" || status === "repair") &&
      (i + seed) % 4 === 0;
    rooms.push({
      number: `${name}${i.toString().padStart(2, "0")}`,
      status,
      today,
    });
  }
  return { name: `ชั้น ${name}`, rooms };
}

const INITIAL_FLOORS: Floor[] = [
  genFloor("1", 12, 1),
  genFloor("2", 12, 2),
  genFloor("3", 12, 3),
  genFloor("4", 12, 4),
  genFloor("5", 12, 5),
];

export default function Home() {
  const [activeProject, setActiveProject] = useState(PROJECTS[0]);
  const [activeFilter, setActiveFilter] =
    useState<(typeof FILTER_CHIPS)[number]["key"]>("all");
  const [search, setSearch] = useState("");
  const [activeSidebar, setActiveSidebar] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  const floors = INITIAL_FLOORS;

  const stats = useMemo(() => {
    let total = 0;
    let ready = 0;
    let moveout = 0;
    let repair = 0;
    floors.forEach((f) =>
      f.rooms.forEach((r) => {
        total++;
        if (r.status === "ready") ready++;
        if (r.status === "moveout") moveout++;
        if (r.status === "repair" || r.status === "qc") repair++;
      })
    );
    return { total, ready, moveout, repair };
  }, [floors]);

  const sidebarCounts = useMemo(() => {
    const c: Record<string, number> = {
      moveout: 0, qc: 0, repair: 0, ready: 0,
      occupied: 0, pending: 0, inactive: 0, today: 0,
    };
    floors.forEach((f) =>
      f.rooms.forEach((r) => {
        c[r.status]++;
        if (r.today) c.today++;
      })
    );
    return c;
  }, [floors]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1280) setSidebarOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const matchesFilter = (r: Room) => {
    if (activeFilter !== "all" && r.status !== activeFilter) return false;
    if (search.trim() && !r.number.toLowerCase().includes(search.toLowerCase().trim())) return false;
    return true;
  };

  return (
    <div className="ac-app">
      <header className="ac-nav">
        <div className="ac-nav-left">
          <button className="ac-hamburger" aria-label="เมนู" onClick={() => setSidebarOpen((v) => !v)}>
            <span /><span /><span />
          </button>
          <div className="ac-logo">
            <div className="ac-logo-icon">A</div>
            <span className="ac-logo-text">APARTCLOUD</span>
          </div>
          <span className="ac-mode-badge">SALES MODE</span>
          <div className="ac-divider" />
          <nav className="ac-tabs">
            {PROJECTS.map((p) => (
              <button key={p} className={`ac-tab ${activeProject === p ? "is-active" : ""}`} onClick={() => setActiveProject(p)}>{p}</button>
            ))}
          </nav>
          <select className="ac-tabs-select" value={activeProject} onChange={(e) => setActiveProject(e.target.value)}>
            {PROJECTS.map((p) => (<option key={p} value={p}>{p}</option>))}
          </select>
        </div>
        <div className="ac-nav-right">
          <button className="ac-icon-btn" aria-label="แจ้งเตือน">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
            <span className="ac-icon-dot" />
          </button>
          <button className="ac-summary-btn">SUMMARY</button>
          <div className="ac-avatar">CS</div>
        </div>
      </header>

      <div className="ac-body">
        <aside className={`ac-side ${sidebarOpen ? "is-open" : ""}`}>
          <div className="ac-side-group">
            <div className="ac-side-label">วันนี้</div>
            <button className={`ac-side-item ${activeSidebar === "overview" ? "is-active" : ""}`} onClick={() => setActiveSidebar("overview")}>
              <span className="ac-side-icon">▦</span>
              <span className="ac-side-text">ภาพรวม</span>
              <span className="ac-badge ac-badge-indigo">{stats.total}</span>
            </button>
            <button className={`ac-side-item ${activeSidebar === "today" ? "is-active" : ""}`} onClick={() => setActiveSidebar("today")}>
              <span className="ac-side-icon">●</span>
              <span className="ac-side-text">งานวันนี้</span>
              <span className="ac-badge ac-badge-red">{sidebarCounts.today}</span>
            </button>
          </div>
          <div className="ac-side-group">
            <div className="ac-side-label">สถานะห้อง</div>
            <button className={`ac-side-item ${activeSidebar === "ready" ? "is-active" : ""}`} onClick={() => { setActiveSidebar("ready"); setActiveFilter("ready"); }}>
              <span className="ac-side-icon" style={{ color: "#22C55E" }}>●</span>
              <span className="ac-side-text">พร้อมขาย</span>
              <span className="ac-badge ac-badge-green">{sidebarCounts.ready}</span>
            </button>
            <button className={`ac-side-item ${activeSidebar === "pending" ? "is-active" : ""}`} onClick={() => setActiveSidebar("pending")}>
              <span className="ac-side-icon" style={{ color: "#A855F7" }}>●</span>
              <span className="ac-side-text">รอสัญญา</span>
              <span className="ac-badge ac-badge-indigo">{sidebarCounts.pending}</span>
            </button>
            <button className={`ac-side-item ${activeSidebar === "occupied" ? "is-active" : ""}`} onClick={() => setActiveSidebar("occupied")}>
              <span className="ac-side-icon" style={{ color: "#1E293B" }}>●</span>
              <span className="ac-side-text">มีผู้เช่า</span>
              <span className="ac-badge ac-badge-slate">{sidebarCounts.occupied}</span>
            </button>
          </div>
          <div className="ac-side-group">
            <div className="ac-side-label">งาน</div>
            <button className={`ac-side-item ${activeSidebar === "moveout" ? "is-active" : ""}`} onClick={() => { setActiveSidebar("moveout"); setActiveFilter("moveout"); }}>
              <span className="ac-side-icon" style={{ color: "#EF4444" }}>●</span>
              <span className="ac-side-text">แจ้งย้ายออก</span>
              <span className="ac-badge ac-badge-red">{sidebarCounts.moveout}</span>
            </button>
            <button className={`ac-side-item ${activeSidebar === "qc" ? "is-active" : ""}`} onClick={() => setActiveSidebar("qc")}>
              <span className="ac-side-icon" style={{ color: "#F97316" }}>●</span>
              <span className="ac-side-text">รอตรวจ/QC</span>
              <span className="ac-badge ac-badge-orange">{sidebarCounts.qc}</span>
            </button>
            <button className={`ac-side-item ${activeSidebar === "repair" ? "is-active" : ""}`} onClick={() => { setActiveSidebar("repair"); setActiveFilter("repair"); }}>
              <span className="ac-side-icon" style={{ color: "#EAB308" }}>●</span>
              <span className="ac-side-text">รอเข้าซ่อม</span>
              <span className="ac-badge ac-badge-yellow">{sidebarCounts.repair}</span>
            </button>
            <button className={`ac-side-item ${activeSidebar === "inactive" ? "is-active" : ""}`} onClick={() => setActiveSidebar("inactive")}>
              <span className="ac-side-icon" style={{ color: "#CBD5E1" }}>●</span>
              <span className="ac-side-text">ไม่ได้ใช้งาน</span>
              <span className="ac-badge ac-badge-empty">{sidebarCounts.inactive}</span>
            </button>
          </div>
        </aside>

        {sidebarOpen && (<div className="ac-side-backdrop" onClick={() => setSidebarOpen(false)} />)}

        <main className="ac-main">
          <section className="ac-sg">
            <div className="ac-sc"><div className="ac-si ac-si-indigo">▦</div><div className="ac-sc-body"><div className="ac-sc-label">ทั้งหมด</div><div className="ac-sc-num">{stats.total}</div><div className="ac-sc-sub ac-sub-info">ห้องในโครงการ</div></div></div>
            <div className="ac-sc"><div className="ac-si ac-si-green">✓</div><div className="ac-sc-body"><div className="ac-sc-label">ว่าง / พร้อมขาย</div><div className="ac-sc-num">{stats.ready}</div><div className="ac-sc-sub ac-sub-info">พร้อมเสนอลูกค้า</div></div></div>
            <div className="ac-sc"><div className="ac-si ac-si-orange">↗</div><div className="ac-sc-body"><div className="ac-sc-label">แจ้งย้ายออก</div><div className="ac-sc-num">{stats.moveout}</div><div className="ac-sc-sub ac-sub-urgent">ต้องติดตาม</div></div></div>
            <div className="ac-sc"><div className="ac-si ac-si-red">⚒</div><div className="ac-sc-body"><div className="ac-sc-label">ซ่อม / QC</div><div className="ac-sc-num">{stats.repair}</div><div className="ac-sc-sub ac-sub-urgent">รอดำเนินการ</div></div></div>
          </section>

          <section className="ac-fb">
            <div className="ac-chips">
              {FILTER_CHIPS.map((c) => (
                <button key={c.key} className={`ac-chip ${activeFilter === c.key ? "is-active" : ""}`} onClick={() => setActiveFilter(c.key)}>{c.label}</button>
              ))}
            </div>
            <div className="ac-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input type="text" placeholder="ค้นหาเลขห้อง..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </section>

          <section className="ac-legend">
            {(Object.keys(STATUS_LABEL) as RoomStatus[]).map((s) => (
              <div key={s} className="ac-legend-item">
                <span className="ac-legend-dot" style={{ background: STATUS_DOT[s] }} />
                <span>{STATUS_LABEL[s]}</span>
              </div>
            ))}
            <div className="ac-legend-item">
              <span className="ac-legend-dot ac-legend-today" />
              <span>งานวันนี้</span>
            </div>
          </section>

          {floors.map((floor) => {
            const filteredRooms = floor.rooms.filter(matchesFilter);
            if (filteredRooms.length === 0) return null;
            const counts: Record<string, number> = {};
            floor.rooms.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
            return (
              <section key={floor.name} className="ac-fs">
                <header className="ac-fs-head">
                  <div className="ac-fs-title">{floor.name}</div>
                  <div className="ac-fs-stats">
                    {(Object.keys(counts) as RoomStatus[]).map((k) => (
                      <span key={k} className="ac-fs-stat">
                        <span className="ac-fs-stat-dot" style={{ background: STATUS_DOT[k] }} />
                        {STATUS_LABEL[k]} {counts[k]}
                      </span>
                    ))}
                  </div>
                </header>
                <div className="ac-rg">
                  {filteredRooms.map((r) => (
                    <button key={r.number} className={`ac-rc ac-rc-${r.status}`} onClick={() => setSelectedRoom(r)}>
                      {r.today && <span className="ac-rc-today" />}
                      <span className="ac-rc-num">{r.number}</span>
                      <span className="ac-rc-status">{STATUS_LABEL[r.status]}</span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </main>
      </div>

      {selectedRoom && (
        <div className="ac-modal-backdrop" onClick={() => setSelectedRoom(null)}>
          <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
            <header className="ac-modal-head">
              <div>
                <div className="ac-modal-title">ห้อง {selectedRoom.number}</div>
                <div className="ac-modal-sub">
                  <span className="ac-legend-dot" style={{ background: STATUS_DOT[selectedRoom.status] }} />
                  {STATUS_LABEL[selectedRoom.status]}
                </div>
              </div>
              <button className="ac-modal-close" onClick={() => setSelectedRoom(null)}>✕</button>
            </header>
            <div className="ac-modal-body">
              <div className="ac-modal-row"><span>เลขห้อง</span><strong>{selectedRoom.number}</strong></div>
              <div className="ac-modal-row"><span>สถานะ</span><strong>{STATUS_LABEL[selectedRoom.status]}</strong></div>
              <div className="ac-modal-row"><span>งานวันนี้</span><strong>{selectedRoom.today ? "ใช่" : "ไม่มี"}</strong></div>
              <div className="ac-modal-row"><span>โครงการ</span><strong>{activeProject}</strong></div>
            </div>
            <footer className="ac-modal-foot">
              <button className="ac-btn ac-btn-ghost" onClick={() => setSelectedRoom(null)}>ปิด</button>
              <button className="ac-btn ac-btn-primary">ดูรายละเอียด</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
