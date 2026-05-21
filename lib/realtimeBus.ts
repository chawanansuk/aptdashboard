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

export type BusEvent =
  | { kind: "data-changed"; source: "task" | "room" | "equipment" | "facility"; ts: number }
  | { kind: "session-changed"; ts: number };

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
