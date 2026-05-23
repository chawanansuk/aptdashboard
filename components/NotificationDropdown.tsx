"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import type { NotificationItem } from "@/lib/notifications";
import { totalNotificationCount } from "@/lib/notifications";

interface Props {
  items: NotificationItem[];
  /** Called when a notification row is clicked. The dropdown
   *  closes immediately so the destination view sees focus. */
  onNavigate?: (route: string) => void;
}

/**
 * Notification dropdown — bell icon in the app header that opens a
 * dismissable panel listing things the user should look at today.
 *
 * The dropdown is fed a pre-computed list from `buildNotifications`
 * (no fetching happens here). This keeps the header dumb and lets
 * the page-level data hooks own caching / refresh cadence.
 *
 * Closes on:
 *  - clicking outside the panel
 *  - pressing Escape
 *  - selecting a row (the caller navigates away)
 */
export default function NotificationDropdown({ items, onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const total = totalNotificationCount(items);
  const hasAny = total > 0;

  // Outside click — click anywhere outside the wrapper closes the panel.
  // Using mousedown (not click) so a click that releases over the trigger
  // doesn't immediately reopen via the toggle handler.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // ESC closes — separate listener since outside-click handler doesn't
  // fire for keyboard-only users.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const badgeText = total > 9 ? "9+" : String(total);
  const ariaLabel = hasAny
    ? `แจ้งเตือน ${total} รายการ`
    : "ไม่มีแจ้งเตือน";

  return (
    <div className="ac-notif" ref={wrapRef}>
      <button
        type="button"
        className={`ac-icon-btn ac-notif-trigger ${hasAny ? "has-items" : ""}`}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        title={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="bell" size={16} />
        {hasAny && (
          <span className="ac-notif-badge" aria-hidden>{badgeText}</span>
        )}
      </button>

      {open && (
        <div className="ac-notif-panel" role="menu" aria-label="รายการแจ้งเตือน">
          <header className="ac-notif-panel-head">
            <span className="ac-notif-panel-title">แจ้งเตือน</span>
            {hasAny && (
              <span className="ac-notif-panel-count">{total}</span>
            )}
          </header>
          {items.length === 0 ? (
            <div className="ac-notif-empty">
              <div className="ac-notif-empty-glyph" aria-hidden>✓</div>
              <div className="ac-notif-empty-text">ทุกอย่างเรียบร้อย — ไม่มีงานเร่งด่วน</div>
            </div>
          ) : (
            <ul className="ac-notif-list">
              {items.map((it) => {
                const clickable = !!(it.route && onNavigate);
                return (
                  <li key={it.kind}>
                    <button
                      type="button"
                      role="menuitem"
                      className={`ac-notif-row ac-notif-row--${it.level} ${clickable ? "is-clickable" : ""}`}
                      onClick={() => {
                        if (!clickable) return;
                        setOpen(false);
                        onNavigate!(it.route!);
                      }}
                      disabled={!clickable}
                    >
                      <span className="ac-notif-row-glyph" aria-hidden>{it.glyph}</span>
                      <span className="ac-notif-row-main">
                        <span className="ac-notif-row-title">{it.title}</span>
                        <span className="ac-notif-row-detail">{it.detail}</span>
                      </span>
                      <span className="ac-notif-row-count" aria-label={`${it.count} รายการ`}>
                        {it.count > 99 ? "99+" : it.count}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
