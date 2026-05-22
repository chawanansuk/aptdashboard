"use client";

import { useEffect, useRef } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";

/**
 * Keyboard shortcut cheatsheet — invoked by pressing `?` from
 * anywhere outside a text input. Single source of truth for the
 * app's keyboard surface so users can discover every shortcut
 * without hunting through code or docs.
 *
 * Add a new shortcut here whenever a new one is wired in app/page
 * or a child component — keeps user-facing reference in sync with
 * implementation.
 */

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Shortcut {
  keys: string[];      // visual keys, e.g. ["⌘", "K"] or ["/"]
  label: string;
  hint?: string;
}

const GROUPS: Array<{ title: string; items: Shortcut[] }> = [
  {
    title: "ค้นหา / นำทาง",
    items: [
      { keys: ["⌘", "K"], label: "Command palette", hint: "ค้นหาห้อง · ผู้เช่า · เบอร์ · ทะเบียนรถ · หน้า" },
      { keys: ["Ctrl", "K"], label: "Command palette (Windows)" },
      { keys: ["/"],         label: "โฟกัสช่องค้นหาบนหน้า", hint: "ใช้ใน list views" },
      { keys: ["Esc"],       label: "ปิด modal / panel", hint: "RoomModal, AddTask, Drawer, Sidebar" },
    ],
  },
  {
    title: "Action ทั่วไป",
    items: [
      { keys: ["N"], label: "เปิดฟอร์มเพิ่มงาน" },
      { keys: ["R"], label: "รีเฟรชข้อมูล" },
      { keys: ["?"], label: "เปิดหน้าช่วยเหลือนี้" },
    ],
  },
  {
    title: "Task Detail Drawer / Kanban",
    items: [
      { keys: ["Enter"], label: "เปิด drawer ของการ์ดที่ focus" },
      { keys: ["Space"], label: "เปิด drawer (เหมือน Enter)" },
    ],
  },
];

export default function KeyboardHelpModal({ open, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(open, ref);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ac-modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={ref}
        className="ac-modal ac-help-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ac-help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ac-modal-head">
          <h2 id="ac-help-title">⌨ คีย์ลัด</h2>
          <button
            type="button"
            className="ac-modal-close"
            onClick={onClose}
            aria-label="ปิด"
          >×</button>
        </header>

        <div className="ac-modal-body ac-help-body">
          {GROUPS.map((group) => (
            <section key={group.title} className="ac-help-group">
              <h3 className="ac-help-group-title">{group.title}</h3>
              <ul className="ac-help-list">
                {group.items.map((s, i) => (
                  <li key={`${group.title}-${i}`}>
                    <span className="ac-help-keys">
                      {s.keys.map((k, j) => (
                        <kbd key={j}>{k}</kbd>
                      ))}
                    </span>
                    <span className="ac-help-text">
                      <span>{s.label}</span>
                      {s.hint && <span className="ac-help-hint">{s.hint}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
