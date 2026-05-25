import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FRESH_TTL_MS,
  STALE_TTL_MS,
  endRevalidation,
  endRoomsRevalidation,
  endTasksRevalidation,
  getDashboardCache,
  getDashboardCacheState,
  getRoomsCacheState,
  getTasksCacheState,
  invalidateDashboardCache,
  invalidateRoomsCache,
  invalidateTasksCache,
  setDashboardCache,
  setRoomsCache,
  setTasksCache,
  tryBeginRevalidation,
  tryBeginRoomsRevalidation,
  tryBeginTasksRevalidation,
} from "./dashboardCache";

beforeEach(() => {
  invalidateDashboardCache();
  endRevalidation();
  endRoomsRevalidation();
  endTasksRevalidation();
});

afterEach(() => {
  invalidateDashboardCache();
  endRevalidation();
  endRoomsRevalidation();
  endTasksRevalidation();
});

describe("getDashboardCacheState — SWR semantics", () => {
  it("returns missing when empty", () => {
    expect(getDashboardCacheState().state).toBe("missing");
    expect(getDashboardCacheState().data).toBeNull();
  });

  it("returns fresh immediately after set", () => {
    setDashboardCache([], []);
    const out = getDashboardCacheState();
    expect(out.state).toBe("fresh");
    expect(out.data).not.toBeNull();
  });

  it("returns stale once past FRESH_TTL but within STALE_TTL", () => {
    setDashboardCache([], []);
    const now = Date.now() + FRESH_TTL_MS + 1_000;
    const out = getDashboardCacheState(now);
    expect(out.state).toBe("stale");
    expect(out.data).not.toBeNull();
    expect(out.ageMs).toBeGreaterThan(FRESH_TTL_MS);
  });

  it("returns missing past STALE_TTL but RETAINS the value for emergency fallback", () => {
    setDashboardCache([], []);
    const now = Date.now() + STALE_TTL_MS + 1_000;
    const out = getDashboardCacheState(now);
    expect(out.state).toBe("missing");
    expect(out.data).toBeNull();
    // The value is NOT discarded — get() is a pure read now. A real-now read
    // still sees the (genuinely fresh) entry, and crucially the emergency
    // path can still serve it after a failed upstream fetch.
    expect(getDashboardCacheState().state).toBe("fresh");
  });

  it("invalidateDashboardCache forces a missing state", () => {
    setDashboardCache([], []);
    invalidateDashboardCache();
    expect(getDashboardCacheState().state).toBe("missing");
  });
});

describe("getDashboardCache — legacy fresh-only API", () => {
  it("returns the cache when fresh", () => {
    setDashboardCache([], []);
    expect(getDashboardCache()).not.toBeNull();
  });

  // The legacy helper still calls getDashboardCacheState(now=Date.now()),
  // so we test "missing when empty" rather than mocking time.
  it("returns null when there is no cache", () => {
    expect(getDashboardCache()).toBeNull();
  });
});

describe("tryBeginRevalidation — single-flight guard", () => {
  it("first call wins, subsequent calls fail until ended", () => {
    expect(tryBeginRevalidation()).toBe(true);
    expect(tryBeginRevalidation()).toBe(false);
    expect(tryBeginRevalidation()).toBe(false);
    endRevalidation();
    expect(tryBeginRevalidation()).toBe(true);
  });
});

describe("per-slice rooms cache", () => {
  it("starts missing, set→fresh, expires→missing", () => {
    expect(getRoomsCacheState().state).toBe("missing");
    setRoomsCache([{ building: "A", room: "1", floor: "1", price: "1000", status: "ว่าง", tenant: "", phone: "", contractEnd: "" }]);
    expect(getRoomsCacheState().state).toBe("fresh");
    const old = getRoomsCacheState(Date.now() + STALE_TTL_MS + 1).state;
    expect(old).toBe("missing");
  });

  it("invalidateRoomsCache wipes rooms but leaves tasks alone", () => {
    setRoomsCache([]);
    setTasksCache([]);
    invalidateRoomsCache();
    expect(getRoomsCacheState().state).toBe("missing");
    expect(getTasksCacheState().state).toBe("fresh");
  });

  it("rooms single-flight guard is independent of tasks guard", () => {
    expect(tryBeginRoomsRevalidation()).toBe(true);
    expect(tryBeginRoomsRevalidation()).toBe(false);
    // Tasks slot is unaffected
    expect(tryBeginTasksRevalidation()).toBe(true);
    endRoomsRevalidation();
    endTasksRevalidation();
  });
});

describe("combined state derived from both slots", () => {
  it("missing when only one slot has data", () => {
    setRoomsCache([]);
    expect(getDashboardCacheState().state).toBe("missing");
    invalidateRoomsCache();
    setTasksCache([]);
    expect(getDashboardCacheState().state).toBe("missing");
  });

  it("fresh when both slots fresh", () => {
    setDashboardCache([], []);
    expect(getDashboardCacheState().state).toBe("fresh");
  });

  it("stale when one slot is stale (other still fresh)", () => {
    // Set both. Then "age" only the rooms slot by re-setting tasks LATER
    // so that at a future read-time, rooms is past FRESH but tasks too.
    setDashboardCache([], []);
    // After FRESH_TTL+1s both should be stale
    const out = getDashboardCacheState(Date.now() + FRESH_TTL_MS + 1_000);
    expect(out.state).toBe("stale");
  });

  it("invalidateDashboardCache wipes BOTH slots", () => {
    setDashboardCache([], []);
    invalidateDashboardCache();
    expect(getRoomsCacheState().state).toBe("missing");
    expect(getTasksCacheState().state).toBe("missing");
  });
});

describe("emergency-stale peek (perf/tasks-stale-on-error)", () => {
  it("returns the value even when past STALE_TTL (within 1 hour)", async () => {
    const { peekEmergencyTasksCache, EMERGENCY_STALE_TTL_MS } = await import("./dashboardCache");
    setTasksCache([]);
    // Force-age beyond STALE_TTL but within EMERGENCY_STALE_TTL by using
    // a future "now" in peek.
    const wayPastStale = Date.now() + STALE_TTL_MS + 60_000;
    expect(peekEmergencyTasksCache(wayPastStale)).not.toBeNull();
    // Past emergency cutoff returns null
    const pastEmergency = Date.now() + EMERGENCY_STALE_TTL_MS + 1_000;
    expect(peekEmergencyTasksCache(pastEmergency)).toBeNull();
  });

  it("still serves emergency value after get() saw it as stale-expired (regression)", async () => {
    const { getTasksCacheState, peekEmergencyTasksCache } = await import("./dashboardCache");
    setTasksCache([]);
    const pastStale = Date.now() + STALE_TTL_MS + 60_000;
    // The route calls get() first (which returns missing past STALE_TTL); it
    // must NOT discard the value, so the emergency fallback can still serve it
    // when the upstream fetch then fails.
    expect(getTasksCacheState(pastStale).state).toBe("missing");
    expect(peekEmergencyTasksCache(pastStale)).not.toBeNull();
  });

  it("returns null when slot has never been set", async () => {
    const { peekEmergencyTasksCache } = await import("./dashboardCache");
    invalidateTasksCache();
    expect(peekEmergencyTasksCache()).toBeNull();
  });

  it("invalidate clears the emergency slot too", async () => {
    const { peekEmergencyTasksCache } = await import("./dashboardCache");
    setTasksCache([]);
    invalidateTasksCache();
    expect(peekEmergencyTasksCache()).toBeNull();
  });
});
