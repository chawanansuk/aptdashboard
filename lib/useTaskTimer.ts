"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActiveTimer, TimeLog } from "@/types";

/**
 * useTaskTimer — Task 35.
 *
 * Encapsulates the "start / stop / view running state" UX for one
 * task. Used by TaskDetailDrawer (and potentially future surfaces).
 *
 * State machine:
 *   idle       — no active timer for this task
 *   running    — startedAt set, ticking
 *   submitting — start or stop in flight
 *
 * The hook polls `/api/time-logs?active=1` once on mount so a refresh
 * mid-session correctly resumes the "▶ ticking" UI, then otherwise
 * runs entirely off optimistic local state (no polling for liveness —
 * the displayed clock is computed from `startedAt`).
 *
 * It also fetches the full log list for this task (for "total time
 * logged" display) on mount + after every stop.
 */

export type TimerStatus = "idle" | "running" | "submitting";

export interface UseTaskTimerResult {
  /** Hours the ACTIVE timer has been running (0 when idle). Powers the
   *  stale-timer warning — a forgotten start left overnight inflates
   *  logged hours silently (audit r9 risk #3). */
  runningHours: number;
  status: TimerStatus;
  /** Active timer (this task only), null when idle. */
  active: ActiveTimer | null;
  /** Closed logs for this task; running entry excluded. */
  logs: TimeLog[];
  /** Sum of closed durations + live tick if running, in minutes. */
  totalMin: number;
  /** Last error message; null when ok. */
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  clearError: () => void;
}

function parseSheetDate(s: string): number {
  // Apps Script writes "yyyy-MM-dd HH:mm:ss" in Asia/Bangkok. Convert
  // by replacing the space with T and treating it as local — the
  // browser is also in Asia/Bangkok in practice, and for "delta in
  // minutes" any timezone consistency error <= 1 minute wouldn't
  // change the UX. If users in multiple TZs ever care, switch to
  // formatting as ISO 8601 with offset on the server.
  if (!s) return 0;
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export function useTaskTimer(taskKey: string | null): UseTaskTimerResult {
  const [status, setStatus] = useState<TimerStatus>("idle");
  const [active, setActive] = useState<ActiveTimer | null>(null);
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const tickRef = useRef<number | null>(null);

  // Reload logs + active state for this task.
  const refresh = useCallback(async () => {
    if (!taskKey) {
      setActive(null);
      setLogs([]);
      return;
    }
    try {
      const [logsRes, activeRes] = await Promise.all([
        fetch(`/api/time-logs?taskKey=${encodeURIComponent(taskKey)}`, { cache: "no-store" }),
        fetch(`/api/time-logs?active=1`, { cache: "no-store" }),
      ]);
      const logsData = await logsRes.json().catch(() => ({ rows: [] }));
      const activeData = await activeRes.json().catch(() => ({ active: null }));
      setLogs((logsData.rows || []) as TimeLog[]);
      // Only mark active if it belongs to THIS task; the user could be
      // running a timer on a different task and we don't want to show
      // it here.
      const a = activeData.active as ActiveTimer | null;
      if (a && a.taskKey === taskKey) {
        setActive(a);
        setStatus("running");
      } else {
        setActive(null);
        setStatus("idle");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลเวลาไม่สำเร็จ");
    }
  }, [taskKey]);

  useEffect(() => {
    if (!taskKey) return;
    refresh();
  }, [taskKey, refresh]);

  // Live clock — tick the displayed elapsed counter while running.
  // 1-minute interval is enough — we only display minutes.
  useEffect(() => {
    if (status !== "running") {
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    setNowMs(Date.now());
    tickRef.current = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [status]);

  const start = useCallback(async () => {
    if (!taskKey || status !== "idle") return;
    setError(null);
    setStatus("submitting");
    try {
      const res = await fetch("/api/time-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", taskKey }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "invalid JSON" }));
      if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เริ่มจับเวลาไม่สำเร็จ");
      setStatus("idle");
    }
  }, [taskKey, status, refresh]);

  const stop = useCallback(async () => {
    if (!taskKey || status !== "running") return;
    setError(null);
    setStatus("submitting");
    try {
      const res = await fetch("/api/time-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", taskKey }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "invalid JSON" }));
      if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "หยุดจับเวลาไม่สำเร็จ");
      setStatus("running");
    }
  }, [taskKey, status, refresh]);

  // Compute total: closed logs + live running delta
  let totalMin = logs.reduce((s, l) => s + (l.durationMin || 0), 0);
  let runningHours = 0;
  if (active && status === "running") {
    const startMs = parseSheetDate(active.startedAt);
    if (startMs) {
      totalMin += Math.max(0, Math.round((nowMs - startMs) / 60000));
      runningHours = Math.max(0, (nowMs - startMs) / 3600000);
    }
  }

  return {
    status,
    runningHours,
    active,
    logs,
    totalMin,
    error,
    start,
    stop,
    clearError: () => setError(null),
  };
}

/** "1:23" / "0:05" formatter for minutes → HH:MM. */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}
