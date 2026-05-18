"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { signOut, useSession } from "next-auth/react";

interface Props {
  buildings: string[]; // includes "ทั้งหมด" first
  activeBuilding: string;
  onChangeBuilding: (b: string) => void;
  isRefreshing: boolean;
  lastUpdated: string;
  isDark: boolean;
  onAddTask: () => void;
  onRefresh: () => void;
  onToggleTheme: () => void;
  onOpenSummary: () => void;
  onToggleSidebar: () => void;
}

function initialsFromName(name?: string | null): string {
  const s = (name || "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const MODE_LABEL: Record<string, string> = {
  sales: "SALES MODE",
  engineer: "ENGINEER MODE",
  management: "MGMT MODE",
};

export default function AppHeader({
  buildings, activeBuilding, onChangeBuilding,
  isRefreshing, lastUpdated, isDark,
  onAddTask, onRefresh, onToggleTheme, onOpenSummary, onToggleSidebar,
}: Props) {
  const { data: session } = useSession();
  const user = session?.user;
  const roles = user?.roles;
  // Primary role for the mode badge in the header — use first role
  const primaryRole = roles?.[0] || user?.role;

  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header className="ac-nav">
      <div className="ac-nav-left">
        <button className="ac-hamburger" aria-label="เมนู" onClick={onToggleSidebar}>
          <span /><span /><span />
        </button>
        <div className="ac-logo"><div className="ac-logo-icon">A</div><span className="ac-logo-text">APARTCLOUD</span></div>
        <span className={`ac-mode-badge is-${primaryRole || "sales"}`}>{MODE_LABEL[primaryRole || "sales"] || "SALES MODE"}</span>
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
        <button
          className={`ac-icon-btn ${isRefreshing ? "is-spinning" : ""}`}
          aria-label="รีเฟรช"
          onClick={onRefresh}
          title="รีเฟรช"
          disabled={isRefreshing}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>
          </svg>
        </button>
        <div className="ac-last-updated">อัปเดต: {lastUpdated || "-"}</div>
        <button className="ac-theme-toggle" onClick={onToggleTheme} aria-label="สลับโหมดมืด" title="สลับโหมดมืด">{isDark ? "☀️" : "☽"}</button>
        <button className="ac-summary-btn" onClick={onOpenSummary}>SUMMARY</button>

        <div className="ac-user-wrap">
          <button
            ref={triggerRef}
            className="ac-user-trigger"
            onClick={() => setMenuOpen((v) => !v)}
            title={user?.name || user?.email || "ผู้ใช้"}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="ac-user-pic">
              {user?.image ? (
                <Image src={user.image} alt="" width={36} height={36} unoptimized />
              ) : (
                <span>{initialsFromName(user?.name || user?.email)}</span>
              )}
            </span>
          </button>

          {menuOpen && (
            <>
              <div className="ac-user-menu-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="ac-user-menu" role="menu">
                <div className="ac-user-info">
                  <div className="ac-user-name">{user?.name || "ผู้ใช้"}</div>
                  <div className="ac-user-email">{user?.email || ""}</div>
                  {roles && roles.length > 0 && (
                    <span className={`ac-user-role ${roles.includes("management") ? "ac-user-role-admin" : "ac-user-role-staff"}`}>
                      {roles.join(" + ")}
                    </span>
                  )}
                </div>
                <button
                  className="ac-user-signout"
                  onClick={() => {
                    setMenuOpen(false);
                    signOut({ callbackUrl: "/login" });
                  }}
                >
                  ออกจากระบบ
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
