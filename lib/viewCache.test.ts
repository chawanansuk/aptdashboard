import { describe, expect, it, beforeEach } from "vitest";
import {
  getCachedView, setCachedView, bustView, _clearAllViewCache, VIEW_CACHE_TTL_MS,
} from "./viewCache";

beforeEach(() => _clearAllViewCache());

describe("viewCache", () => {
  it("returns null on a miss", () => {
    expect(getCachedView("vehicles")).toBeNull();
  });

  it("round-trips data within TTL", () => {
    const t0 = 1_000_000;
    setCachedView("vehicles", [{ id: "a" }], t0);
    expect(getCachedView("vehicles", t0 + 5_000)).toEqual([{ id: "a" }]);
  });

  it("expires (and evicts) entries past the TTL", () => {
    const t0 = 1_000_000;
    setCachedView("vehicles", [1, 2], t0);
    expect(getCachedView("vehicles", t0 + VIEW_CACHE_TTL_MS + 1)).toBeNull();
    // exactly at the boundary still counts as fresh
    setCachedView("vehicles", [1, 2], t0);
    expect(getCachedView("vehicles", t0 + VIEW_CACHE_TTL_MS)).toEqual([1, 2]);
  });

  it("bustView drops a key immediately", () => {
    const t0 = 1_000_000;
    setCachedView("leads", ["x"], t0);
    bustView("leads");
    expect(getCachedView("leads", t0)).toBeNull();
  });

  it("keys are independent", () => {
    const t0 = 1_000_000;
    setCachedView("vehicles", ["v"], t0);
    setCachedView("parts", ["p"], t0);
    bustView("vehicles");
    expect(getCachedView("vehicles", t0)).toBeNull();
    expect(getCachedView("parts", t0)).toEqual(["p"]);
  });
});
