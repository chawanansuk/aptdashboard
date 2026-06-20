/**
 * Dashboard side-effect actions — fire-and-forget API sequences that
 * used to live inline in app/page.tsx (PR 1 of the page.tsx breakup).
 *
 * Everything here shares three properties:
 *   - no React state: pure async functions over fetch + toast + bus
 *   - best-effort: failures log/no-op, they never block the primary
 *     write that triggered them
 *   - previously untestable (buried in a 1,600-line component); now
 *     covered by lib/dashboardActions.test.ts with a mocked fetch
 *
 * Callers pass live data (`tasks`) and callbacks (`onCreated`) instead
 * of the functions reaching into component state.
 */

import type { SheetRow, Lead } from "@/types";
import { toast } from "@/lib/toast";
import { publishBusEvent } from "@/lib/realtimeBus";
import { publishTurnoverStarted } from "@/lib/turnoverNotifications";
import {
  findLeadByPhone,
  nextStageOnViewingClosed,
  STAGE_ON_VIEWING_SCHEDULED,
} from "@/lib/leadLink";
import {
  MOVEOUT_PREP_KINDS,
  hasOpenPrepTask,
  todayThaiDate,
} from "@/lib/moveoutTasks";
import type { TaskFormValues } from "@/lib/taskSchema";

/**
 * Auto-link a "ชมห้อง" (viewing) task to the Lead CRM (ผู้สนใจเช่า):
 * ensure a lead exists for the prospect's phone so conversion can be
 * tracked without sales doing extra data entry. Correlated by phone; an
 * existing lead is left untouched (never regress its stage). Fire-and-
 * forget — the task is already saved, so failures here never block it.
 * Requires lead.edit (sales/management) — engineers get 403 → no-op.
 */
export async function linkLeadOnViewingScheduled(
  values: Pick<TaskFormValues, "type" | "phone" | "customer" | "building" | "room">,
): Promise<void> {
  if (values.type !== "ชมห้อง") return;
  const phone = (values.phone || "").trim();
  if (!phone) return; // can't track or dedup without a phone
  try {
    const res = await fetch("/api/leads", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const leads: Lead[] = data.rows || [];
    if (findLeadByPhone(leads, phone)) return; // already tracked — keep stage
    const roomLabel = [values.building, values.room].filter(Boolean).join("-");
    const addRes = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add",
        name: values.customer || "",
        phone,
        source: "อื่นๆ",
        interest: roomLabel ? `นัดชมห้อง ${roomLabel}` : "",
        stage: STAGE_ON_VIEWING_SCHEDULED,
        note: "สร้างอัตโนมัติจากการนัดชมห้อง",
      }),
    });
    const addData = await addRes.json().catch(() => ({ ok: false }));
    if (addData.ok) toast.success("เพิ่มผู้สนใจเช่าอัตโนมัติแล้ว");
  } catch (e) {
    console.warn("[lead-link] scheduled failed (non-blocking)", e);
  }
}

/**
 * When a "ชมห้อง" task is closed, advance the linked lead's pipeline
 * stage: "เสร็จ" (viewed) → กำลังคุย, "ไม่สนใจ" → ปิดเลิก. No-ops on
 * other statuses, when no phone, or when no matching lead exists.
 * Fire-and-forget — the close itself already succeeded.
 */
export async function bumpLeadOnViewingClosed(
  t: SheetRow,
  status: string,
): Promise<void> {
  if (t.type !== "ชมห้อง") return;
  const phone = (t.phone || "").trim();
  if (!phone) return;
  if (status !== "เสร็จ" && status !== "ไม่สนใจ") return;
  try {
    const res = await fetch("/api/leads", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const leads: Lead[] = data.rows || [];
    const lead = findLeadByPhone(leads, phone);
    if (!lead) return;
    const next = nextStageOnViewingClosed(lead.stage, status);
    if (!next || next === lead.stage) return;
    const upRes = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id: lead.id, stage: next }),
    });
    const upData = await upRes.json().catch(() => ({ ok: false }));
    if (upData.ok) toast.success(`อัปเดตผู้สนใจเช่า → ${next}`);
  } catch (e) {
    console.warn("[lead-link] close failed (non-blocking)", e);
  }
}

/**
 * Auto-create the two engineer prep tasks (ตรวจห้อง + ทำสะอาด) for a
 * room that just entered "แจ้งย้ายออก". Silently skips a task type if
 * one already exists open. Errors here don't block the room save — the
 * user can still create tasks manually via the workflow buttons.
 *
 * `tasks` is the caller's live list (dup guard); `onCreated` runs once
 * if anything was actually filed (page passes `refresh`).
 */
export async function autoCreateMoveoutPrep(
  tasks: SheetRow[],
  building: string,
  room: string,
  onCreated?: () => void,
): Promise<void> {
  const created: string[] = [];
  for (const kind of MOVEOUT_PREP_KINDS) {
    if (hasOpenPrepTask(tasks, building, room, kind.type)) continue;
    try {
      const r = await fetch("/api/sheet/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addTask",
          date: todayThaiDate(),
          type: kind.type,
          building,
          room,
          note: kind.note,
        }),
      });
      const j = await r.json().catch(() => ({ ok: false }));
      if (j.ok) created.push(kind.label);
    } catch {
      /* ignore — silent best-effort */
    }
  }
  if (created.length > 0) {
    toast.success(`สร้างงานเตรียมห้องอัตโนมัติ: ${created.join(" + ")}`);
    publishBusEvent({ kind: "data-changed", source: "task", ts: Date.now() });
    publishTurnoverStarted(building, room);
    onCreated?.();
  }
}
