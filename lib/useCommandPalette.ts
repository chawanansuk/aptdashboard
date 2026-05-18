"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Global keyboard binding for the command palette.
 *
 * Triggers:
 *   - Cmd+K (Mac) / Ctrl+K (Win/Linux) — always
 *   - "/" — only when focus is NOT in an input/textarea/contenteditable
 *
 * Closes:
 *   - Escape (handled inside palette component)
 *   - any selection / route change (caller responsibility)
 */
export function useCommandPalette(): {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
} {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    function isTypingTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (t.isContentEditable) return true;
      return false;
    }

    function onKey(e: KeyboardEvent) {
      // Cmd+K (Mac) / Ctrl+K (Win) — always opens, even from inputs
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // "/" — only when not typing
      if (e.key === "/" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
        return;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { open, setOpen, toggle };
}
