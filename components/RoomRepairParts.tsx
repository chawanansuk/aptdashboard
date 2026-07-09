"use client";

import { useEffect, useState } from "react";
import type { Part, Requisition } from "@/types";

/**
 * Parts picker + per-room usage list for the repair tab.
 *
 * The requisition backend has carried building/room/taskKey since
 * v3.16 — but the only UI that filed one lived in the parts inventory
 * page, so repairs and stock never actually met. This closes the loop:
 *   - <RepairPartsPicker>: optional "เบิกอะไหล่" rows the repair submit
 *     files against THIS room
 *   - <RoomPartsUsed>: what's been withdrawn for this room so far
 *
 * Both fetch lazily on mount (the repair tab renders them only when
 * opened) and stay quiet on error — parts are a bonus on top of the
 * repair log, never a blocker for it.
 */

export interface RepairPartLine {
  partId: string;
  quantity: number;
}

export function RepairPartsPicker({
  lines, onChange, disabled,
}: {
  lines: RepairPartLine[];
  onChange: (next: RepairPartLine[]) => void;
  disabled?: boolean;
}) {
  const [parts, setParts] = useState<Part[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/parts", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (alive) setParts((data.rows || []) as Part[]);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Inventory unavailable (network / no permission) — hide the picker
  // entirely rather than showing a dead control.
  if (failed) return null;

  const set = (i: number, patch: Partial<RepairPartLine>) => {
    onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  };

  return (
    <div className="ac-repair-parts">
      <div className="ac-form-section-label">🔩 เบิกอะไหล่ที่ใช้ <span className="ac-form-section-optional">(ไม่บังคับ)</span></div>
      {lines.map((line, i) => (
        <div key={i} className="ac-repair-parts-row">
          <select
            value={line.partId}
            onChange={(e) => set(i, { partId: e.target.value })}
            disabled={disabled || !parts}
          >
            <option value="">{parts ? "- เลือกอะไหล่ -" : "กำลังโหลด…"}</option>
            {(parts || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (คงเหลือ {p.stock} {p.unit || "ชิ้น"})
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={line.quantity || ""}
            placeholder="จำนวน"
            onChange={(e) => set(i, { quantity: Number(e.target.value) })}
            disabled={disabled}
            aria-label="จำนวนที่เบิก"
          />
          <button
            type="button"
            className="ac-btn ac-btn-ghost ac-repair-parts-remove"
            onClick={() => onChange(lines.filter((_, j) => j !== i))}
            disabled={disabled}
            aria-label="ลบรายการนี้"
          >✕</button>
        </div>
      ))}
      <button
        type="button"
        className="ac-btn ac-btn-ghost ac-btn-sm"
        onClick={() => onChange([...lines, { partId: "", quantity: 1 }])}
        disabled={disabled}
      >+ เพิ่มอะไหล่</button>
    </div>
  );
}

/** Recent withdrawals for this room — name × qty · date · who. */
export function RoomPartsUsed({ building, room }: { building: string; room: string }) {
  const [rows, setRows] = useState<Requisition[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/part-requisitions", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (alive) setRows((data.rows || []) as Requisition[]);
      } catch {
        if (alive) setRows([]); // quiet — usage list is informational
      }
    })();
    return () => { alive = false; };
  }, [building, room]);

  if (rows === null) return null; // loading — section appears when ready
  const mine = rows
    .filter((r) => r.building === building && r.room === room)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .slice(0, 10);

  return (
    <div className="ac-repair-parts-used">
      <div className="ac-form-section-label">📦 อะไหล่ที่เคยเบิกให้ห้องนี้</div>
      {mine.length === 0 ? (
        <span className="ac-field-hint">ยังไม่มีการเบิกอะไหล่ของห้องนี้</span>
      ) : (
        <ul className="ac-repair-parts-list">
          {mine.map((r) => (
            <li key={r.id}>
              <span className="ac-repair-parts-name">{r.partName}</span>
              <span className="ac-repair-parts-qty">× {r.quantity}</span>
              <span className="ac-repair-parts-meta">
                {(r.createdAt || "").slice(5, 10)}{r.user ? ` · ${r.user.split("@")[0]}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
