"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RoomView } from "@/types";
import { buildDaySnapshot, type DaySnapshot } from "@/lib/kpiSnapshot";

type History = { date: string; snapshot: DaySnapshot | null }[];

/** Re-report at most this often while the page stays open. */
const REPORT_EVERY_MS = 10 * 60_000;
/** Quiet time after the last change before reporting (fresh data settles). */
const SETTLE_MS = 5_000;

/**
 * Sales page ↔ /api/kpi-snapshot: reads the previous days once, and
 * reports today's counts once they settle, then at most every 10 min
 * (always the latest) while they change. Fails silent: no history → the cards show numbers
 * only, exactly as before.
 */
export function useKpiHistory(rooms: RoomView[]): History {
  const [history, setHistory] = useState<History>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/kpi-snapshot", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.ok && Array.isArray(j.days)) setHistory(j.days as History); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const snapshot = useMemo(() => (rooms.length > 0 ? buildDaySnapshot(rooms) : null), [rooms]);
  const serialized = snapshot ? JSON.stringify(snapshot) : "";
  const latest = useRef("");
  const lastSent = useRef<{ body: string; at: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Report the LATEST counts, settled: the first rooms a page sees are
  // often the 24h browser cache or rooms that arrived before tasks (room
  // status depends on tasks), and the right numbers land a second later.
  // So wait SETTLE_MS after the last change, and never more often than
  // REPORT_EVERY_MS — but always send what's current when that window
  // ends instead of dropping it (audit r37: the stored point used to be
  // the first, wrong one).
  useEffect(() => {
    if (!serialized) return;
    latest.current = serialized;
    if (timer.current) clearTimeout(timer.current);
    const since = lastSent.current ? Date.now() - lastSent.current.at : Infinity;
    const wait = Math.max(SETTLE_MS, REPORT_EVERY_MS - since);
    timer.current = setTimeout(() => {
      timer.current = null;
      const body = latest.current;
      if (!body || lastSent.current?.body === body) return;
      lastSent.current = { body, at: Date.now() };
      fetch("/api/kpi-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: `{"snapshot":${body}}`,
        keepalive: true,
      }).catch(() => {});
    }, wait);
  }, [serialized]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return history;
}
