import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FRESH_TTL_MS,
  STALE_TTL_MS,
  endRevalidation,
  getDashboardCache,
  getDashboardCacheState,
  invalidateDashboardCache,
  setDashboardCache,
  tryBeginRevalidation,
} from "./dashboardCache";

beforeEach(() => {
  invalidateDashboardCache();
  endRevalidation();
});

afterEach(() => {
  invalidateDashboardCache();
  endRevalidation();
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

  it("returns missing (and expires the entry) once past STALE_TTL", () => {
    setDashboardCache([], []);
    const now = Date.now() + STALE_TTL_MS + 1_000;
    const out = getDashboardCacheState(now);
    expect(out.state).toBe("missing");
    expect(out.data).toBeNull();
    // Subsequent calls still see missing (entry was GC'd)
    expect(getDashboardCacheState().state).toBe("missing");
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
