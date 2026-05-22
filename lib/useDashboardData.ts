"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RoomRow, RoomStatus, RoomView, SheetRow } from "@/types";
import { loadCache, saveCache } from "@/lib/cacheData";
import { isDoneStatus, isCancelledStatus } from "@/lib/constants";
import { subscribeBus } from "@/lib/realtimeBus";
import { normalizeRoomStatus, isKnownRoomStatus } from "@/lib/roomStatus";

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

    // r.today flag: task dated today AND not closed (done OR cancelled).
    // Fix: use central helpers — was missing "done"/"ปิดแล้ว"/"ยกเลิก"
    // aliases, causing rooms with only cancelled tasks today to show the
    // red "งานวันนี้" badge.
    const todayTasks = all.filter(
      (t) => t.date === tKey && !isDoneStatus(t.status) && !isCancelledStatus(t.status)
    );
    const upcomingTasks = all.filter((t) => {
      if (isDoneStatus(t.status) || isCancelledStatus(t.status)) return false;
      const d = parseDateDMY(t.date);
      return d && startOfDay(d).getTime() >= today.getTime();
    });
    const pastTasks = all.filter((t) => {
      if (isDoneStatus(t.status) || isCancelledStatus(t.status)) return true;
      const d = parseDateDMY(t.date);
      return d ? startOfDay(d).getTime() < today.getTime() : false;
    }).sort((a, b) => {
      // newest first by parsed date, fallback to string compare
      const da = parseDateDMY(a.date)?.getTime() ?? 0;
      const db = parseDateDMY(b.date)?.getTime() ?? 0;
      return db - da;
    });

    // base status from rooms sheet — normalize through the canonical
    // alias map (lib/roomStatus.ts). Unknown values fall back to
    // "inactive" so the room still surfaces; we also log once per
    // unknown value in dev so we know to add an alias.
    const baseRaw = (r.status || "").trim();
    if (baseRaw && !isKnownRoomStatus(baseRaw) && process.env.NODE_ENV !== "production") {
      const seen = (globalThis as { __seenUnknownStatus?: Set<string> }).__seenUnknownStatus ||= new Set();
      if (!seen.has(baseRaw)) {
        seen.add(baseRaw);
        // eslint-disable-next-line no-console
        console.warn(`[room-status] unknown raw status "${baseRaw}" — add alias to lib/roomStatus.ts`);
      }
    }
    let status: RoomStatus = normalizeRoomStatus(baseRaw);

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
  /**
   * Optimistically merge field changes into local rooms state, so the
   * UI reflects an updateRoomStatus response immediately even when the
   * canonical CSV publish takes minutes to refresh.
   * Background refresh (next refresh()) overwrites with server truth.
   */
  optimisticUpdateRoom: (building: string, room: string, patch: Partial<RoomRow>) => void;
}

const RETRY_DELAYS_MS = [500, 1500, 3000];

async function fetchWithRetry(url: string, signal: AbortSignal): Promise<Response> {
  let lastErr: unknown = null;
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  let attempts = 0;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    attempts = attempt + 1;
    if (signal.aborted) throw new Error("aborted");
    try {
      const res = await fetch(url, { cache: "no-store", signal });
      if (res.ok) {
        const dt = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);
        // Success-path timing log: dev-only (noisy in prod). Failure
        // path below still logs always so support can diagnose user
        // bug reports from console.
        if (process.env.NODE_ENV !== "production") {
          const cacheState = res.headers.get("x-vercel-cache") ||
            (res.status === 304 ? "304-not-modified" : "");
          const tag =
            res.status === 304 ? " · etag-304" :
            dt < 100 ? " · cache-warm" :
            dt < 300 ? " · cache-ok" :
            dt < 1000 ? " · network" :
            " · slow";
          const cacheNote = cacheState ? ` [${cacheState}]` : "";
          // eslint-disable-next-line no-console
          console.log(`[dashboard] ${url} ${dt}ms${tag}${cacheNote}${attempts > 1 ? ` (attempt ${attempts})` : ""}`);
        }
        return res;
      }
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        const dt = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);
        // 4xx is useful in prod for support — keep this one.
        // eslint-disable-next-line no-console
        console.warn(`[dashboard] ${url} ${dt}ms (status ${res.status}, no retry)`);
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
  const dt = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);
  // Final failure — keep in prod so support can see it in user reports.
  // eslint-disable-next-line no-console
  console.warn(`[dashboard] ${url} ${dt}ms (failed after ${attempts} attempts)`);
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
  // Timestamp of most recent optimistic write — background poll skips for
  // 30s after to avoid CSV-publish-lag race overwriting the user's change
  const lastOptimisticAtRef = useRef<number>(0);

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
    let roomsDone = false;
    let tasksDone = false;
    let latestRooms: RoomRow[] | null = null;
    let latestTasks: SheetRow[] | null = null;
    const errs: string[] = [];
    let anyCached = false;

    function finalize() {
      // Save / mark not-initial once at least one source has data; this
      // is what makes the room grid appear without waiting on Apps Script.
      if (latestRooms !== null || latestTasks !== null) {
        const r = latestRooms ?? rooms;
        const t = latestTasks ?? tasks;
        if (r.length || t.length) saveCache(r, t);
      }
      const hasAnyData =
        (latestRooms !== null && latestRooms.length > 0) ||
        (latestTasks !== null && latestTasks.length > 0) ||
        rooms.length > 0 ||
        tasks.length > 0;
      // Surface per-slice errors collected in `errs` to the banner state.
      // Without this, an Apps Script "quota exceeded" / 502 etc. would be
      // logged but invisible to the user (loadSlice swallows them into the
      // local array; only the outer try/catch hits setErrors, and that
      // path almost never fires because loadSlice doesn't throw).
      setErrors(errs);
      setLastUpdated(new Date().toLocaleTimeString("th-TH") + (anyCached ? " (server cache)" : ""));
      setStatus(errs.length && !hasAnyData ? "error" : "ok");
      setIsInitial(false);
    }

    async function loadSlice(
      url: string,
      onData: (raw: unknown) => void,
    ) {
      try {
        const res = await fetchWithRetry(url, ctrl.signal);
        const j = await res.json().catch(() => ({ error: "invalid JSON" }));
        if (!alive || ctrl.signal.aborted) return;
        if (j.error) errs.push(String(j.error));
        if (j.cached) anyCached = true;
        onData(j);
      } catch (e) {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : "unknown";
        if (msg !== "aborted") errs.push(msg);
      }
    }

    const run = async () => {
      setStatus("loading");

      // Parallel slice fetches — render whichever returns first, don't
      // block the room grid on Apps Script latency.
      const roomsPromise = loadSlice("/api/dashboard/rooms", (j) => {
        const arr: RoomRow[] = Array.isArray((j as { rooms?: unknown }).rooms)
          ? (j as { rooms: RoomRow[] }).rooms
          : [];
        latestRooms = arr;
        // Always write the new array — including empty `[]` — so that when
        // the last room in a building is deleted/moved the UI reflects it
        // instead of showing stale data forever.
        setRooms(arr);
        roomsDone = true;
        // Progressive: as soon as rooms land, drop the initial spinner.
        // We still gate on `arr.length` here because an empty initial
        // response shouldn't hide the skeleton (UI looks broken otherwise);
        // the real "we have data" signal is a non-zero response.
        if (arr.length) setIsInitial(false);
      });
      const tasksPromise = loadSlice("/api/dashboard/tasks", (j) => {
        const arr: SheetRow[] = Array.isArray((j as { tasks?: unknown }).tasks)
          ? (j as { tasks: SheetRow[] }).tasks
          : [];
        latestTasks = arr;
        // Same fix as rooms — write empty arrays so deletions show up
        setTasks(arr);
        tasksDone = true;
      });
      await Promise.all([roomsPromise, tasksPromise]);
      if (!alive) return;
      // Suppress unused-var lints — these track which slice resolved
      void roomsDone; void tasksDone;
      finalize();
    };
    run().catch((e) => {
      if (!alive) return;
      const msg = e instanceof Error ? e.message : "unknown";
      if (msg !== "aborted") {
        setErrors([msg]);
        const hasCache = !!loadCache();
        setStatus(hasCache ? "ok" : "error");
        setIsInitial(false);
      }
    });

    return () => {
      alive = false;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const merged = useMemo(() => mergeRoomsAndTasks(rooms, tasks), [rooms, tasks]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Cross-tab realtime sync — subscribe to bus events from other tabs.
  // When another tab writes (data-changed event), refresh here so the
  // user sees the update without waiting for the next polling cycle.
  useEffect(() => {
    return subscribeBus((evt) => {
      if (evt.kind === "data-changed") {
        refresh();
      }
    });
  }, [refresh]);

  // Background polling: refresh every 60s while the tab is visible.
  // Pauses on hidden tabs to spare Apps Script quota. Survives across
  // visibilitychange — we re-check on resume.
  // Pause polling for 30s after an optimistic write so the canonical CSV
  // doesn't race with the user's recent change (CSV publish can lag).
  useEffect(() => {
    if (typeof window === "undefined") return;
    let timer: ReturnType<typeof setInterval> | null = null;
    function start() {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState !== "visible") return;
        // Skip this tick if user just wrote — let optimistic value settle
        const sinceWrite = Date.now() - lastOptimisticAtRef.current;
        if (sinceWrite < 30_000) return;
        setTick((t) => t + 1);
      }, 60_000);
    }
    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
    }
    function onVis() {
      if (document.visibilityState === "visible") start();
      else stop();
    }
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const optimisticUpdateRoom = useCallback(
    (building: string, room: string, patch: Partial<RoomRow>) => {
      const b = (building || "").trim();
      const r = (room || "").trim();
      // Stamp so the background poller skips for 30s (gives the canonical
      // CSV time to publish the same write — otherwise it'd overwrite the
      // optimistic value with stale data)
      lastOptimisticAtRef.current = Date.now();
      setRooms((prev) =>
        prev.map((row) =>
          (row.building || "").trim() === b && (row.room || "").trim() === r
            ? { ...row, ...patch }
            : row
        )
      );
    },
    []
  );

  return {
    status,
    rooms: merged,
    tasks,
    errors,
    lastUpdated,
    isInitial,
    isRefreshing: status === "loading" && !isInitial,
    refresh,
    optimisticUpdateRoom,
  };
}
