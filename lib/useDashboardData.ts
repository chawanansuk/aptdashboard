"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RoomRow, RoomStatus, RoomView, SheetRow } from "@/types";
import { loadCache, saveCache } from "@/lib/cacheData";
import { isClosedStatus } from "@/lib/constants";
import { subscribeBus } from "@/lib/realtimeBus";
import { roomKey, taskKey } from "@/lib/taskKey";
import { normalizeRoomStatus, isKnownRoomStatus } from "@/lib/roomStatus";
import { parseSheetDate } from "@/lib/dateUtils";
import { sameRowArray } from "@/lib/sameArray";

/**
 * Parse a task-row date for bucketing into today/upcoming/past.
 *
 * Previously this had its own loose parser that split on `/`, `-`, or
 * `.` and trusted the result — which silently misparsed ISO dates
 * (Apps Script emits "2026-05-25" for Date cells: split → ["2026",
 * "05", "25"] → d=2026, m=5, yy=2025 → new Date(2025, 4, 2026) =
 * far-future date → task lands in the wrong bucket).
 *
 * Delegates to parseSheetDate which strictly validates both DMY and
 * ISO. Kept as a local thin wrapper so the existing call sites and
 * the function name (parseDateDMY) still make sense locally.
 */
function parseDateDMY(s: string): Date | null {
  return parseSheetDate(s);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Safety ceiling for how long an unconfirmed optimistic room patch is
 * re-applied over server data. The server reflects writes within the CSV
 * publish window (~5 min); this TTL just prevents a patch sticking forever
 * if the server never confirms it (e.g. the write silently failed).
 */
export const OPTIMISTIC_MAX_TTL_MS = 5 * 60_000;

/**
 * Map a raw fetch/load error (network message, HTTP status, Apps Script
 * payload) to a short Thai sentence the user can act on. Raw text stays in
 * the console for support; the banner shows this. Unknown errors fall
 * through unchanged so we never hide a message we didn't anticipate.
 */
export function describeFetchError(raw: string): string {
  const s = (raw || "").toLowerCase();
  if (/failed to fetch|networkerror|err_internet|err_network|load failed|ecnnrefused|econnrefused/.test(s))
    return "เชื่อมต่อเครือข่ายไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง";
  if (/\b(502|503|504)\b|timeout|timed out|gateway|unavailable/.test(s))
    return "เซิร์ฟเวอร์ไม่ตอบชั่วคราว — ลองอีกครั้งในสักครู่";
  if (/quota|rate.?limit|too many|exceeded/.test(s))
    return "ใช้งานระบบ Google เกินโควต้าชั่วคราว — รอสักครู่แล้วลองใหม่";
  if (/invalid json|unexpected token|json/.test(s))
    return "ข้อมูลจากเซิร์ฟเวอร์ผิดรูปแบบ — ลองรีเฟรชอีกครั้ง";
  if (/\b(401|403)\b|unauthor|forbidden|permission/.test(s))
    return "ไม่มีสิทธิ์เข้าถึงข้อมูล — ตรวจการตั้งค่าการเชื่อมต่อ";
  return raw;
}

export interface OptimisticRoomPatch {
  patch: Partial<RoomRow>;
  at: number;
}

/**
 * Re-apply still-pending optimistic room patches on top of freshly fetched
 * server rows. `/api/dashboard/rooms` serves from the Google CSV publish,
 * which lags a write by minutes — so without this a refresh()/poll right
 * after a write would clobber the user's change with pre-write data.
 *
 * A patch is dropped (mutating `patches`) once the server row already
 * reflects every patched field (write landed) or once it's older than
 * `ttlMs`. Returns `rooms` unchanged when there's nothing pending.
 */
export function applyOptimisticRoomPatches(
  rooms: RoomRow[],
  patches: Map<string, OptimisticRoomPatch>,
  now: number,
  ttlMs: number,
): RoomRow[] {
  if (patches.size === 0) return rooms;
  for (const [k, v] of patches) {
    if (now - v.at > ttlMs) patches.delete(k);
  }
  if (patches.size === 0) return rooms;
  return rooms.map((row) => {
    const entry = patches.get(roomKey(row.building, row.room));
    if (!entry) return row;
    const confirmed = Object.entries(entry.patch).every(
      ([f, val]) => (row as unknown as Record<string, unknown>)[f] === val,
    );
    if (confirmed) {
      patches.delete(roomKey(row.building, row.room));
      return row;
    }
    return { ...row, ...entry.patch };
  });
}

export interface OptimisticTask {
  task: SheetRow;
  at: number;
}

/** A task's identity for optimistic reconciliation. Re-exports the
 *  canonical helper in lib/taskKey so every consumer in the app keys
 *  the same way (the previous local copy and lib/taskKey diverged on
 *  whitespace handling — fixed). */
export { taskKey };

/**
 * Prepend still-pending optimistically-added tasks onto the freshly
 * fetched server list. A just-added task won't appear until the dashboard
 * cache reflects the write (which can lag — Apps Script + a shared/
 * cross-instance cache), so without this a "เพิ่มงาน" looks like it did
 * nothing. Each pending task is dropped once the server list already
 * contains its key (write landed) or after a safety TTL.
 */
export function applyOptimisticTasks(
  serverTasks: SheetRow[],
  pending: Map<string, OptimisticTask>,
  now: number,
  ttlMs: number,
): SheetRow[] {
  if (pending.size === 0) return serverTasks;
  const serverKeys = new Set(serverTasks.map(taskKey));
  for (const [k, v] of pending) {
    if (now - v.at > ttlMs || serverKeys.has(k)) pending.delete(k);
  }
  if (pending.size === 0) return serverTasks;
  return [...Array.from(pending.values(), (v) => v.task), ...serverTasks];
}

export interface OptimisticTaskStatus {
  status: string;
  at: number;
}

/**
 * Drop duplicate task rows that share the same `taskKey`
 * (`date|building|room|type`).
 *
 * The งาน sheet has no stable id column and the composite key is unique
 * by construction (no two tasks of the same type happen in the same
 * room on the same day in practice — see lib/taskKey). When two rows
 * with the same key DO show up, that's a data bug: bookingConfirm,
 * bulkAdd, or runRecurringCheck appended a second time (e.g. before
 * Apps Script #182 / #200 guards land). On the client we'd otherwise
 * render the row twice in every list view and inflate every count.
 *
 * Order is preserved (first occurrence wins). When multiple rows share
 * a key, prefer the one with the richer customer/phone/note payload so
 * a later edit isn't erased by an earlier stub — duplicates that are
 * identical fall through unchanged.
 */
export function dedupTasks(rows: SheetRow[]): SheetRow[] {
  if (rows.length < 2) return rows;
  const indexByKey = new Map<string, number>();
  const out: SheetRow[] = [];
  const info = (t: SheetRow) =>
    (t.customer || "").length + (t.phone || "").length + (t.note || "").length;
  for (const t of rows) {
    const k = taskKey(t);
    const existing = indexByKey.get(k);
    if (existing === undefined) {
      indexByKey.set(k, out.length);
      out.push(t);
    } else if (info(t) > info(out[existing])) {
      out[existing] = t;
    }
  }
  return out;
}

/**
 * Re-apply still-pending optimistic task-status changes (e.g. closing a
 * task as "เสร็จ" / "ยกเลิก") on top of freshly fetched server tasks. The
 * write lands at Apps Script immediately, but the dashboard cache that
 * feeds the list lags — so a refresh right after closing a task refetched
 * the still-open row and the task "เด้งกลับ" (popped back open). Keyed by
 * taskKey; dropped once the server row already shows the new status
 * (write landed) or after a safety TTL.
 */
export function applyOptimisticTaskStatus(
  serverTasks: SheetRow[],
  pending: Map<string, OptimisticTaskStatus>,
  now: number,
  ttlMs: number,
): SheetRow[] {
  if (pending.size === 0) return serverTasks;
  for (const [k, v] of pending) {
    if (now - v.at > ttlMs) pending.delete(k);
  }
  if (pending.size === 0) return serverTasks;
  // A close is "reconciled" only once NO server row for that key still
  // shows the old status. With duplicate rows sharing a key, dropping on
  // the first reconciled row would unmask an open twin and pop the task
  // back open — so keep suppressing until every matching row has flipped.
  const stillOpen = new Set<string>();
  for (const t of serverTasks) {
    const k = taskKey(t);
    const entry = pending.get(k);
    if (entry && (t.status || "") !== entry.status) stillOpen.add(k);
  }
  for (const k of Array.from(pending.keys())) {
    if (!stillOpen.has(k)) pending.delete(k);
  }
  return serverTasks.map((t) => {
    const entry = pending.get(taskKey(t));
    return entry ? { ...t, status: entry.status } : t;
  });
}

/** Element-wise identity compare — cheap because task-row objects keep
 *  their identity across renders unless that row actually changed. */
function sameTaskList(a: SheetRow[], b: SheetRow[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Is the freshly-built view equivalent to the previous one? Used to
 *  RETURN THE PREVIOUS OBJECT so React.memo'd room cards skip
 *  re-rendering the ~296 rooms an optimistic single-room write didn't
 *  touch. Scalars + bucket contents; buckets by element identity. */
function sameRoomView(a: RoomView, b: RoomView): boolean {
  return (
    a.status === b.status &&
    a.rawStatus === b.rawStatus &&
    a.tenant === b.tenant &&
    a.phone === b.phone &&
    a.contractEnd === b.contractEnd &&
    a.price === b.price &&
    a.floor === b.floor &&
    a.images === b.images &&
    a.today === b.today &&
    a.needsCleaning === b.needsCleaning &&
    sameTaskList(a.todayTasks, b.todayTasks) &&
    sameTaskList(a.upcomingTasks, b.upcomingTasks) &&
    sameTaskList(a.pastTasks, b.pastTasks)
  );
}

export function mergeRoomsAndTasks(
  rooms: RoomRow[],
  tasks: SheetRow[],
  /** Previous merge result — pass to preserve object identity for
   *  unchanged rooms (perf r7). Omit in tests for pure behavior. */
  prev?: RoomView[],
): RoomView[] {
  const today = startOfDay(new Date());
  const prevByKey = prev && prev.length
    ? new Map(prev.map((v) => [roomKey(v.building, v.room), v]))
    : null;

  // index tasks by building+room
  const tasksByRoom = new Map<string, SheetRow[]>();
  for (const t of tasks) {
    const k = roomKey(t.building, t.room);
    if (!tasksByRoom.has(k)) tasksByRoom.set(k, []);
    tasksByRoom.get(k)!.push(t);
  }

  // Parse every task's date ONCE (perf r7) — the buckets + sort below
  // used to call the regex parser up to 6× per task per room; with the
  // task list in the hundreds this dominated the merge cost.
  const dayTime = new Map<SheetRow, number | null>();
  for (const t of tasks) {
    const d = parseDateDMY(t.date);
    dayTime.set(t, d ? startOfDay(d).getTime() : null);
  }
  const timeOf = (t: SheetRow) => dayTime.get(t) ?? null;

  return rooms.map<RoomView>((r) => {
    const k = roomKey(r.building, r.room);
    const all = tasksByRoom.get(k) || [];

    // r.today flag: task dated today AND not closed (done OR cancelled).
    // Parse-based (parseDateDMY handles both dd/MM/yyyy and the ISO
    // yyyy-MM-dd that Apps Script emits for Date cells) — a literal
    // `t.date === todayKey` missed ISO-dated tasks, so their red
    // "งานวันนี้" badge never showed.
    const todayTasks = all.filter((t) => {
      if (isClosedStatus(t.status)) return false;
      const ts = timeOf(t);
      return ts !== null && ts === today.getTime();
    });
    const upcomingTasks = all.filter((t) => {
      if (isClosedStatus(t.status)) return false;
      const ts = timeOf(t);
      return ts !== null && ts >= today.getTime();
    });
    const pastTasks = all.filter((t) => {
      if (isClosedStatus(t.status)) return true;
      const ts = timeOf(t);
      return ts !== null && ts < today.getTime();
    }).sort((a, b) => (timeOf(b) ?? 0) - (timeOf(a) ?? 0)); // newest first

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
    // ย้ายออก checks open notices dated up to 30 days back, not just
    // upcoming ones: the turnover pipeline runs for days after the
    // move-out date, and with the upcoming-only check the room snapped
    // back to "มีผู้เช่า" the morning after — mid-pipeline, journey
    // panel gone ("ระบบรวน"). Release closes the notice automatically.
    // The 30-day floor is the escape hatch for ABANDONED notices
    // (tenant renewed but nobody cancelled the task): without it a
    // forgotten open notice pins the room in "แจ้งย้ายออก" forever.
    // Past the window the room reverts to occupied and the stale task
    // still surfaces in the overdue list for cleanup.
    const moveoutFloor = today.getTime() - 30 * 24 * 60 * 60 * 1000;
    const hasMoveOut = all.some((t) => {
      if (t.type !== "ย้ายออก" || isClosedStatus(t.status)) return false;
      const ts = timeOf(t);
      return ts !== null && ts >= moveoutFloor;
    });
    const hasView = upcomingTasks.some((t) => t.type === "ชมห้อง");
    const hasMoveIn = upcomingTasks.some((t) => t.type === "ย้ายเข้า");
    const hasCleanPending = upcomingTasks.some(
      (t) => t.type === "ทำสะอาด"
    );

    if (status === "occupied" && hasMoveOut) status = "moveout";
    else if (status === "ready" && hasMoveIn) status = "pending";
    else if (status === "ready" && hasView) status = "pending";
    else if (status === "ready" && hasCleanPending) status = "qc";

    // Secondary "ต้องทำสะอาด" flag: a pending cleaning that the headline
    // doesn't already show as qc — e.g. a booked room (รอสัญญา) that still
    // needs a turnover clean before the tenant moves in. Headline stays
    // pending (so sales don't re-book it), but the card flags 🧹 so the
    // clean isn't forgotten. Redundant when the headline is already qc.
    const needsCleaning = hasCleanPending && status !== "qc";

    const view: RoomView = {
      building: r.building,
      room: r.room,
      floor: r.floor,
      price: r.price,
      status,
      rawStatus: baseRaw,
      tenant: r.tenant,
      phone: r.phone,
      contractEnd: r.contractEnd,
      images: r.images,
      today: todayTasks.length > 0,
      needsCleaning,
      todayTasks,
      upcomingTasks,
      pastTasks,
    };
    if (prevByKey) {
      const old = prevByKey.get(k);
      if (old && sameRoomView(old, view)) return old;
    }
    return view;
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
  /**
   * Optimistically prepend a just-added task to local state so it shows
   * immediately, surviving refresh()/poll until the server list includes
   * it (or a TTL). Mirrors optimisticUpdateRoom for the add-task flow.
   */
  optimisticAddTask: (task: SheetRow) => void;
  /**
   * Optimistically set a task's status locally (e.g. closing as "เสร็จ")
   * so it leaves the open list immediately and doesn't pop back open when
   * the lagging cache refetches. Reconciles once the server agrees.
   */
  optimisticUpdateTask: (
    task: Pick<SheetRow, "date" | "building" | "room" | "type">,
    status: string,
  ) => void;
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
      // `no-cache` (NOT `no-store`): the browser keeps a private copy and
      // revalidates it on every request with `If-None-Match`. Freshness is
      // identical to no-store (we always hit the origin), but when the data
      // hasn't changed the route answers 304 Not Modified with an empty body
      // and the browser serves the cached payload — so an idle 60s poll stops
      // re-downloading the full tasks/rooms JSON every tick. `/api/dashboard/
      // tasks` computes an ETag for exactly this; `no-store` was throwing that
      // away by never sending the conditional header. (The browser turns the
      // 304 back into a 200 + cached body for us, so callers below still see
      // res.ok; the `status === 304` log branch is only reachable if a caller
      // sets If-None-Match manually.)
      const res = await fetch(url, { cache: "no-cache", signal });
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
  // Pending optimistic room patches keyed by building|room. Re-applied on
  // every server fetch (refresh/poll) until the server row confirms them or
  // the TTL expires, so a write isn't reverted by the lagging CSV.
  const pendingRoomPatchesRef = useRef<Map<string, OptimisticRoomPatch>>(new Map());
  // Pending optimistically-added tasks keyed by taskKey. Prepended onto
  // every server fetch until the server list includes them (or TTL), so a
  // just-added task shows immediately even while the write cache lags.
  const pendingTasksRef = useRef<Map<string, OptimisticTask>>(new Map());
  // Pending optimistic task-status changes keyed by taskKey. Re-applied on
  // every server fetch until the server row shows the new status (or TTL),
  // so a closed task doesn't "เด้งกลับ" when the lagging cache refetches.
  const pendingTaskStatusRef = useRef<Map<string, OptimisticTaskStatus>>(new Map());

  // Hydrate from cache synchronously on mount → instant first render with stale data
  useEffect(() => {
    const cached = loadCache();
    if (cached) {
      setRooms(cached.rooms);
      setTasks(dedupTasks(cached.tasks));
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
      // Keep raw text in the console (support diagnoses bug reports from it);
      // show de-duplicated, user-actionable Thai in the banner.
      if (errs.length) console.error("[dashboard] load errors:", errs);
      setErrors(Array.from(new Set(errs.map(describeFetchError))));
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
        if (j.error) {
          console.error(`[dashboard] slice ${url} returned error:`, j.error);
          errs.push(String(j.error));
          // audit r27: body ที่เป็น error (401 session หมดอายุ / 403) ไม่มี
          // rooms/tasks → เดิม onData แปลงเป็น [] ทับกริดที่ยังใช้ได้
          if (!("rooms" in j) && !("tasks" in j)) return;
        }
        if (j.cached) anyCached = true;
        onData(j);
      } catch (e) {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : "unknown";
        if (msg !== "aborted") {
          console.error(`[dashboard] slice ${url} failed:`, e);
          errs.push(msg);
        }
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
        // Re-apply any still-unconfirmed optimistic writes — the CSV behind
        // this endpoint lags a write by minutes, so a refresh() fired right
        // after a write would otherwise revert the user's change.
        const next = applyOptimisticRoomPatches(
          arr, pendingRoomPatchesRef.current, Date.now(), OPTIMISTIC_MAX_TTL_MS,
        );
        latestRooms = next;
        // Always write the new array — including empty `[]` — so that when
        // the last room in a building is deleted/moved the UI reflects it
        // instead of showing stale data forever. Bail out of the setState
        // when the rows are structurally identical to what's already in
        // state — every memoized child below us re-renders otherwise (the
        // 60s poll burns react reconciliation across the whole tree even
        // when the ETag/304 path returned the same JSON).
        setRooms((prev) => sameRowArray(prev as unknown as Record<string, unknown>[], next as unknown as Record<string, unknown>[]) ? prev : next);
        roomsDone = true;
        // Progressive: as soon as rooms land, drop the initial spinner.
        // We still gate on `arr.length` here because an empty initial
        // response shouldn't hide the skeleton (UI looks broken otherwise);
        // the real "we have data" signal is a non-zero response.
        if (next.length) setIsInitial(false);
      });
      const tasksPromise = loadSlice("/api/dashboard/tasks", (j) => {
        const arr: SheetRow[] = Array.isArray((j as { tasks?: unknown }).tasks)
          ? (j as { tasks: SheetRow[] }).tasks
          : [];
        // Keep a just-added task visible, and a just-closed task closed,
        // until the server list reflects each (the write cache can lag);
        // both reconcile away automatically once the server agrees.
        const now = Date.now();
        const withAdds = applyOptimisticTasks(
          arr, pendingTasksRef.current, now, OPTIMISTIC_MAX_TTL_MS,
        );
        const withStatuses = applyOptimisticTaskStatus(
          withAdds, pendingTaskStatusRef.current, now, OPTIMISTIC_MAX_TTL_MS,
        );
        // Drop server-side duplicate rows (data bug — see dedupTasks) so
        // list views + counts don't double-count the same appointment.
        const next = dedupTasks(withStatuses);
        latestTasks = next;
        // Same fix as rooms — write empty arrays so deletions show up.
        // Skip the setState when structurally identical so child memos
        // (RoomsView/OverviewCards/TasksList) actually no-op on a 60s
        // no-change poll.
        setTasks((prev) => sameRowArray(prev as unknown as Record<string, unknown>[], next as unknown as Record<string, unknown>[]) ? prev : next);
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
        console.error("[dashboard] refresh failed:", e);
        setErrors([describeFetchError(msg)]);
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

  // prev ref → unchanged rooms keep object identity across merges, so
  // the memo'd RoomCard skips them (perf r7).
  const prevMergedRef = useRef<RoomView[]>([]);
  const merged = useMemo(() => {
    const m = mergeRoomsAndTasks(rooms, tasks, prevMergedRef.current);
    prevMergedRef.current = m;
    return m;
  }, [rooms, tasks]);

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
      const now = Date.now();
      // Stamp so the background poller skips for 30s (gives the canonical
      // CSV time to publish the same write — otherwise it'd overwrite the
      // optimistic value with stale data)
      lastOptimisticAtRef.current = now;
      // Record the patch so it also survives an explicit refresh() (which
      // re-fetches the still-stale CSV) until the server row confirms it.
      const key = roomKey(b, r);
      const existing = pendingRoomPatchesRef.current.get(key);
      pendingRoomPatchesRef.current.set(key, {
        patch: { ...(existing?.patch ?? {}), ...patch },
        at: now,
      });
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

  const optimisticAddTask = useCallback((task: SheetRow) => {
    const now = Date.now();
    lastOptimisticAtRef.current = now;
    pendingTasksRef.current.set(taskKey(task), { task, at: now });
    setTasks((prev) => [task, ...prev]);
  }, []);

  const optimisticUpdateTask = useCallback(
    (task: Pick<SheetRow, "date" | "building" | "room" | "type">, status: string) => {
      const now = Date.now();
      lastOptimisticAtRef.current = now;
      const key = taskKey(task);
      pendingTaskStatusRef.current.set(key, { status, at: now });
      setTasks((prev) => prev.map((t) => (taskKey(t) === key ? { ...t, status } : t)));
    },
    [],
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
    optimisticAddTask,
    optimisticUpdateTask,
  };
}
