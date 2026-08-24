import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import {
  computeOccupancy, computeTodayTaskCount, computeOverdueTaskCount,
  computeExpiringThisMonth, computeMonthlyIncome,
  priceNum,
} from "./useOverviewStats";
import type { RoomView, SheetRow } from "@/types";

function mkRoom(partial: Partial<RoomView>): RoomView {
  return {
    building: "Kl",
    room: "101",
    floor: "1",
    price: "0",
    status: "ready",
    rawStatus: "ว่าง",
    tenant: "",
    phone: "",
    contractEnd: "",
    today: false,
    needsCleaning: false,
    todayTasks: [],
    upcomingTasks: [],
    pastTasks: [],
    ...partial,
  };
}

function mkTask(partial: Partial<SheetRow>): SheetRow {
  return {
    date: "",
    type: "ทำสะอาด",
    building: "",
    room: "",
    customer: "",
    phone: "",
    note: "",
    status: "pending",
    ...partial,
  };
}

describe("priceNum", () => {
  it("parses '3,500' / '3500' / '3,500 ฿' to 3500", () => {
    expect(priceNum("3,500")).toBe(3500);
    expect(priceNum("3500")).toBe(3500);
    expect(priceNum("3,500 ฿")).toBe(3500);
  });
  it("returns 0 for empty / invalid", () => {
    expect(priceNum("")).toBe(0);
    expect(priceNum("abc")).toBe(0);
  });
});

describe("computeOccupancy", () => {
  it("treats occupied + moveout as occupied", () => {
    const rooms = [
      mkRoom({ status: "occupied" }),
      mkRoom({ status: "moveout" }),
      mkRoom({ status: "ready" }),
    ];
    const o = computeOccupancy(rooms);
    expect(o.total).toBe(3);
    expect(o.occupied).toBe(2);
    expect(o.vacant).toBe(1);
    expect(o.rate).toBeCloseTo(2 / 3);
  });

  it("returns rate 0 for empty rooms", () => {
    const o = computeOccupancy([]);
    expect(o.total).toBe(0);
    expect(o.rate).toBe(0);
  });

  it("rooms in qc/repair count as neither occupied nor vacant (they're unavailable)", () => {
    const rooms = [
      mkRoom({ status: "occupied" }),
      mkRoom({ status: "qc" }),
      mkRoom({ status: "repair" }),
      mkRoom({ status: "inactive" }),
    ];
    const o = computeOccupancy(rooms);
    expect(o.occupied).toBe(1);
    expect(o.vacant).toBe(0);
  });

  it("returns a 5-segment breakdown that sums to total", () => {
    // Powers the OverviewCards stacked bar. qc/repair/inactive all fold
    // into 'maintenance' — the room isn't rentable, doesn't matter why.
    const rooms = [
      mkRoom({ status: "occupied" }),
      mkRoom({ status: "occupied" }),
      mkRoom({ status: "ready" }),
      mkRoom({ status: "pending" }),
      mkRoom({ status: "moveout" }),
      mkRoom({ status: "qc" }),
      mkRoom({ status: "repair" }),
      mkRoom({ status: "inactive" }),
    ];
    const { breakdown, total } = computeOccupancy(rooms);
    expect(breakdown).toEqual({
      occupied: 2, available: 1, pending: 1, moveout: 1, maintenance: 3,
    });
    const sum = Object.values(breakdown).reduce((a, b) => a + b, 0);
    expect(sum).toBe(total);
  });
});

describe("computeTodayTaskCount", () => {
  beforeEach(() => {
    // Freeze "today" = 2026-05-18 to match test fixtures
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T10:00:00+07:00"));
  });
  afterEach(() => { vi.useRealTimers(); });

  it("counts non-closed tasks dated today", () => {
    const tasks = [
      mkTask({ date: "18/05/2026", status: "pending" }),
      mkTask({ date: "18/05/2026", status: "กำลังทำ" }),
      mkTask({ date: "18/05/2026", status: "เสร็จ" }),   // closed → excluded
      mkTask({ date: "18/05/2026", status: "ยกเลิก" }),  // closed → excluded
      mkTask({ date: "17/05/2026", status: "pending" }), // not today
    ];
    expect(computeTodayTaskCount(tasks)).toBe(2);
  });

  it("returns 0 for empty list", () => {
    expect(computeTodayTaskCount([])).toBe(0);
  });

  it("counts ISO-dated rows too (Apps Script emits yyyy-MM-dd)", () => {
    // UI audit r20: เดิมเทียบ string dd/MM/yyyy ตรงๆ แถว ISO เลยหลุดเงียบๆ
    expect(computeTodayTaskCount([
      mkTask({ date: "2026-05-18", status: "pending" }),
    ])).toBe(1);
  });
});

describe("computeOverdueTaskCount", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T10:00:00+07:00"));
  });
  afterEach(() => { vi.useRealTimers(); });

  it("counts open tasks dated before today — same story as the sidebar ⚠", () => {
    const tasks = [
      mkTask({ date: "17/05/2026", status: "pending" }),  // overdue
      mkTask({ date: "2026-05-10", status: "กำลังทำ" }),  // overdue (ISO)
      mkTask({ date: "17/05/2026", status: "เสร็จ" }),    // closed → excluded
      mkTask({ date: "18/05/2026", status: "pending" }),  // today, not overdue
      mkTask({ date: "19/05/2026", status: "pending" }),  // future
    ];
    expect(computeOverdueTaskCount(tasks)).toBe(2);
  });
});

describe("computeExpiringThisMonth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T10:00:00+07:00"));
  });
  afterEach(() => { vi.useRealTimers(); });

  it("counts contracts ending in the current calendar month", () => {
    const rooms = [
      mkRoom({ contractEnd: "20/05/2026" }), // this month
      mkRoom({ contractEnd: "31/05/2026" }), // this month
      mkRoom({ contractEnd: "01/06/2026" }), // next month
      mkRoom({ contractEnd: "30/04/2026" }), // last month
      mkRoom({ contractEnd: "" }),           // empty
      mkRoom({ contractEnd: "garbage" }),    // unparseable
    ];
    expect(computeExpiringThisMonth(rooms)).toBe(2);
  });
});

describe("computeMonthlyIncome", () => {
  it("sums price for occupied + moveout rooms only", () => {
    const rooms = [
      mkRoom({ status: "occupied", price: "5,000" }),
      mkRoom({ status: "moveout", price: "4,500" }),
      mkRoom({ status: "ready", price: "6,000" }),
      mkRoom({ status: "repair", price: "3,000" }),
    ];
    expect(computeMonthlyIncome(rooms)).toBe(9500);
  });

  it("handles empty list", () => {
    expect(computeMonthlyIncome([])).toBe(0);
  });
});
