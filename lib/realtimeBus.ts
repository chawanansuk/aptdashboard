"use client";

/**
 * Cross-tab realtime bus — broadcasts data-mutation events between
 * open tabs/windows of the app via the native BroadcastChannel API.
 *
 * Why not SSE/WebSocket: the upstream Google Sheets / Apps Script
 * doesn't push change notifications. A server SSE endpoint here would
 * have to poll Apps Script and forward — same fundamental polling
 * shape, just relocated. BroadcastChannel solves the actual user
 * problem ("เปิด 2 แท็บ → tab A เขียน → tab B เห็นทันที") without
 * a server roundtrip.
 *
 * Browser support: all modern browsers + iOS Safari 15.4+. Firefox,
 * Chrome, Edge, Safari all good. We feature-detect and degrade
 * gracefully on older environments.
 */

const CHANNEL_NAME = "aptdash:bus:v1";

export type TurnoverStep = "inspect" | "moveout-clean" | "repair" | "after-repair-clean" | "qc";

export type BusEvent =
  | { kind: "data-changed"; source: "task" | "room" | "equipment" | "facility"; ts: number }
  | { kind: "session-changed"; ts: number }
  /**
   * Engineer just finished a turnover-pipeline task on this room. Drives
   * cross-unit toasts ("ห้อง 101 ตรวจห้องเสร็จ") and lets sales know when
   * QC closes so they can flip the room back to "ว่าง". Detected from the
   * task's note prefix — see lib/moveoutTasks.detectTurnoverStep.
   */
  | { kind: "turnover-step-done"; building: string; room: string; step: TurnoverStep; ts: number }
  /**
   * Sales just put a room into "แจ้งย้ายออก" and the auto-prep pair
   * (inspect + clean) was created. Lets engineers see incoming work
   * without polling. Fires once per moveout, not per task.
   */
  | { kind: "turnover-started"; building: string; room: string; ts: number };

type Listener = (e: BusEvent) => void;

/** Singleton — created lazily on first use to avoid SSR issues. */
let channel: BroadcastChannel | null = null;
const localListeners = new Set<Listener>();

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (typeof BroadcastChannel === "undefined") return null;
  if (channel) return channel;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener("message", (ev) => {
      const data = ev.data as BusEvent;
      if (!data || typeof data.kind !== "string") return;
      localListeners.forEach((fn) => {
        try { fn(data); } catch { /* ignore listener errors */ }
      });
    });
    return channel;
  } catch {
    return null;
  }
}

/**
 * Publish an event to all OTHER tabs (BroadcastChannel auto-excludes
 * sender). Use after a successful write (addTask, updateTaskStatus,
 * facility update, etc.) so peers refresh.
 */
export function publishBusEvent(e: BusEvent): void {
  const ch = getChannel();
  if (!ch) return;
  try { ch.postMessage(e); } catch { /* quota / closed — ignore */ }
}

/**
 * Subscribe to bus events. Returns an unsubscribe function.
 *
 * Important: BroadcastChannel doesn't fire on the sending tab. Most
 * call sites should also call their local refresh() right after
 * publishBusEvent() — peers get the broadcast, sender refreshes
 * directly.
 */
export function subscribeBus(fn: Listener): () => void {
  // Lazy init the channel so `subscribeBus` from a useEffect on first
  // page load wires us up.
  getChannel();
  localListeners.add(fn);
  return () => { localListeners.delete(fn); };
}
