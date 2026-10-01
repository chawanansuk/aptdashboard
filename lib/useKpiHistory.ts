"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RoomView } from "@/types";
import { buildDaySnapshot, type DaySnapshot } from "@/lib/kpiSnapshot";

type History = { date: string; snapshot: DaySnapshot | null }[];

/** Re-report at most this often while the page stays open. */
const REPORT_EVERY_MS = 10 * 60_000;

/**
 * Sales page ↔ /api/kpi-snapshot: reads the previous days once, and
 * reports today's counts (on first real data, then at most every 10 min
 * while they change). Fails silent: no history → the cards show numbers
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
  const last = useRef<{ body: string; at: number } | null>(null);

  useEffect(() => {
    if (!serialized) return;
    const now = Date.now();
    const prev = last.current;
    if (prev && (prev.body === serialized || now - prev.at < REPORT_EVERY_MS)) return;
    last.current = { body: serialized, at: now };
    fetch("/api/kpi-snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: `{"snapshot":${serialized}}`,
      keepalive: true,
    }).catch(() => {});
  }, [serialized]);

  return history;
}
