/**
 * Cross-unit turnover notifications — bridges sales ↔ engineer when work
 * moves between them. Helpers split into three roles:
 *
 *   1. publishers — call after a successful write (auto-prep created,
 *      engineer task closed) to broadcast a structured event on the bus.
 *   2. message formatter — turns an event into Thai toast copy + a hint
 *      about who should see it.
 *   3. relevance gate — given a user's roles, decide whether an inbound
 *      event is interesting enough to toast (sales doesn't care that
 *      another engineer finished an inspection; engineers don't need a
 *      moveout-started toast when they were the one who triggered it).
 *
 * Why a separate module: lets us unit-test the formatter + relevance
 * gate without mounting React, and keeps app/page.tsx's subscriber thin.
 */

import type { Role } from "@/auth";
import type { SheetRow } from "@/types";
import { publishBusEvent, type BusEvent, type TurnoverStep } from "@/lib/realtimeBus";
import { isClosedStatus } from "@/lib/constants";
import { detectTurnoverStep } from "@/lib/moveoutTasks";

/* -------- publishers ------------------------------------------------- */

/**
 * Engineer closed a turnover-tagged task. Skips silently when the task
 * isn't part of the turnover flow or the new status isn't a closed one,
 * so callers can fire this on every status change without pre-filtering.
 */
export function publishTurnoverStepDone(task: SheetRow, newStatus: string): void {
  if (!isClosedStatus(newStatus)) return;
  const step = detectTurnoverStep(task);
  if (!step) return;
  publishBusEvent({
    kind: "turnover-step-done",
    building: task.building,
    room: task.room,
    step,
    ts: Date.now(),
  });
}

/** Sales triggered an auto-moveout — fires once per room, not per task. */
export function publishTurnoverStarted(building: string, room: string): void {
  publishBusEvent({
    kind: "turnover-started",
    building,
    room,
    ts: Date.now(),
  });
}

/* -------- message formatter ----------------------------------------- */

const STEP_LABEL: Record<TurnoverStep, string> = {
  "inspect":            "ตรวจห้อง",
  "moveout-clean":      "ทำสะอาดหลังย้ายออก",
  "repair":             "ซ่อม",
  "after-repair-clean": "ทำสะอาดหลังซ่อม",
  "qc":                 "QC ก่อนปล่อยขาย",
};

export interface TurnoverToast {
  title: string;
  body?: string;
  /** "success" for handoff-ready, "info" for in-progress updates. */
  tone: "success" | "info";
}

export function formatTurnoverToast(e: BusEvent): TurnoverToast | null {
  if (e.kind === "turnover-step-done") {
    const room = `${e.building}-${e.room}`;
    if (e.step === "qc") {
      return {
        title: `ห้อง ${room} พร้อมปล่อยขาย`,
        body: "QC ผ่านแล้ว — เปลี่ยนสถานะเป็น 'ว่าง' ได้เลย",
        tone: "success",
      };
    }
    return {
      title: `ห้อง ${room}: ${STEP_LABEL[e.step]} เสร็จแล้ว`,
      tone: "info",
    };
  }
  if (e.kind === "turnover-started") {
    return {
      title: `ห้อง ${e.building}-${e.room} เข้า turnover`,
      body: "งานใหม่: ตรวจห้อง + ทำสะอาด ถูกสร้างให้ฝ่ายช่างแล้ว",
      tone: "info",
    };
  }
  return null;
}

/* -------- relevance gate -------------------------------------------- */

/**
 * Should this user's UI toast for `e`? Keeps cross-unit signals visible
 * to the side that benefits, silent to the side that already knows.
 *
 * - turnover-step-done → sales sees it (engineer just handed off).
 *   Management sees it too (oversees both units).
 * - turnover-started   → engineer sees it (incoming work).
 *   Management again — but NOT sales, who triggered it locally and
 *   already got the autoCreateMoveoutPrep toast.
 */
export function isTurnoverEventRelevant(e: BusEvent, roles: Role[]): boolean {
  if (e.kind === "turnover-step-done") {
    return roles.includes("sales") || roles.includes("management");
  }
  if (e.kind === "turnover-started") {
    return roles.includes("engineer") || roles.includes("management");
  }
  return false;
}
