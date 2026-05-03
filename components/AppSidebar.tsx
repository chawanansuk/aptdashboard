"use client";

import type { RoomStatus } from "@/types";
import { STATUS_LABEL, STATUS_DOT } from "@/lib/constants";

export type SidebarView = "overview" | "today" | RoomStatus | "income" | "tenants" | "calendar";

interface Props {
  isOpen: boolean;
  activeView: SidebarView;
  onChangeView: (v: SidebarView) => void;
  counts: { total: number; today: number } & Partial<Record<RoomStatus, number>>;
  onBackdropClick: () => void;
}

export default function AppSidebar({ isOpen, activeView, onChangeView, counts, onBackdropClick }: Props) {
  return (
    <>
      <aside className={`ac-side ${isOpen ? "is-open" : ""}`}>
        <div className="ac-side-group">
          <div className="ac-side-label">วันนี้</div>
          <button className={`ac-side-item ${activeView === "overview" ? "is-active" : ""}`} onClick={() => onChangeView("overview")}>
            <span className="ac-side-icon">▦</span>
            <span className="ac-side-text">ภาพรวม</span>
            <span className="ac-badge ac-badge-indigo">{counts.total}</span>
          </button>
          <button className={`ac-side-item ${activeView === "today" ? "is-active" : ""}`} onClick={() => onChangeView("today")}>
            <span className="ac-side-icon">●</span>
            <span className="ac-side-text">งานวันนี้</span>
            <span className="ac-badge ac-badge-red">{counts.today}</span>
          </button>
        </div>
        <div className="ac-side-group">
          <div className="ac-side-label">สถานะห้อง</div>
          {(["ready", "pending", "occupied"] as RoomStatus[]).map((s) => (
            <button key={s} className={`ac-side-item ${activeView === s ? "is-active" : ""}`} onClick={() => onChangeView(s)}>
              <span className="ac-side-icon" style={{ color: STATUS_DOT[s] }}>●</span>
              <span className="ac-side-text">{STATUS_LABEL[s]}</span>
              <span className={`ac-badge ${s === "ready" ? "ac-badge-green" : s === "pending" ? "ac-badge-indigo" : "ac-badge-slate"}`}>{counts[s] || 0}</span>
            </button>
          ))}
        </div>
        <div className="ac-side-group">
          <div className="ac-side-label">งาน</div>
          {(["moveout", "qc", "repair", "inactive"] as RoomStatus[]).map((s) => (
            <button key={s} className={`ac-side-item ${activeView === s ? "is-active" : ""}`} onClick={() => onChangeView(s)}>
              <span className="ac-side-icon" style={{ color: STATUS_DOT[s] }}>●</span>
              <span className="ac-side-text">{STATUS_LABEL[s]}</span>
              <span className={`ac-badge ${s === "moveout" ? "ac-badge-red" : s === "qc" ? "ac-badge-orange" : s === "repair" ? "ac-badge-yellow" : "ac-badge-empty"}`}>{counts[s] || 0}</span>
            </button>
          ))}
        </div>
        <div className="ac-side-group">
          <div className="ac-side-label">ดูข้อมูล</div>
          <button className={`ac-side-item ${activeView === "income" ? "is-active" : ""}`} onClick={() => onChangeView("income")}>
            <span className="ac-side-icon">฿</span>
            <span className="ac-side-text">รายได้</span>
          </button>
          <button className={`ac-side-item ${activeView === "tenants" ? "is-active" : ""}`} onClick={() => onChangeView("tenants")}>
            <span className="ac-side-icon">⚉</span>
            <span className="ac-side-text">ผู้เช่า</span>
          </button>
          <button className={`ac-side-item ${activeView === "calendar" ? "is-active" : ""}`} onClick={() => onChangeView("calendar")}>
            <span className="ac-side-icon">▦</span>
            <span className="ac-side-text">ปฏิทิน</span>
          </button>
        </div>
      </aside>
      {isOpen && <div className="ac-side-backdrop" onClick={onBackdropClick} />}
    </>
  );
}
