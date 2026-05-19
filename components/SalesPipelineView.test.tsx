import { describe, expect, it } from "vitest";
import { formatBaht, formatDateShort, relativeDays } from "./SalesPipelineView";

describe("SalesPipelineView helpers", () => {
  describe("formatBaht", () => {
    it("formats numeric strings with Thai grouping", () => {
      expect(formatBaht("8500")).toBe("8,500");
      expect(formatBaht("12000")).toBe("12,000");
    });
    it("strips non-digits before formatting", () => {
      expect(formatBaht("฿ 8,500")).toBe("8,500");
      // Dots are non-digits — stripped, not decimal-aware
      expect(formatBaht("8.500")).toBe("8,500");
    });
    it("returns empty string for null/undefined/empty", () => {
      expect(formatBaht("")).toBe("");
      expect(formatBaht(null)).toBe("");
      expect(formatBaht(undefined)).toBe("");
    });
    it("returns empty string when no digits present", () => {
      expect(formatBaht("abc")).toBe("");
    });
  });

  describe("formatDateShort", () => {
    it("pads day and month to 2 digits", () => {
      expect(formatDateShort(new Date(2026, 0, 5))).toBe("05/01");
      expect(formatDateShort(new Date(2026, 11, 31))).toBe("31/12");
    });
  });

  describe("relativeDays", () => {
    const now = new Date(2026, 4, 19, 14, 30); // Tue 19 May 2026 14:30
    it("returns 'วันนี้' for the same day regardless of time", () => {
      const sameDay = new Date(2026, 4, 19, 9, 0);
      expect(relativeDays(sameDay, now)).toBe("วันนี้");
    });
    it("returns 'พรุ่งนี้' for the next day", () => {
      const tomorrow = new Date(2026, 4, 20, 9, 0);
      expect(relativeDays(tomorrow, now)).toBe("พรุ่งนี้");
    });
    it("returns 'ใน N วัน' for 2-7 days out", () => {
      expect(relativeDays(new Date(2026, 4, 22), now)).toBe("ใน 3 วัน");
      expect(relativeDays(new Date(2026, 4, 26), now)).toBe("ใน 7 วัน");
    });
    it("still uses 'ใน N วัน' beyond a week (no special bucket)", () => {
      expect(relativeDays(new Date(2026, 4, 30), now)).toBe("ใน 11 วัน");
    });
    it("returns empty string for past dates", () => {
      expect(relativeDays(new Date(2026, 4, 18), now)).toBe("");
    });
  });
});
