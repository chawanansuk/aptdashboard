import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EMERGENCY_STALE_TTL_MS,
  FRESH_TTL_MS,
  STALE_TTL_MS,
  endEquipmentRevalidation,
  getEquipmentCacheState,
  invalidateEquipmentCacheServer,
  peekEmergencyEquipmentCache,
  setEquipmentCache,
  tryBeginEquipmentRevalidation,
} from "./maintenanceCache";

beforeEach(() => {
  invalidateEquipmentCacheServer();
  endEquipmentRevalidation();
});

afterEach(() => {
  invalidateEquipmentCacheServer();
  endEquipmentRevalidation();
});

describe("maintenanceCache — SWR semantics", () => {
  it("starts missing", () => {
    expect(getEquipmentCacheState().state).toBe("missing");
  });

  it("set → fresh immediately", () => {
    setEquipmentCache([]);
    expect(getEquipmentCacheState().state).toBe("fresh");
  });

  it("returns stale once past FRESH_TTL but within STALE_TTL", () => {
    setEquipmentCache([]);
    const out = getEquipmentCacheState(Date.now() + FRESH_TTL_MS + 1_000);
    expect(out.state).toBe("stale");
    expect(out.ageMs).toBeGreaterThan(FRESH_TTL_MS);
  });

  it("reports missing once past STALE_TTL but preserves the value for the emergency peek", () => {
    setEquipmentCache([]);
    const tFuture = Date.now() + STALE_TTL_MS + 1_000;
    expect(getEquipmentCacheState(tFuture).state).toBe("missing");
    // Slot is NOT GC'd — peekEmergency must still see the value (covered
    // in the emergency-stale block below; this assertion just guards the
    // intent so a future "free up memory" tweak doesn't silently re-break
    // the fallback).
    expect(peekEmergencyEquipmentCache(tFuture)).not.toBeNull();
  });

  it("invalidateEquipmentCacheServer forces missing", () => {
    setEquipmentCache([]);
    invalidateEquipmentCacheServer();
    expect(getEquipmentCacheState().state).toBe("missing");
  });
});

describe("maintenanceCache — emergency-stale peek", () => {
  it("returns the value even past STALE_TTL (within emergency window)", () => {
    setEquipmentCache([]);
    expect(peekEmergencyEquipmentCache(Date.now() + STALE_TTL_MS + 60_000)).not.toBeNull();
  });

  it("returns null past EMERGENCY_STALE_TTL", () => {
    setEquipmentCache([]);
    expect(peekEmergencyEquipmentCache(Date.now() + EMERGENCY_STALE_TTL_MS + 1_000)).toBeNull();
  });

  it("returns null when slot has never been set", () => {
    expect(peekEmergencyEquipmentCache()).toBeNull();
  });

  it("survives a get() at past STALE_TTL — emergency peek still works after a normal lookup", () => {
    // Regression for the dead-code bug in SwrSlot.get: it used to null the
    // value once past STALE_TTL, which made peekEmergency unreachable —
    // /api/maintenance-plan would return 502 instead of the 1-hour fallback
    // on an upstream Apps Script outage. A normal `get()` must NOT destroy
    // the slot used by the emergency path.
    setEquipmentCache([{ kind: "marker" } as never]);
    const t = Date.now() + STALE_TTL_MS + 60_000;
    expect(getEquipmentCacheState(t).state).toBe("missing");
    expect(peekEmergencyEquipmentCache(t)).not.toBeNull();
  });
});

describe("maintenanceCache — single-flight guard", () => {
  it("first call wins, subsequent calls fail until ended", () => {
    expect(tryBeginEquipmentRevalidation()).toBe(true);
    expect(tryBeginEquipmentRevalidation()).toBe(false);
    endEquipmentRevalidation();
    expect(tryBeginEquipmentRevalidation()).toBe(true);
  });
});
