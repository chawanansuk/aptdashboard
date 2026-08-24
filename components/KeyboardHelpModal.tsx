"use client";

import { useEffect, useRef } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { modKey } from "@/lib/platform";

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

// ป้ายคีย์ตามเครื่องจริง (modKey → ⌘ บน Mac, Ctrl ที่อื่น) — เดิม fix "⌘"
// แล้วต้องมีแถว "(Windows)" ซ้ำอีกแถว. สร้างเป็นฟังก์ชันเพราะ modKey อ่าน
// navigator ได้ตอนเรนเดอร์ฝั่ง client เท่านั้น (modal นี้ mount หลังกดปุ่ม).
const buildGroups = (mod: string): Array<{ title: string; items: Shortcut[] }> => [
  {
    title: "ค้นหา / นำทาง",
    items: [
      { keys: [mod, "K"], label: "Command palette", hint: "ค้นหาห้อง · ผู้เช่า · เบอร์ · ทะเบียนรถ · หน้า" },
      { keys: ["/"],         label: "โฟกัสช่องค้นหาบนหน้า", hint: "ใช้ใน list views" },
      { keys: ["Esc"],       label: "ปิด modal / panel", hint: "RoomModal, AddTask, Drawer, Sidebar" },
    ],
  },
  {
    title: "Action ทั่วไป",
    items: [
      { keys: ["Q"], label: "เปิดเมนูเพิ่ม (Quick Action)", hint: "N ก็ใช้ได้ · ในเมนูกด L/V/I/O/C/R" },
      { keys: ["R"], label: "รีเฟรชข้อมูล" },
      { keys: ["?"], label: "เปิดหน้าช่วยเหลือนี้" },
      { keys: ["["], label: "ย่อ / ขยายเมนูข้าง", hint: "Desktop เท่านั้น" },
    ],
  },
  {
    title: "Task Detail Drawer / Kanban",
    items: [
      { keys: ["Enter"], label: "เปิด drawer ของการ์ดที่ focus" },
      { keys: ["Space"], label: "เปิด drawer (เหมือน Enter)" },
    ],
  },
  {
    title: "Room Modal",
    items: [
      { keys: ["←"], label: "ห้องก่อนหน้า", hint: "หรือ K (vim style)" },
      { keys: ["→"], label: "ห้องถัดไป", hint: "หรือ J (vim style)" },
      { keys: [mod, "Enter"], label: "บันทึก (ระหว่างแก้ไข)" },
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
          {buildGroups(modKey()).map((group) => (
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
