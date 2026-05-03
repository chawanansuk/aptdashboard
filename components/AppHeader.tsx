"use client";

import { creatorInitials } from "@/lib/creator";

interface Props {
  buildings: string[]; // includes "ทั้งหมด" first
  activeBuilding: string;
  onChangeBuilding: (b: string) => void;
  isRefreshing: boolean;
  lastUpdated: string;
  isDark: boolean;
  creator: string;
  onAddTask: () => void;
  onRefresh: () => void;
  onToggleTheme: () => void;
  onOpenSummary: () => void;
  onOpenCreator: () => void;
  onToggleSidebar: () => void;
}

export default function AppHeader({
  buildings, activeBuilding, onChangeBuilding,
  isRefreshing, lastUpdated, isDark, creator,
  onAddTask, onRefresh, onToggleTheme, onOpenSummary, onOpenCreator, onToggleSidebar,
}: Props) {
  return (
    <header className="ac-nav">
      <div className="ac-nav-left">
        <button className="ac-hamburger" aria-label="เมนู" onClick={onToggleSidebar}>
          <span /><span /><span />
        </button>
        <div className="ac-logo"><div className="ac-logo-icon">A</div><span className="ac-logo-text">APARTCLOUD</span></div>
        <span className="ac-mode-badge">SALES MODE</span>
        <div className="ac-divider" />
        <nav className="ac-tabs">
          {buildings.map((b) => (
            <button key={b} className={`ac-tab ${activeBuilding === b ? "is-active" : ""}`} onClick={() => onChangeBuilding(b)}>{b}</button>
          ))}
        </nav>
        <select className="ac-tabs-select" value={activeBuilding} onChange={(e) => onChangeBuilding(e.target.value)}>
          {buildings.map((b) => (<option key={b} value={b}>{b}</option>))}
        </select>
      </div>
      <div className="ac-nav-right">
        <button className="ac-add-btn" onClick={onAddTask} title="เพิ่มงานใหม่">
          <span className="ac-add-btn-icon" style={{ display: "none" }}>+</span>
          <span className="ac-add-btn-text">+ เพิ่มงาน</span>
        </button>
        <button className={`ac-icon-btn ${isRefreshing ? "is-spinning" : ""}`} aria-label="รีเฟรช" onClick={onRefresh} title="รีเฟรช" disabled={isRefreshing}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>
          </svg>
        </button>
        <div className="ac-last-updated">อัปเดต: {lastUpdated || "-"}</div>
        <button className="ac-theme-toggle" onClick={onToggleTheme} aria-label="สลับโหมดมืด" title="สลับโหมดมืด">{isDark ? "☀️" : "☽"}</button>
        <button className="ac-summary-btn" onClick={onOpenSummary}>SUMMARY</button>
        <button
          className="ac-avatar"
          onClick={onOpenCreator}
          title={creator ? `ผู้ใช้: ${creator} (คลิกเพื่อแก้ไข)` : "ตั้งชื่อผู้ใช้"}
        >
          {creatorInitials(creator)}
        </button>
      </div>
    </header>
  );
}
