import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  computeNextService,
  daysUntilService,
  getMaintenanceStatus,
  formatDateLabel,
} from "./maintenanceUtils";

// Anchor "today" so daysUntilService tests are deterministic
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-22T10:00:00"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("computeNextService", () => {
  it("computes lastService + intervalDays", () => {
    const r = computeNextService({ intervalDays: 30, lastService: "2026-04-01", installDate: "" });
    expect(r).toBe("2026-05-01");
  });

  it("falls back to installDate when lastService empty", () => {
    const r = computeNextService({ intervalDays: 30, lastService: "", installDate: "2026-04-01" });
    expect(r).toBe("2026-05-01");
  });

  it("returns null when intervalDays missing or zero", () => {
    expect(computeNextService({ intervalDays: 0, lastService: "2026-04-01", installDate: "" })).toBeNull();
    expect(computeNextService({ lastService: "2026-04-01", installDate: "" })).toBeNull();
  });

  it("returns null when no anchor date", () => {
    expect(computeNextService({ intervalDays: 30, lastService: "", installDate: "" })).toBeNull();
  });

  it("returns null when date format invalid", () => {
    expect(computeNextService({ intervalDays: 30, lastService: "not-a-date", installDate: "" })).toBeNull();
  });

  it("handles month/year rollover correctly", () => {
    // Dec 20 + 30 days = Jan 19
    const r = computeNextService({ intervalDays: 30, lastService: "2025-12-20", installDate: "" });
    expect(r).toBe("2026-01-19");
  });
});

describe("daysUntilService", () => {
  it("returns positive when next service in future", () => {
    // lastService 2026-04-22, +30d = 2026-05-22 (today) → 0 days
    const d = daysUntilService({ intervalDays: 30, lastService: "2026-04-22", installDate: "" });
    expect(d).toBe(0);
  });

  it("returns negative when next service overdue", () => {
    // lastService 2026-04-01, +30d = 2026-05-01, today = 2026-05-22 → -21 days
    const d = daysUntilService({ intervalDays: 30, lastService: "2026-04-01", installDate: "" });
    expect(d).toBe(-21);
  });

  it("returns null when cannot compute", () => {
    expect(daysUntilService({ intervalDays: 0, lastService: "", installDate: "" })).toBeNull();
  });
});

describe("getMaintenanceStatus", () => {
  it("'overdue' when next service is in the past", () => {
    expect(getMaintenanceStatus({ intervalDays: 30, lastService: "2026-04-01", installDate: "" })).toBe("overdue");
  });

  it("'due-soon' when next service within 14 days", () => {
    // lastService 2026-05-01, +30d = 2026-05-31, today = 2026-05-22 → 9 days
    expect(getMaintenanceStatus({ intervalDays: 30, lastService: "2026-05-01", installDate: "" })).toBe("due-soon");
  });

  it("'ok' when next service > 14 days away", () => {
    // lastService 2026-05-22, +30d = 2026-06-21, today = 2026-05-22 → 30 days
    expect(getMaintenanceStatus({ intervalDays: 30, lastService: "2026-05-22", installDate: "" })).toBe("ok");
  });

  it("'unknown' when no schedule info", () => {
    expect(getMaintenanceStatus({ intervalDays: 0, lastService: "", installDate: "" })).toBe("unknown");
  });

  it("boundary: exactly 14 days = due-soon", () => {
    // lastService 2026-05-06, +30d = 2026-06-05, today = 2026-05-22 → 14 days
    expect(getMaintenanceStatus({ intervalDays: 30, lastService: "2026-05-06", installDate: "" })).toBe("due-soon");
  });

  it("boundary: 0 days (due today) = due-soon", () => {
    expect(getMaintenanceStatus({ intervalDays: 30, lastService: "2026-04-22", installDate: "" })).toBe("due-soon");
  });
});

describe("formatDateLabel", () => {
  it("converts yyyy-MM-dd → dd/MM/yyyy (Thai-friendly)", () => {
    expect(formatDateLabel("2026-05-22")).toBe("22/05/2026");
  });

  it("returns — for empty input", () => {
    expect(formatDateLabel("")).toBe("—");
  });

  it("returns input as-is when format unexpected", () => {
    expect(formatDateLabel("22 May 2026")).toBe("22 May 2026");
  });
});
