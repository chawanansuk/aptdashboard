"use client";

import type { RoomStatus } from "@/types";
import type { Role } from "@/auth";
import { STATUS_LABEL, STATUS_DOT } from "@/lib/constants";
import { canAccess } from "@/lib/permissions";

export type SidebarView = "overview" | "today" | RoomStatus | "income" | "tenants" | "calendar" | "maintenance" | "facilities";

interface Props {
  isOpen: boolean;
  activeView: SidebarView;
  onChangeView: (v: SidebarView) => void;
  counts: { total: number; today: number } & Partial<Record<RoomStatus, number>>;
  onBackdropClick: () => void;
  /** ผู้ใช้ปัจจุบัน — ถ้า undefined (loading) ให้แสดง safe default: overview + today เท่านั้น */
  roles?: Role[];
}

/**
 * Sidebar items per role — driven entirely by canAccess() so the
 * route → role mapping lives in lib/permissions.ts (single source of
 * truth). Group visibility is derived from whether ANY item in the
 * group is accessible.
 *
 * View-as filter: page.tsx passes effectiveRoles (not actualRoles),
 * so flipping the View-as dropdown changes what's visible here.
 */

export default function AppSidebar({
  isOpen, activeView, onChangeView, counts, onBackdropClick, roles,
}: Props) {
  const showStatuses =
    canAccess(roles, "ready") || canAccess(roles, "pending") || canAccess(roles, "occupied");
  const showSalesTasks = canAccess(roles, "moveout");
  const showEngTasks =
    canAccess(roles, "qc") || canAccess(roles, "repair") || canAccess(roles, "inactive");
  const showAnyTaskGroup = showSalesTasks || showEngTasks;
  const showTen = canAccess(roles, "tenants");
  const showInc = canAccess(roles, "income");
  const showMaint = canAccess(roles, "maintenance") || canAccess(roles, "facilities");
  // กลุ่ม "ดูข้อมูล" render เสมอ เพราะปฏิทินเห็นทุก role

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

        {showStatuses && (
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
        )}

        {showAnyTaskGroup && (
          <div className="ac-side-group">
            <div className="ac-side-label">งาน</div>
            {showSalesTasks && (
              <button
                key="moveout"
                className={`ac-side-item ${activeView === "moveout" ? "is-active" : ""}`}
                onClick={() => onChangeView("moveout")}
              >
                <span className="ac-side-icon" style={{ color: STATUS_DOT.moveout }}>●</span>
                <span className="ac-side-text">{STATUS_LABEL.moveout}</span>
                <span className="ac-badge ac-badge-red">{counts.moveout || 0}</span>
              </button>
            )}
            {showEngTasks && (
              <>
                <button
                  key="qc"
                  className={`ac-side-item ${activeView === "qc" ? "is-active" : ""}`}
                  onClick={() => onChangeView("qc")}
                >
                  <span className="ac-side-icon" style={{ color: STATUS_DOT.qc }}>●</span>
                  <span className="ac-side-text">{STATUS_LABEL.qc}</span>
                  <span className="ac-badge ac-badge-orange">{counts.qc || 0}</span>
                </button>
                <button
                  key="repair"
                  className={`ac-side-item ${activeView === "repair" ? "is-active" : ""}`}
                  onClick={() => onChangeView("repair")}
                >
                  <span className="ac-side-icon" style={{ color: STATUS_DOT.repair }}>●</span>
                  <span className="ac-side-text">{STATUS_LABEL.repair}</span>
                  <span className="ac-badge ac-badge-yellow">{counts.repair || 0}</span>
                </button>
                <button
                  key="inactive"
                  className={`ac-side-item ${activeView === "inactive" ? "is-active" : ""}`}
                  onClick={() => onChangeView("inactive")}
                >
                  <span className="ac-side-icon" style={{ color: STATUS_DOT.inactive }}>●</span>
                  <span className="ac-side-text">{STATUS_LABEL.inactive}</span>
                  <span className="ac-badge ac-badge-empty">{counts.inactive || 0}</span>
                </button>
              </>
            )}
          </div>
        )}

        <div className="ac-side-group">
          <div className="ac-side-label">ดูข้อมูล</div>
          {showInc && (
            <button className={`ac-side-item ${activeView === "income" ? "is-active" : ""}`} onClick={() => onChangeView("income")}>
              <span className="ac-side-icon">฿</span>
              <span className="ac-side-text">รายได้</span>
            </button>
          )}
          {showTen && (
            <button className={`ac-side-item ${activeView === "tenants" ? "is-active" : ""}`} onClick={() => onChangeView("tenants")}>
              <span className="ac-side-icon">⚉</span>
              <span className="ac-side-text">ผู้เช่า</span>
            </button>
          )}
          <button className={`ac-side-item ${activeView === "calendar" ? "is-active" : ""}`} onClick={() => onChangeView("calendar")}>
            <span className="ac-side-icon">▦</span>
            <span className="ac-side-text">ปฏิทิน</span>
          </button>
          {showMaint && (
            <>
              <button className={`ac-side-item ${activeView === "maintenance" ? "is-active" : ""}`} onClick={() => onChangeView("maintenance")}>
                <span className="ac-side-icon">🔧</span>
                <span className="ac-side-text">บำรุงรักษา</span>
              </button>
              <button className={`ac-side-item ${activeView === "facilities" ? "is-active" : ""}`} onClick={() => onChangeView("facilities")}>
                <span className="ac-side-icon">🏢</span>
                <span className="ac-side-text">สาธารณูปโภค</span>
              </button>
            </>
          )}
        </div>
      </aside>
      {isOpen && <div className="ac-side-backdrop" onClick={onBackdropClick} />}
    </>
  );
}
