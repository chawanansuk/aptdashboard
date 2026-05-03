"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RoomRow, RoomStatus, RoomView, SheetRow } from "@/types";
import { loadCache, saveCache } from "@/lib/cacheData";

const STATUS_FROM_ROOM: Record<string, RoomStatus> = {
  // occupied
  "มีคนอยู่": "occupied",
  "มีผู้เช่า": "occupied",
  "อยู่": "occupied",
  // ready / vacant
  "ว่าง": "ready",
  "พร้อมขาย": "ready",
  "พร้อม": "ready",
  // repair / maintenance
  "ปรับปรุง": "repair",
  "รอเข้าซ่อม": "repair",
  "ซ่อม": "repair",
  "รอซ่อม": "repair",
  // pending (waiting move-in / contract)
  "รอสัญญา": "pending",
  "รอย้ายเข้า": "pending",
  // moveout
  "แจ้งย้ายออก": "moveout",
  "รอย้ายออก": "moveout",
  // qc / cleaning
  "รอตรวจ": "qc",
  "QC": "qc",
  "รอทำสะอาด": "qc",
  // inactive / reserved / ER
  "ไม่ได้ใช้งาน": "inactive",
  "ห้องสำรอง": "inactive",
  "สำรอง": "inactive",
  "ER": "inactive",
};

function parseDateDMY(s: string): Date | null {
  if (!s) return null;
  const parts = s.split(/[\/\-.]/);
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map((p) => parseInt(p, 10));
  if (!d || !m || !y) return null;
  const yy = y < 100 ? 2000 + y : y;
  return new Date(yy, m - 1, d);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function todayKey(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function buildingRoomKey(b: string, r: string): string {
  return `${(b || "").trim()}|${(r || "").trim()}`;
}

export function mergeRoomsAndTasks(
  rooms: RoomRow[],
  tasks: SheetRow[]
): RoomView[] {
  const today = startOfDay(new Date());
  const tKey = todayKey();

  // index tasks by building+room
  const tasksByRoom = new Map<string, SheetRow[]>();
  for (const t of tasks) {
    const k = buildingRoomKey(t.building, t.room);
    if (!tasksByRoom.has(k)) tasksByRoom.set(k, []);
    tasksByRoom.get(k)!.push(t);
  }

  return rooms.map<RoomView>((r) => {
    const k = buildingRoomKey(r.building, r.room);
    const all = tasksByRoom.get(k) || [];

    const todayTasks = all.filter(
      (t) => t.date === tKey && t.status !== "เสร็จ"
    );
    const upcomingTasks = all.filter((t) => {
      const s = (t.status || "").trim();
      if (s === "เสร็จ" || s === "done" || s === "ปิดแล้ว" || s === "ยกเลิก" || s === "cancelled") return false;
      const d = parseDateDMY(t.date);
      return d && startOfDay(d).getTime() >= today.getTime();
    });
    const pastTasks = all.filter((t) => {
      const s = (t.status || "").trim();
      const isClosed = s === "เสร็จ" || s === "done" || s === "ปิดแล้ว" || s === "ยกเลิก" || s === "cancelled";
      if (isClosed) return true;
      const d = parseDateDMY(t.date);
      return d ? startOfDay(d).getTime() < today.getTime() : false;
    }).sort((a, b) => {
      // newest first by parsed date, fallback to string compare
      const da = parseDateDMY(a.date)?.getTime() ?? 0;
      const db = parseDateDMY(b.date)?.getTime() ?? 0;
      return db - da;
    });

    // base status from rooms sheet
    const baseRaw = (r.status || "").trim();
    let status: RoomStatus = STATUS_FROM_ROOM[baseRaw] || "inactive";

    // override by upcoming tasks
    const hasMoveOut = upcomingTasks.some((t) => t.type === "ย้ายออก");
    const hasView = upcomingTasks.some((t) => t.type === "ชมห้อง");
    const hasMoveIn = upcomingTasks.some((t) => t.type === "ย้ายเข้า");
    const hasCleanPending = upcomingTasks.some(
      (t) => t.type === "ทำสะอาด"
    );

    if (status === "occupied" && hasMoveOut) status = "moveout";
    else if (status === "ready" && hasMoveIn) status = "pending";
    else if (status === "ready" && hasView) status = "pending";
    else if (status === "ready" && hasCleanPending) status = "qc";

    return {
      building: r.building,
      room: r.room,
      floor: r.floor,
      price: r.price,
      status,
      rawStatus: baseRaw,
      tenant: r.tenant,
      phone: r.phone,
      contractEnd: r.contractEnd,
      today: todayTasks.length > 0,
      todayTasks,
      upcomingTasks,
      pastTasks,
    };
  });
}

export interface DashboardState {
  status: "idle" | "loading" | "ok" | "error";
  rooms: RoomView[];
  tasks: SheetRow[];
  errors: string[];
  lastUpdated: string;
  isInitial: boolean;
  isRefreshing: boolean;
  refresh: () => void;
}

const RETRY_DELAYS_MS = [500, 1500, 3000];

async function fetchWithRetry(url: string, signal: AbortSignal): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (signal.aborted) throw new Error("aborted");
    try {
      const res = await fetch(url, { cache: "no-store", signal });
      if (res.ok) return res;
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        return res;
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (signal.aborted) throw e;
      lastErr = e;
    }
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay == null) break;
    await new Promise((r) => setTimeout(r, delay));
  }
  throw lastErr instanceof Error ? lastErr : new Error("fetch failed");
}

export function useDashboardData(): DashboardState {
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [tasks, setTasks] = useState<SheetRow[]>([]);
  const [status, setStatus] = useState<DashboardState["status"]>("idle");
  const [errors, setErrors] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState("");
  const [isInitial, setIsInitial] = useState(true);
  const [tick, setTick] = useState(0);

  // Hydrate from cache synchronously on mount → instant first render with stale data
  useEffect(() => {
    const cached = loadCache();
    if (cached) {
      setRooms(cached.rooms);
      setTasks(cached.tasks);
      setLastUpdated(`${new Date(cached.savedAt).toLocaleTimeString("th-TH")} (จาก cache)`);
      setIsInitial(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    let alive = true;
    const run = async () => {
      setStatus("loading");
      const errs: string[] = [];
      try {
        const [rResult, tResult] = await Promise.allSettled([
          fetchWithRetry("/api/sheet/rooms", ctrl.signal),
          fetchWithRetry("/api/sheet", ctrl.signal),
        ]);

        let rRooms: RoomRow[] = [];
        let rTasks: SheetRow[] = [];
        let gotRooms = false;
        let gotTasks = false;

        if (rResult.status === "fulfilled") {
          const j = await rResult.value.json().catch(() => ({ error: "invalid JSON" }));
          if (j.error) errs.push("rooms: " + j.error);
          else { rRooms = j.rooms || []; gotRooms = true; }
        } else {
          const m = rResult.reason instanceof Error ? rResult.reason.message : "unknown";
          if (m !== "aborted") errs.push("rooms: " + m);
        }

        if (tResult.status === "fulfilled") {
          const j = await tResult.value.json().catch(() => ({ error: "invalid JSON" }));
          if (j.error) errs.push("tasks: " + j.error);
          else { rTasks = j.rows || []; gotTasks = true; }
        } else {
          const m = tResult.reason instanceof Error ? tResult.reason.message : "unknown";
          if (m !== "aborted") errs.push("tasks: " + m);
        }

        if (!alive || ctrl.signal.aborted) return;
        if (gotRooms) setRooms(rRooms);
        if (gotTasks) setTasks(rTasks);
        setErrors(errs);
        setLastUpdated(new Date().toLocaleTimeString("th-TH"));
        const hasAnyData = (gotRooms && rRooms.length > 0) || (gotTasks && rTasks.length > 0);
        setStatus(errs.length && !hasAnyData ? "error" : "ok");
        setIsInitial(false);

        // Persist freshest snapshot to cache. Use newly-fetched values where
        // available; for the half that failed, re-use the most recent cache.
        if (gotRooms || gotTasks) {
          const cached = loadCache();
          const finalRooms = gotRooms ? rRooms : cached?.rooms ?? [];
          const finalTasks = gotTasks ? rTasks : cached?.tasks ?? [];
          if (finalRooms.length || finalTasks.length) saveCache(finalRooms, finalTasks);
        }
      } catch (e) {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : "unknown";
        if (msg !== "aborted") {
          setErrors([msg]);
          // Stay in 'ok' state if we still have data shown (from cache)
          const hasCache = !!loadCache();
          setStatus(hasCache ? "ok" : "error");
          setIsInitial(false);
        }
      }
    };
    run();
    return () => {
      alive = false;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const merged = useMemo(() => mergeRoomsAndTasks(rooms, tasks), [rooms, tasks]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return {
    status,
    rooms: merged,
    tasks,
    errors,
    lastUpdated,
    isInitial,
    isRefreshing: status === "loading" && !isInitial,
    refresh,
  };
}
