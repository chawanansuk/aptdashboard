/**
 * Room journey — the full lifecycle state machine the team works by:
 *
 *   ห้องว่างพร้อมขาย → นัดดูห้อง → มัดจำจอง(รอสัญญา) → มีผู้เช่า →
 *   แจ้งย้ายออก → ทำสะอาดก่อนตรวจ → รอตรวจห้อง+คืนเงินประกัน →
 *   (มีซ่อม? → รอซ่อม → ทำสะอาดหลังซ่อม) → Checklist QC ก่อนปล่อยขาย →
 *   ห้องว่างพร้อมขาย
 *
 * Steps 1-5 already map 1:1 onto RoomStatus values. Steps 6-10 (the
 * turnover pipeline) all live inside the moveout→ready window where the
 * sheet has no per-step status — so this module derives the current
 * sub-stage from the room's OWN tasks (type + note-prefix markers from
 * lib/moveoutTasks). No new sheet column, no Apps Script change.
 *
 * Pure functions only — the UI panel (RoomJourneyPanel) renders what
 * this returns and wires the actions; tests cover every transition.
 */

import type { RoomView, SheetRow } from "@/types";
import { isClosedStatus, isDoneStatus } from "@/lib/constants";
import { parseThaiDate } from "@/lib/dateUtils";
import {
  MOVEOUT_CLEAN_TYPE, MOVEOUT_CLEAN_NOTE,
  MOVEOUT_INSPECT_TYPE, MOVEOUT_INSPECT_NOTE,
  AFTER_REPAIR_CLEAN_TYPE, AFTER_REPAIR_CLEAN_NOTE,
  QC_CHECKLIST_TYPE, QC_CHECKLIST_NOTE,
  TURNOVER_REPAIR_TYPE, TURNOVER_REPAIR_NOTE,
} from "@/lib/moveoutTasks";

/* ====================================================================
 * Stages
 * ==================================================================== */

export type JourneyStage =
  // -- selling side (status-driven) --
  | "ready"            // ห้องว่างพร้อมขาย (อาจมีนัดชมห้องค้าง)
  | "pending"          // มัดจำจอง รอทำสัญญา/ย้ายเข้า
  | "occupied"         // มีผู้เช่า
  // -- turnover side (moveout → ready, task-driven sub-stages) --
  | "moveout-start"    // แจ้งย้ายออก — ยังไม่เริ่มเตรียมห้อง
  | "cleaning-before"  // กำลังทำความสะอาดก่อนตรวจ
  | "await-inspect"    // สะอาดแล้ว — รอสร้าง/รอตรวจห้องคืนเงินประกัน
  | "inspecting"       // มีงานตรวจค้างอยู่ (ช่างกำลังตรวจ)
  | "inspect-done"     // ตรวจเสร็จ — เลือกเส้นทาง: มีซ่อม / ไม่มีซ่อม
  | "repairing"        // ช่างกำลังซ่อมตามผลตรวจ
  | "cleaning-after"   // ทำสะอาดหลังซ่อม
  | "qc-checklist"     // Checklist สภาพห้องก่อนปล่อยขาย
  | "release-ready"    // ทุกอย่างผ่าน — ปุ่มเดียว: ปล่อยขาย
  | "other";           // qc/repair/inactive ที่ไม่ได้อยู่ใน turnover flow

/** A next-step action the panel can render as a button. */
export interface JourneyAction {
  id:
    | "addViewing"        // นัดชมห้อง (ชมห้อง task)
    | "confirmBooking"    // เปิด BookingConfirm flow
    | "confirmMoveIn"     // pending → มีผู้เช่า
    | "noticeMoveout"     // occupied → แจ้งย้ายออก
    | "createCleanBefore" // สร้างงานทำสะอาดก่อนตรวจ
    | "createInspect"     // สร้างงานตรวจห้อง+คืนประกัน
    | "createRepair"      // ตรวจพบปัญหา → สร้างงานซ่อม
    | "skipRepair"        // ไม่มีซ่อม → ข้ามไป QC
    | "createCleanAfter"  // สร้างงานทำสะอาดหลังซ่อม
    | "createQcChecklist" // สร้างงาน Checklist QC
    // Close-step actions — sales operates the app for the whole team
    // (ทิศ B), so every waiting stage is closeable inline instead of
    // requiring a hop to the engineer kanban:
    | "doneCleanBefore"   // ปิดงานทำสะอาดก่อนตรวจ
    | "doneInspect"       // ปิดงานตรวจห้อง+คืนประกัน
    | "doneRepair"        // ปิดงานซ่อมตามผลตรวจ
    | "doneCleanAfter"    // ปิดงานทำสะอาดหลังซ่อม
    | "doneQc"            // ปิดงาน Checklist QC
    | "releaseNow"        // ทางลัด: ยกเลิกงานค้าง + ปล่อยขายทันที
    | "releaseRoom";      // → ว่าง (ปล่อยขาย)
  label: string;
  /** Visual weight — primary = the expected next step. */
  variant: "primary" | "secondary";
}

/** ทางลัดปล่อยขาย — offered as a secondary escape hatch on every
 *  turnover stage (the user asked for moveout → ว่าง in one press).
 *  The executor confirms + cancels open prep tasks before releasing. */
const RELEASE_NOW: JourneyAction = {
  id: "releaseNow",
  label: "⚡ ปล่อยขายเลย (ข้ามขั้นตอนที่เหลือ)",
  variant: "secondary",
};

export interface JourneyState {
  stage: JourneyStage;
  /** Step position for the stepper UI: [current, total] of the turnover
   *  pipeline. Null on the selling side (ready/pending/occupied). */
  step: [number, number] | null;
  /** Thai headline for the panel. */
  title: string;
  /** One-line context (e.g. who's working, what we're waiting on). */
  subtitle: string;
  actions: JourneyAction[];
}

/* ====================================================================
 * Task matching helpers
 * ==================================================================== */

/** Stable match key — everything before the " —" separator, so users
 *  can append detail to a note without breaking stage detection.
 *  Exported for journeyActions' dup guard (same matching rule). */
export function markerKey(note: string): string {
  return note.split(" —")[0].trim();
}

function allTasks(room: RoomView): SheetRow[] {
  return [
    ...(room.todayTasks || []),
    ...(room.upcomingTasks || []),
    ...(room.pastTasks || []),
  ];
}

interface MarkerMatch {
  open: SheetRow | undefined;
  done: SheetRow | undefined;
}

/** Find open + done tasks matching (type, note-prefix). "done" requires
 *  isDoneStatus — a cancelled task counts as neither (treated as if the
 *  step hasn't been started, so the panel offers to create it again). */
function matchMarker(tasks: SheetRow[], type: string, note: string): MarkerMatch {
  const key = markerKey(note);
  let open: SheetRow | undefined;
  let done: SheetRow | undefined;
  for (const t of tasks) {
    if (t.type !== type) continue;
    if (!(t.note || "").trim().startsWith(key)) continue;
    if (isDoneStatus(t.status)) { done = done ?? t; continue; }
    if (!isClosedStatus(t.status)) { open = open ?? t; }
  }
  return { open, done };
}

/** Any open viewing appointment (for the ready-stage subtitle). */
function openViewing(tasks: SheetRow[]): SheetRow | undefined {
  return tasks.find((t) => t.type === "ชมห้อง" && !isClosedStatus(t.status));
}

/* ====================================================================
 * Cycle scoping — a room turns over many times across its life, and the
 * sheet keeps every task forever. Without scoping, a DONE QC checklist
 * from the previous tenancy makes a freshly-moveout room jump straight
 * to "พร้อมปล่อยขาย", and a stale OPEN clean from months ago wedges the
 * panel in a waiting stage — both reported as "ระบบรวน / กดไม่ได้".
 *
 * Every cycle starts with the clean-before task (the journey button and
 * the moveout auto-prep both file it), so the NEWEST clean-before dates
 * the current cycle. Marker tasks dated before it belong to a previous
 * turnover and are ignored; non-marker tasks pass through untouched.
 * ==================================================================== */

/** The five turnover marker specs the pipeline is derived from.
 *  Exported for journeyActions' release sweep. */
export const TURNOVER_MARKER_SPECS: ReadonlyArray<{ type: string; note: string }> = [
  { type: MOVEOUT_CLEAN_TYPE, note: MOVEOUT_CLEAN_NOTE },
  { type: MOVEOUT_INSPECT_TYPE, note: MOVEOUT_INSPECT_NOTE },
  { type: TURNOVER_REPAIR_TYPE, note: TURNOVER_REPAIR_NOTE },
  { type: AFTER_REPAIR_CLEAN_TYPE, note: AFTER_REPAIR_CLEAN_NOTE },
  { type: QC_CHECKLIST_TYPE, note: QC_CHECKLIST_NOTE },
];

function isMarkerTask(t: SheetRow, spec: { type: string; note: string }): boolean {
  return t.type === spec.type && (t.note || "").trim().startsWith(markerKey(spec.note));
}

/** Task date as a start-of-day timestamp; null when unparseable. */
function taskDayTime(t: SheetRow): number | null {
  const d = parseThaiDate(t.date);
  if (!d) return null;
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * All of the room's tasks with previous-cycle turnover markers removed.
 * Used by deriveJourney AND journeyActions' dup guard — they must agree,
 * or a stale open marker blocks the create the panel is offering.
 */
export function journeyScopedTasks(room: RoomView): SheetRow[] {
  const tasks = allTasks(room);
  // Anchor: newest clean-before (any status — even a cancelled one still
  // dates the cycle start).
  let anchor: number | null = null;
  for (const t of tasks) {
    if (!isMarkerTask(t, TURNOVER_MARKER_SPECS[0])) continue;
    const ts = taskDayTime(t);
    if (ts !== null && (anchor === null || ts > anchor)) anchor = ts;
  }
  if (anchor === null) return tasks;
  const cutoff = anchor;
  return tasks.filter((t) => {
    if (!TURNOVER_MARKER_SPECS.some((s) => isMarkerTask(t, s))) return true;
    const ts = taskDayTime(t);
    // Unparseable dates keep the old (unscoped) behavior — safer than
    // silently dropping a live task over a junk date cell.
    return ts === null || ts >= cutoff;
  });
}

/* ====================================================================
 * The state machine
 * ==================================================================== */

const TURNOVER_TOTAL = 5; // clean-before → inspect → repair → clean-after → QC

export function deriveJourney(room: RoomView): JourneyState {
  // Scoped: previous-cycle turnover markers removed (see journeyScopedTasks).
  const tasks = journeyScopedTasks(room);

  // ---- Selling side — driven by room status directly ----
  if (room.status === "ready") {
    const viewing = openViewing(tasks);
    return {
      stage: "ready",
      step: null,
      title: "ห้องว่างพร้อมขาย",
      subtitle: viewing
        ? `มีนัดชมห้อง ${viewing.date}${viewing.customer ? ` · ${viewing.customer}` : ""}`
        : "พร้อมรับลูกค้า — นัดชมห้องหรือรับจองได้เลย",
      actions: [
        { id: "confirmBooking", label: "📋 รับจอง (มัดจำ)", variant: "primary" },
        { id: "addViewing", label: "👀 นัดชมห้อง", variant: "secondary" },
      ],
    };
  }

  if (room.status === "pending") {
    return {
      stage: "pending",
      step: null,
      title: "มัดจำจองแล้ว — รอทำสัญญา/ย้ายเข้า",
      subtitle: room.tenant ? `ผู้จอง: ${room.tenant}` : "รอลูกค้าเข้าทำสัญญา",
      actions: [
        { id: "confirmMoveIn", label: "✅ ยืนยันเข้าอยู่ (→ มีผู้เช่า)", variant: "primary" },
      ],
    };
  }

  if (room.status === "occupied") {
    return {
      stage: "occupied",
      step: null,
      title: "มีผู้เช่า",
      subtitle: room.tenant ? `ผู้เช่า: ${room.tenant}` : "",
      actions: [
        { id: "noticeMoveout", label: "🚪 แจ้งย้ายออก", variant: "secondary" },
      ],
    };
  }

  // ---- Turnover side (moveout → ready) — task-marker-driven ----
  // Rooms in qc/repair status ride the same pipeline when their tasks
  // carry the turnover markers; plain qc/repair without markers falls
  // through to "other" so we don't hijack non-turnover repair flows.
  const inTurnover =
    room.status === "moveout" || room.status === "qc" || room.status === "repair";

  if (inTurnover) {
    const cleanBefore = matchMarker(tasks, MOVEOUT_CLEAN_TYPE, MOVEOUT_CLEAN_NOTE);
    const inspect = matchMarker(tasks, MOVEOUT_INSPECT_TYPE, MOVEOUT_INSPECT_NOTE);
    const repair = matchMarker(tasks, TURNOVER_REPAIR_TYPE, TURNOVER_REPAIR_NOTE);
    const cleanAfter = matchMarker(tasks, AFTER_REPAIR_CLEAN_TYPE, AFTER_REPAIR_CLEAN_NOTE);
    const qc = matchMarker(tasks, QC_CHECKLIST_TYPE, QC_CHECKLIST_NOTE);

    // Walk the pipeline backwards-safe: each stage requires the previous
    // one done. QC done → release. (Skip-repair path: inspect done with
    // no repair created → user explicitly chooses repair or skip.)
    //
    // Guard (audit r5): an OPEN repair outranks the QC branches — a room
    // with a passed/open QC but an unfinished repair must NOT show
    // "พร้อมปล่อยขาย" (releasing mid-repair hands a broken room to the
    // next tenant), nor hide the repair behind the checklist.
    if (repair.open) {
      return {
        stage: "repairing",
        step: [3, TURNOVER_TOTAL],
        title: "อยู่ระหว่างซ่อม",
        subtitle: qc.done
          ? "QC ผ่านแล้ว แต่ยังมีงานซ่อมค้าง — ปิดงานซ่อมก่อนปล่อยขาย"
          : "ซ่อมเสร็จแล้วกดปิดงานได้ที่นี่ หรือติดตามในกระดานงานช่าง",
        actions: [
          { id: "doneRepair", label: "✓ ซ่อมเสร็จแล้ว — ปิดงาน", variant: "primary" },
          RELEASE_NOW,
        ],
      };
    }
    if (qc.done) {
      return {
        stage: "release-ready",
        step: [TURNOVER_TOTAL, TURNOVER_TOTAL],
        title: "ผ่าน QC แล้ว — พร้อมปล่อยขาย",
        subtitle: "ทุกขั้นตอนเสร็จสิ้น กดปล่อยขายเพื่อเปลี่ยนเป็นห้องว่าง",
        actions: [
          { id: "releaseRoom", label: "🏠 ปล่อยขาย (→ ห้องว่าง)", variant: "primary" },
        ],
      };
    }
    if (qc.open) {
      return {
        stage: "qc-checklist",
        step: [5, TURNOVER_TOTAL],
        title: "Checklist สภาพห้องก่อนปล่อยขาย",
        subtitle: "ตรวจตามฟอร์ม QC 6 หมวด — ผ่านครบแล้วกดปิดงานที่นี่ได้เลย",
        actions: [
          { id: "doneQc", label: "✓ QC ผ่านแล้ว — ปิดงาน", variant: "primary" },
          RELEASE_NOW,
        ],
      };
    }
    if (cleanAfter.open) {
      return {
        stage: "cleaning-after",
        step: [4, TURNOVER_TOTAL],
        title: "ทำสะอาดหลังซ่อม",
        subtitle: "เสร็จแล้วกดปิดงานได้ที่นี่ หรือติดตามในกระดานงานช่าง",
        actions: [
          { id: "doneCleanAfter", label: "✓ ทำสะอาดเสร็จแล้ว — ปิดงาน", variant: "primary" },
          RELEASE_NOW,
        ],
      };
    }
    if (repair.done && !cleanAfter.done) {
      return {
        stage: "cleaning-after",
        step: [4, TURNOVER_TOTAL],
        title: "ซ่อมเสร็จแล้ว — ทำสะอาดหลังซ่อม",
        subtitle: "สร้างงานทำสะอาดรอบสุดท้ายก่อน QC",
        actions: [
          { id: "createCleanAfter", label: "🧹 สร้างงานทำสะอาดหลังซ่อม", variant: "primary" },
          RELEASE_NOW,
        ],
      };
    }
    // (repair.open handled up top — it outranks the QC branches.)
    if (cleanAfter.done && !qc.open && !qc.done) {
      // Skip-repair path completed its clean — straight to QC.
      return {
        stage: "qc-checklist",
        step: [5, TURNOVER_TOTAL],
        title: "พร้อมตรวจ QC ก่อนปล่อยขาย",
        subtitle: "สร้างงาน Checklist เพื่อให้ช่างตรวจตามฟอร์ม",
        actions: [
          { id: "createQcChecklist", label: "✅ สร้างงาน Checklist QC", variant: "primary" },
          RELEASE_NOW,
        ],
      };
    }
    if (inspect.done) {
      return {
        stage: "inspect-done",
        step: [3, TURNOVER_TOTAL],
        title: "ตรวจห้องเสร็จแล้ว — สรุปผล",
        subtitle: "มีรายการต้องซ่อมไหม? เลือกเส้นทางถัดไป",
        actions: [
          { id: "createRepair", label: "🔧 มีซ่อม — สร้างงานซ่อม", variant: "primary" },
          { id: "skipRepair", label: "✅ ไม่มีซ่อม — ไป QC เลย", variant: "secondary" },
          RELEASE_NOW,
        ],
      };
    }
    if (inspect.open) {
      return {
        stage: "inspecting",
        step: [2, TURNOVER_TOTAL],
        title: "รอตรวจห้อง · คืนเงินประกัน",
        subtitle: "ตรวจเสร็จแล้วกดปิดงานได้ที่นี่ หรือติดตามในกระดานงานช่าง",
        actions: [
          { id: "doneInspect", label: "✓ ตรวจห้องเสร็จแล้ว — ปิดงาน", variant: "primary" },
          RELEASE_NOW,
        ],
      };
    }
    if (cleanBefore.done) {
      return {
        stage: "await-inspect",
        step: [2, TURNOVER_TOTAL],
        title: "ทำความสะอาดเสร็จ — นัดตรวจห้อง",
        subtitle: "สร้างงานตรวจห้องเพื่อเช็คสภาพ + คืนเงินประกัน",
        actions: [
          { id: "createInspect", label: "📋 สร้างงานตรวจห้อง + คืนประกัน", variant: "primary" },
          RELEASE_NOW,
        ],
      };
    }
    if (cleanBefore.open) {
      return {
        stage: "cleaning-before",
        step: [1, TURNOVER_TOTAL],
        title: "กำลังทำความสะอาดก่อนตรวจ",
        subtitle: "เสร็จแล้วกดปิดงานได้ที่นี่ หรือติดตามในกระดานงานช่าง",
        actions: [
          { id: "doneCleanBefore", label: "✓ ทำสะอาดเสร็จแล้ว — ปิดงาน", variant: "primary" },
          RELEASE_NOW,
        ],
      };
    }
    if (room.status === "moveout") {
      return {
        stage: "moveout-start",
        step: [1, TURNOVER_TOTAL],
        title: "แจ้งย้ายออก — เริ่มเตรียมห้อง",
        subtitle: "ขั้นแรก: ทำความสะอาดก่อนนัดตรวจ — หรือใช้ทางลัดปล่อยขายทันที",
        actions: [
          { id: "createCleanBefore", label: "🧹 สร้างงานทำสะอาดก่อนตรวจ", variant: "primary" },
          RELEASE_NOW,
        ],
      };
    }
  }

  // qc/repair/inactive ที่ไม่อยู่ใน turnover (ไม่มี marker tasks)
  return {
    stage: "other",
    step: null,
    title: "",
    subtitle: "",
    actions: [],
  };
}

/* ====================================================================
 * Stepper labels for the panel UI
 * ==================================================================== */

export const TURNOVER_STEP_LABELS = [
  "ทำสะอาด",
  "ตรวจ+คืนประกัน",
  "ซ่อม",
  "สะอาดรอบท้าย",
  "QC ปล่อยขาย",
] as const;
