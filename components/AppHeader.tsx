"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { signOut, useSession } from "next-auth/react";
import { useEffectiveRoles, VIEW_AS_ALL, type ViewAsValue } from "@/lib/useEffectiveRoles";
import { Icon } from "@/lib/icons";
import { toast } from "@/lib/toast";
import type { Role } from "@/auth";
import { isManagement } from "@/lib/permissions";
import NotificationDropdown from "./NotificationDropdown";
import QuickActionMenu, { type QuickAction } from "./QuickActionMenu";
import type { NotificationItem } from "@/lib/notifications";

interface Props {
  buildings: string[]; // includes "ทั้งหมด" first
  activeBuilding: string;
  onChangeBuilding: (b: string) => void;
  isRefreshing: boolean;
  lastUpdated: string;
  isDark: boolean;
  /** Legacy single-action handler. Used as fallback when quickActions
   *  isn't supplied (e.g. routes that don't wire up the new menu yet). */
  onAddTask: () => void;
  onRefresh: () => void;
  onToggleTheme: () => void;
  onOpenSummary: () => void;
  onToggleSidebar: () => void;
  /** Open the keyboard-shortcut help modal (`?` key). */
  onOpenHelp?: () => void;
  /** Open the global command palette. Mobile users tap this; desktop users press Cmd+K / `/`. */
  onOpenSearch?: () => void;
  /** Mode-specific label for the add button (e.g. "+ นัดลูกค้า"). Falls back to "เพิ่มงาน". */
  addLabel?: string;
  /** Mode-specific label for the role/mode badge (e.g. "Sales Mode"). Falls back to MODE_LABEL map. */
  modeLabel?: string;
  /** Notification dropdown content. Empty array = bell with no badge. */
  notifications?: NotificationItem[];
  /** Called when the user picks a notification row — typically the
   *  parent flips activeView to the row's route. */
  onNotificationNavigate?: (route: string) => void;
  /** Quick action menu items — when provided, the "+ เพิ่ม" button opens
   *  a dropdown of these instead of firing onAddTask directly (Problem #16). */
  quickActions?: QuickAction[];
  /** Lift menu open state so the page-level keyboard handler can bail
   *  out of letter shortcuts (e.g. `R`/`n`) that would otherwise fire
   *  alongside the menu's per-item shortcuts. */
  quickMenuOpen?: boolean;
  onSetQuickMenuOpen?: (open: boolean) => void;
  /** Per-building count of vacant ("ห้องว่าง") rooms. When provided, the
   *  building tab renders as `{name} {count}` so a sales user can see at
   *  a glance which buildings have supply. Page-side only feeds this on
   *  supply-relevant views (overview/sales/ready/pending/moveout) — for
   *  engineer/maintenance/etc. it stays undefined and the tab renders
   *  unchanged. Buildings with count === 0 also render unchanged so we
   *  don't shout "Kl 0" at the user. */
  vacancyByBuilding?: Record<string, number>;
}

function initialsFromName(name?: string | null): string {
  const s = (name || "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const MODE_LABEL: Record<string, string> = {
  sales: "โหมดขาย",
  engineer: "โหมดช่าง",
  management: "โหมดจัดการ",
};

const ROLE_LABEL: Record<Role | typeof VIEW_AS_ALL, string> = {
  // Emoji prefix lets the user spot the active role at a glance —
  // particularly useful when the multi-role picker is in the menu and
  // the user just wants visual confirmation of which mode is on.
  all: "👥 ทุกบทบาท",
  sales: "🏠 ทีมขาย",
  engineer: "🔧 ช่าง",
  management: "📊 ผู้จัดการ",
};

/**
 * App header — mobile-first redesign.
 *
 * Mobile (≤ 760px): minimal 4-element row → hamburger · logo · search · avatar.
 *   Building select sits on row 2. All secondary actions (refresh, theme,
 *   summary, View-as, mode badge) live inside the user menu so the bar
 *   stays tap-friendly with 44px hit targets and breathing room.
 *
 * Desktop (> 760px): keeps the rich toolbar (Add, refresh, theme, SUMMARY)
 *   inline since there's room. Secondary actions also mirrored into the
 *   user menu for consistency / discoverability.
 */
export default function AppHeader({
  buildings, activeBuilding, onChangeBuilding,
  isRefreshing, lastUpdated, isDark,
  onAddTask, onRefresh, onToggleTheme, onOpenSummary, onToggleSidebar, onOpenSearch, onOpenHelp,
  addLabel, modeLabel,
  notifications, onNotificationNavigate,
  quickActions, quickMenuOpen, onSetQuickMenuOpen,
  vacancyByBuilding,
}: Props) {
  // When the parent supplies a quickActions list AND a state controller,
  // the "+ เพิ่ม" button toggles a menu instead of firing the legacy
  // single onAddTask. Both code paths coexist so partial adoption is OK.
  const hasQuickMenu = !!(quickActions && quickActions.length > 0 && onSetQuickMenuOpen);
  const addTriggerRef = useRef<HTMLButtonElement>(null);
  function handleAddClick() {
    if (hasQuickMenu) onSetQuickMenuOpen!(!quickMenuOpen);
    else onAddTask();
  }
  const { data: session } = useSession();
  const user = session?.user;
  const roles = user?.roles;
  // Primary role for the mode badge in the header — use first role
  const primaryRole = roles?.[0] || user?.role;

  const { actualRoles, viewAs, setViewAs, isMultiRole } = useEffectiveRoles();

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

  const modeText = modeLabel || MODE_LABEL[primaryRole || "sales"] || "โหมดขาย";

  function closeMenu() { setMenuOpen(false); }

  return (
    <header className="ac-nav">
      {/* === Cell: Brand (hamburger + logo + mode badge) === */}
      <div className="ac-nav-cell ac-nav-cell-brand">
        <button className="ac-hamburger" aria-label="เมนู" onClick={onToggleSidebar} title="เปิดเมนูด้านข้าง">
          <span /><span /><span />
        </button>
        <div className="ac-logo">
          <div className="ac-logo-icon">A</div>
          <span className="ac-logo-text">APARTCLOUD</span>
        </div>
        <span className={`ac-mode-badge is-${primaryRole || "sales"} ac-hide-mobile`}>
          {modeText}
        </span>
      </div>

      {/* === Cell: Building filter (segmented pill control) === */}
      <nav className="ac-nav-cell ac-nav-cell-tabs ac-tabs" aria-label="ตัวกรองอาคาร">
        {buildings.map((b) => {
          // Vacancy badge: only on real buildings (not "ทั้งหมด"), only
          // when the parent opted in for this view, only when there's
          // actually supply to advertise (>0).
          const vacant = vacancyByBuilding && b !== "ทั้งหมด" ? vacancyByBuilding[b] ?? 0 : 0;
          const showBadge = vacant > 0;
          const title = b === "ทั้งหมด"
            ? "ดูทุกอาคาร"
            : showBadge
              ? `กรองเฉพาะอาคาร ${b} · ห้องว่าง ${vacant}`
              : `กรองเฉพาะอาคาร ${b}`;
          return (
            <button
              key={b}
              className={`ac-tab ${activeBuilding === b ? "is-active" : ""}`}
              onClick={() => onChangeBuilding(b)}
              title={title}
            >
              {b}
              {showBadge && (
                <span className="ac-tab-badge" aria-label={`ห้องว่าง ${vacant} ห้อง`}>{vacant}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* === Cell: Actions (refresh + add button) ===
          The "อัปเดต hh:mm" stamp used to live here as a visible label
          but it ate ~110px of the toolbar for a line most users never
          read. It now lives as the refresh button's tooltip — same
          information, zero pixels. */}
      <div className="ac-nav-cell ac-nav-cell-actions">
        <button
          className={`ac-icon-btn ac-hide-mobile ${isRefreshing ? "is-spinning" : ""}`}
          aria-label={`รีเฟรชข้อมูล${lastUpdated ? ` · อัปเดตล่าสุด ${lastUpdated}` : ""}`}
          onClick={onRefresh}
          title={`รีเฟรชข้อมูล${lastUpdated ? ` · อัปเดตล่าสุด ${lastUpdated}` : ""}`}
          disabled={isRefreshing}
        >
          <Icon name="refresh" size={16} />
        </button>
        <div className="ac-add-btn-wrap">
          <button
            ref={addTriggerRef}
            className="ac-add-btn ac-hide-mobile"
            onClick={handleAddClick}
            title={hasQuickMenu ? "เพิ่มรายการใหม่ (Q)" : (addLabel || "เพิ่มงานใหม่")}
            aria-haspopup={hasQuickMenu ? "menu" : undefined}
            aria-expanded={hasQuickMenu ? (quickMenuOpen || false) : undefined}
          >
            <Icon name="add" size={16} strokeWidth={2.25} />
            <span className="ac-add-btn-text">
              {hasQuickMenu ? "เพิ่ม" : (addLabel ? addLabel.replace(/^\+\s*/, "") : "เพิ่มงาน")}
            </span>
          </button>
          {hasQuickMenu && (
            <QuickActionMenu
              open={!!quickMenuOpen}
              onClose={() => onSetQuickMenuOpen!(false)}
              actions={quickActions!}
            />
          )}
        </div>
      </div>

      {/* === Cell: Utils (search + bell + theme + summary + avatar) === */}
      <div className="ac-nav-cell ac-nav-cell-utils">
        {onOpenSearch && (
          <button
            className="ac-cmdk-btn ac-hide-mobile"
            aria-label="ค้นหา (Ctrl+K)"
            title="ค้นหา ห้อง · ผู้เช่า · เบอร์ · ทะเบียนรถ · หน้า (Ctrl+K หรือ /)"
            onClick={onOpenSearch}
          >
            <Icon name="search" size={14} />
            <span className="ac-cmdk-btn-text">ค้นหา</span>
            <kbd className="ac-cmdk-btn-kbd" aria-hidden>⌘K</kbd>
          </button>
        )}
        {onOpenSearch && (
          /* Mobile keeps the icon-only variant — kbd hint isn't useful
             on touch and the labeled pill would crowd the toolbar. */
          <button
            className="ac-icon-btn ac-show-mobile-only ac-cmdk-trigger"
            aria-label="ค้นหา"
            title="ค้นหา"
            onClick={onOpenSearch}
          >
            <Icon name="search" size={16} />
          </button>
        )}
        {notifications !== undefined && (
          <NotificationDropdown
            items={notifications}
            onNavigate={onNotificationNavigate}
          />
        )}
        <button
          className="ac-theme-toggle ac-hide-mobile"
          onClick={onToggleTheme}
          aria-label={isDark ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
          title={isDark ? "สลับเป็นธีมสว่าง" : "สลับเป็นธีมมืด"}
        >
          <Icon name={isDark ? "sun" : "moon"} size={16} />
        </button>
        <button
          className="ac-summary-btn ac-hide-mobile"
          onClick={onOpenSummary}
          title="ดูสรุปงานวันนี้ทั้งหมด"
        >สรุปวันนี้</button>

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
              <div className="ac-user-menu-backdrop" onClick={closeMenu} />
              <div className="ac-user-menu" role="menu">
                {/* Identity */}
                <div className="ac-user-info">
                  <div className="ac-user-name">{user?.name || "ผู้ใช้"}</div>
                  <div className="ac-user-email">{user?.email || ""}</div>
                  <span className={`ac-mode-badge is-${primaryRole || "sales"}`} style={{ marginTop: 8 }}>
                    {modeText}
                  </span>
                </div>

                {/* View-as picker (multi-role only) */}
                {isMultiRole && (
                  <div className="ac-user-menu-section">
                    <div className="ac-user-menu-label">ดูในมุมมอง</div>
                    <select
                      className="ac-user-menu-select"
                      value={viewAs}
                      onChange={(e) => {
                        const next = e.target.value as ViewAsValue;
                        setViewAs(next);
                        closeMenu();
                        // Confirm visually so the user knows the switch took
                        // effect — the mode-driven landing useEffect in
                        // app/page.tsx (PR #57) handles the actual view change
                        toast.success(`เปลี่ยนมุมมองเป็น ${ROLE_LABEL[next]} แล้ว`);
                      }}
                      aria-label="กรองเมนูตามบทบาท"
                    >
                      {[VIEW_AS_ALL, ...actualRoles].map((v) => (
                        <option key={v} value={v}>{ROLE_LABEL[v]}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Mobile-only actions — Add (mirror of BottomNav, kept for menu users), refresh, theme, summary */}
                <div className="ac-user-menu-section ac-show-mobile-only">
                  <button
                    className="ac-user-menu-item"
                    onClick={() => {
                      closeMenu();
                      if (hasQuickMenu) onSetQuickMenuOpen!(true);
                      else onAddTask();
                    }}
                  >
                    <Icon name="add" size={16} strokeWidth={2.25} />
                    <span>{hasQuickMenu ? "เพิ่ม..." : (addLabel ? addLabel.replace(/^\+\s*/, "") : "เพิ่มงาน")}</span>
                  </button>
                  <button
                    className="ac-user-menu-item"
                    onClick={() => { closeMenu(); onRefresh(); }}
                    disabled={isRefreshing}
                  >
                    <Icon name="refresh" size={16} />
                    <span>รีเฟรช</span>
                    <span className="ac-user-menu-meta">{lastUpdated || "-"}</span>
                  </button>
                  <button
                    className="ac-user-menu-item"
                    onClick={() => { closeMenu(); onToggleTheme(); }}
                  >
                    <Icon name={isDark ? "sun" : "moon"} size={16} />
                    <span>{isDark ? "โหมดสว่าง" : "โหมดมืด"}</span>
                  </button>
                  <button
                    className="ac-user-menu-item"
                    onClick={() => { closeMenu(); onOpenSummary(); }}
                  >
                    <Icon name="summary" size={16} />
                    <span>สรุปวันนี้</span>
                  </button>
                </div>

                {/* Desktop: refresh time still visible inside menu for convenience */}
                <div className="ac-user-menu-section ac-hide-mobile">
                  <div className="ac-user-menu-meta-row">
                    <Icon name="refresh" size={12} />
                    <span>อัปเดตล่าสุด {lastUpdated || "-"}</span>
                  </div>
                </div>

                {/* Keyboard shortcut help — visible to everyone */}
                {onOpenHelp && (
                  <button
                    type="button"
                    className="ac-user-menu-item"
                    onClick={() => { closeMenu(); onOpenHelp(); }}
                  >
                    <Icon name="alert" size={16} />
                    <span>คีย์ลัด <span className="ac-user-menu-meta">?</span></span>
                  </button>
                )}

                {/* Management-only — admin/permissions matrix viewer (Task 19) */}
                {isManagement(session?.user?.roles) && (
                  <a
                    className="ac-user-menu-item"
                    href="/admin/permissions"
                    onClick={() => closeMenu()}
                  >
                    <Icon name="settings" size={16} />
                    <span>เมทริกซ์สิทธิ์</span>
                  </a>
                )}

                {/* Management-only — audit log viewer (Task 18) */}
                {isManagement(session?.user?.roles) && (
                  <a
                    className="ac-user-menu-item"
                    href="/admin/audit"
                    onClick={() => closeMenu()}
                  >
                    <Icon name="history" size={16} />
                    <span>Audit log</span>
                  </a>
                )}

                {/* Management-only — backup zip download. Best-effort:
                    a "loading..." replacement text would need state, skip
                    for now since 7 fetches are usually < 2s. */}
                {isManagement(session?.user?.roles) && (
                  <button
                    type="button"
                    className="ac-user-menu-item"
                    onClick={async () => {
                      closeMenu();
                      try {
                        toast.info("กำลังสร้าง backup…");
                        const { downloadBackupZip } = await import("@/lib/backupZip");
                        await downloadBackupZip();
                        toast.success("ดาวน์โหลด backup สำเร็จ");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Backup ล้มเหลว");
                      }
                    }}
                  >
                    <Icon name="summary" size={16} />
                    <span>ดาวน์โหลด Backup</span>
                  </button>
                )}

                <button
                  className="ac-user-signout"
                  onClick={() => {
                    closeMenu();
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
