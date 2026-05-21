import { describe, expect, it } from "vitest";
import {
  formatBaht, formatDateShort, relativeDays,
  SALES_TASK_TYPES, countAppointmentsWithinDays,
} from "./SalesPipelineView";

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

  describe("SALES_TASK_TYPES (Task 23)", () => {
    it("includes ย้ายออก so move-out dates count as appointments", () => {
      expect(SALES_TASK_TYPES.has("ย้ายออก")).toBe(true);
    });
    it("includes ชมห้อง and ย้ายเข้า", () => {
      expect(SALES_TASK_TYPES.has("ชมห้อง")).toBe(true);
      expect(SALES_TASK_TYPES.has("ย้ายเข้า")).toBe(true);
    });
    it("excludes engineer task types", () => {
      expect(SALES_TASK_TYPES.has("ทำสะอาด")).toBe(false);
      expect(SALES_TASK_TYPES.has("ซ่อม")).toBe(false);
    });
  });

  describe("countAppointmentsWithinDays (Task 23)", () => {
    const from = new Date(2026, 4, 21); // Thu 21 May 2026
    it("counts an appointment exactly on day 7 (was off-by-one before)", () => {
      const items = [{ date: new Date(2026, 4, 28) }]; // day +7
      expect(countAppointmentsWithinDays(items, 7, from)).toBe(1);
    });
    it("excludes appointments past day+7 (day 8)", () => {
      const items = [{ date: new Date(2026, 4, 29) }]; // day +8
      expect(countAppointmentsWithinDays(items, 7, from)).toBe(0);
    });
    it("includes today's appointments", () => {
      const items = [{ date: new Date(2026, 4, 21, 9, 0) }]; // today 09:00
      expect(countAppointmentsWithinDays(items, 7, from)).toBe(1);
    });
    it("excludes past appointments", () => {
      const items = [{ date: new Date(2026, 4, 20) }];
      expect(countAppointmentsWithinDays(items, 7, from)).toBe(0);
    });
    it("counts multiple within window", () => {
      const items = [
        { date: new Date(2026, 4, 22) },
        { date: new Date(2026, 4, 25) },
        { date: new Date(2026, 4, 28) },
      ];
      expect(countAppointmentsWithinDays(items, 7, from)).toBe(3);
    });
  });
});
