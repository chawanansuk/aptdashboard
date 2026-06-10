/**
 * Fire-and-forget shipper for client-side errors.
 *
 * Targets `/api/client-error`, never throws (a logging bug must not
 * surface a second error to the user), and prefers `sendBeacon` so the
 * report still ships if the user is mid-navigation when the error fires.
 *
 * In-memory dedup: the same `<message>|<stack>` key is silently dropped
 * if it fires again within a short window — a render error usually
 * re-triggers every render, and we don't want to DoS our own log
 * budget by reporting the same React update loop 60 times a second.
 *
 * SSR-safe: bails out the moment it touches a browser-only API.
 */

interface ReportableError {
  message: string;
  stack?: string;
  componentStack?: string;
  source: string;
  level?: string;
}

const DEDUP_WINDOW_MS = 10_000;
const recent = new Map<string, number>();

function shouldSkip(key: string, now: number): boolean {
  const last = recent.get(key);
  if (last !== undefined && now - last < DEDUP_WINDOW_MS) return true;
  recent.set(key, now);
  // Cheap cap so this map can't grow forever in a long-lived tab.
  if (recent.size > 64) {
    const cutoff = now - DEDUP_WINDOW_MS;
    for (const [k, t] of recent) if (t < cutoff) recent.delete(k);
  }
  return false;
}

export function reportClientError(e: ReportableError): void {
  if (typeof window === "undefined") return;
  try {
    const key = `${e.message}|${(e.stack || "").slice(0, 200)}`;
    const now = Date.now();
    if (shouldSkip(key, now)) return;

    const payload = JSON.stringify({
      message: e.message,
      stack: e.stack,
      componentStack: e.componentStack,
      source: e.source,
      level: e.level,
      url: window.location.href,
      clientTs: new Date(now).toISOString(),
      ua: navigator.userAgent,
    });

    // Beacon survives unload — best path for nav-time errors. Falls back
    // to fetch with keepalive for browsers that lack sendBeacon (very few).
    const url = "/api/client-error";
    const navAny = navigator as Navigator & { sendBeacon?: (u: string, b: BodyInit) => boolean };
    if (typeof navAny.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      navAny.sendBeacon(url, blob);
      return;
    }
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => { /* swallow — last thing we want is logging-of-logging */ });
  } catch {
    // Catastrophic: even gathering the payload threw. Drop silently.
  }
}

/** Test-only: clear the dedup map between cases. */
export function _resetReportErrorDedup(): void {
  recent.clear();
}
