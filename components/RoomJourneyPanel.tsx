"use client";

import { useState } from "react";
import type { RoomView } from "@/types";
import {
  deriveJourney, TURNOVER_STEP_LABELS, type JourneyAction,
} from "@/lib/roomJourney";

/**
 * RoomJourneyPanel — "ขั้นตอนถัดไป" ปุ่มเดียวตามตำแหน่งของห้องใน
 * lifecycle ที่ทีมใช้จริง:
 *
 *   ว่าง → ชมห้อง → จอง(รอสัญญา) → มีผู้เช่า → แจ้งย้ายออก →
 *   สะอาดก่อนตรวจ → ตรวจ+คืนประกัน → ซ่อม → สะอาดหลังซ่อม →
 *   QC checklist → ว่าง
 *
 * Stage detection lives in lib/roomJourney (pure + tested). This
 * component renders the stepper + dispatches the chosen action to a
 * single handler the host provides. Renders nothing for rooms outside
 * the journey (stage "other") so non-turnover repair flows keep their
 * existing UI.
 */

interface Props {
  room: RoomView;
  /** Dispatch a journey action — the host maps ids to API calls. */
  onAction: (action: JourneyAction["id"]) => void | Promise<void>;
}

export default function RoomJourneyPanel({ room, onAction }: Props) {
  const [busy, setBusy] = useState(false);
  const j = deriveJourney(room);

  if (j.stage === "other") return null;

  async function run(id: JourneyAction["id"]) {
    if (busy) return;
    setBusy(true);
    try {
      await onAction(id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ac-journey" role="region" aria-label="ขั้นตอนถัดไปของห้อง">
      {/* Turnover stepper — only inside the moveout→ready pipeline. */}
      {j.step && (
        <ol className="ac-journey-steps" aria-label={`ขั้นตอน ${j.step[0]} จาก ${j.step[1]}`}>
          {TURNOVER_STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const state =
              n < j.step![0] ? "done" : n === j.step![0] ? "current" : "todo";
            return (
              <li key={label} className={`ac-journey-step is-${state}`}>
                <span className="ac-journey-step-dot" aria-hidden>
                  {state === "done" ? "✓" : n}
                </span>
                <span className="ac-journey-step-label">{label}</span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="ac-journey-body">
        <h3 className="ac-journey-title">{j.title}</h3>
        {j.subtitle && <p className="ac-journey-sub">{j.subtitle}</p>}
        {j.actions.length > 0 && (
          <div className="ac-journey-actions">
            {j.actions.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`ac-btn ${a.variant === "primary" ? "ac-btn-primary" : "ac-btn-secondary"}`}
                disabled={busy}
                onClick={() => void run(a.id)}
              >
                {busy ? "กำลังบันทึก…" : a.label}
              </button>
            ))}
          </div>
        )}
        {j.actions.length === 0 && j.step && (
          <p className="ac-journey-waiting">⏳ รอปิดงานในกระดานงานช่าง แล้วขั้นถัดไปจะโผล่ที่นี่</p>
        )}
      </div>
    </div>
  );
}
