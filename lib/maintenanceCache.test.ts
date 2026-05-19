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

  it("expires (and GCs) once past STALE_TTL", () => {
    setEquipmentCache([]);
    const out = getEquipmentCacheState(Date.now() + STALE_TTL_MS + 1_000);
    expect(out.state).toBe("missing");
    // Subsequent calls still missing (slot was GC'd)
    expect(getEquipmentCacheState().state).toBe("missing");
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
});

describe("maintenanceCache — single-flight guard", () => {
  it("first call wins, subsequent calls fail until ended", () => {
    expect(tryBeginEquipmentRevalidation()).toBe(true);
    expect(tryBeginEquipmentRevalidation()).toBe(false);
    endEquipmentRevalidation();
    expect(tryBeginEquipmentRevalidation()).toBe(true);
  });
});
