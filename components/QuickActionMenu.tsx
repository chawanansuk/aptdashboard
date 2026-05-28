"use client";

import { useEffect, useRef } from "react";

/**
 * A single entry in the Quick Action dropdown. The shortcut letter
 * is a single Latin character (case-insensitive). `visible` is the
 * permission gate — hidden items just don't render rather than
 * appearing disabled (cleaner for staff with limited roles).
 */
export interface QuickAction {
  id: string;
  label: string;
  shortcut: string;     // single letter
  icon?: string;        // emoji is fine — matches the rest of the UI
  description?: string;
  visible: boolean;
  onSelect: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  actions: QuickAction[];
}

/**
 * QuickActionMenu — the "+ เพิ่ม" dropdown in the top nav (Problem #16).
 *
 * Replaces the scattered "+ เพิ่มงาน" / "+ นัดลูกค้า" buttons that did
 * different things depending on which mode the user was in. Now there's
 * one entry point with explicit choices and per-item shortcut letters,
 * so the same affordance works regardless of role.
 *
 * Open via the button click, the global `Q` shortcut (wired in page.tsx),
 * or pressing `N` for backwards compat with the old "เพิ่มงาน" shortcut.
 * Close via Esc, click outside, or selecting an item.
 */
export default function QuickActionMenu({ open, onClose, actions }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  // Esc + per-item shortcut letters. Only attached while open so we
  // don't fight other listeners (e.g. the global `R` for refresh on
  // the page level — that handler bails out when this menu is open).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      // Ignore modifiers + form fields — same rules as the page-level
      // shortcut handler.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      const k = e.key.toUpperCase();
      const hit = actions.find((a) => a.visible && a.shortcut.toUpperCase() === k);
      if (hit) {
        e.preventDefault();
        e.stopPropagation();
        hit.onSelect();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, actions, onClose]);

  // Move focus into the menu when it opens so screen readers + keyboard
  // users land on the first item rather than the trigger.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => firstItemRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, [open]);

  if (!open) return null;

  const visibleActions = actions.filter((a) => a.visible);
  if (visibleActions.length === 0) return null;

  return (
    <>
      <div
        className="ac-quick-menu-backdrop"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={menuRef}
        className="ac-quick-menu"
        role="menu"
        aria-label="เพิ่มรายการใหม่"
        onClick={(e) => {
          // Stop the click from bubbling to the trigger button (which
          // would re-toggle the menu open).
          e.stopPropagation();
          // If the click landed on the menu background (not an item),
          // ignore it — the backdrop handles close.
          if (e.target === e.currentTarget) return;
        }}
      >
        <div className="ac-quick-menu-head">
          <span className="ac-quick-menu-title">+ เพิ่ม</span>
          <span className="ac-quick-menu-hint">เลือก หรือกดตัวอักษรย่อ</span>
        </div>
        <ul className="ac-quick-menu-list" role="presentation">
          {visibleActions.map((a, i) => (
            <li key={a.id} role="presentation">
              <button
                ref={i === 0 ? firstItemRef : undefined}
                type="button"
                className="ac-quick-menu-item"
                role="menuitem"
                onClick={() => {
                  onClose();
                  a.onSelect();
                }}
                title={a.description || a.label}
              >
                {a.icon && <span className="ac-quick-menu-icon" aria-hidden>{a.icon}</span>}
                <span className="ac-quick-menu-label">{a.label}</span>
                <kbd className="ac-quick-menu-kbd" aria-label={`ปุ่มลัด ${a.shortcut}`}>{a.shortcut.toUpperCase()}</kbd>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
