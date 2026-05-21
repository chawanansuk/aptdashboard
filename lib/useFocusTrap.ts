"use client";

import { useEffect, type RefObject } from "react";

/**
 * useFocusTrap — keep keyboard focus inside an open dialog/drawer.
 *
 * Why custom (not Radix Dialog): codebase has no Radix dependency and
 * the modal CSS+structure is already in place; this is the minimal
 * add to make them accessible without a refactor.
 *
 * Behavior:
 *  - On `active=true`: focus the first focusable element inside `containerRef`.
 *  - Tab / Shift+Tab: cycle within the container, skipping disabled/hidden.
 *  - Escape: caller decides (we don't preventDefault — modals already wire it).
 *  - On `active=false` or unmount: restore focus to the element that was
 *    focused before the dialog opened.
 *
 * Not handled (intentionally minimal):
 *  - Inert/aria-hidden the rest of the page (out of scope for our modals
 *    which already use a full-screen backdrop)
 *  - Portal containment (modals are rendered in-place; React tree order
 *    matches DOM tab order)
 */

const FOCUSABLE_SELECTOR = [
  'a[href]:not([disabled])',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const container = containerRef.current;
    if (!container) return;

    // Remember the element to return focus to when the dialog closes.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus inside the container if it isn't already there.
    if (!container.contains(document.activeElement)) {
      const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const focusables = container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusables || focusables.length === 0) return;
      const visible = Array.from(focusables).filter((el) => {
        // Skip elements rendered but visually hidden (display:none / disabled)
        return (
          el.offsetParent !== null ||
          (typeof el.checkVisibility === "function" && el.checkVisibility())
        );
      });
      if (visible.length === 0) return;
      const first = visible[0];
      const last = visible[visible.length - 1];
      const current = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        // Shift+Tab on first element → wrap to last
        if (current === first || !container?.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab on last element → wrap to first
        if (current === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Restore focus to the trigger that opened the dialog
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        try { previouslyFocused.focus(); } catch { /* ignore */ }
      }
    };
  }, [active, containerRef]);
}
