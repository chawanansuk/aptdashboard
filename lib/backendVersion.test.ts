import { describe, expect, it } from "vitest";
import {
  EXPECTED_BACKEND_VERSION, compareVersions, isBackendOutdated,
} from "./backendVersion";

describe("compareVersions", () => {
  it("orders by numeric segment, not lexically", () => {
    // The lexical trap: "3.9.0" > "3.10.0" as strings, but 9 < 10.
    expect(compareVersions("3.9.0", "3.10.0")).toBeLessThan(0);
    expect(compareVersions("3.21.0", "3.10.0")).toBeGreaterThan(0);
    expect(compareVersions("3.21.0", "3.21.0")).toBe(0);
  });

  it("treats missing / non-numeric segments as 0", () => {
    expect(compareVersions("unknown", "3.21.0")).toBeLessThan(0);
    expect(compareVersions("3.21", "3.21.0")).toBe(0);
  });
});

describe("isBackendOutdated", () => {
  it("flags an older deployed backend", () => {
    expect(isBackendOutdated("3.10.0", "3.21.0")).toBe(true);
    expect(isBackendOutdated("unknown", "3.21.0")).toBe(true);
  });

  it("does NOT flag an equal or newer backend (old clients still work)", () => {
    expect(isBackendOutdated("3.21.0", "3.21.0")).toBe(false);
    expect(isBackendOutdated("3.22.0", "3.21.0")).toBe(false);
  });

  it("defaults to comparing against EXPECTED_BACKEND_VERSION", () => {
    expect(isBackendOutdated(EXPECTED_BACKEND_VERSION)).toBe(false);
    expect(isBackendOutdated("1.0.0")).toBe(true);
  });
});
