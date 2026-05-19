import { describe, expect, it } from "vitest";
import type { SheetRow } from "@/types";
import {
  sumTaskCosts, sumCompletedCosts, formatBaht, parseCostInput,
} from "./taskCost";

function mkTask(p: Partial<SheetRow>): SheetRow {
  return {
    date: "19/05/2026",
    type: "ซ่อม",
    building: "Kl",
    room: "101",
    customer: "",
    phone: "",
    note: "",
    status: "pending",
    ...p,
  };
}

describe("sumTaskCosts", () => {
  it("adds positive costs across all tasks regardless of status", () => {
    const tasks = [
      mkTask({ cost: 1000, status: "เสร็จ" }),
      mkTask({ cost: 500, status: "pending" }),
      mkTask({ cost: 250, status: "ยกเลิก" }),
    ];
    expect(sumTaskCosts(tasks)).toBe(1750);
  });

  it("ignores 0 / undefined / negative costs", () => {
    const tasks = [
      mkTask({ cost: 1000 }),
      mkTask({}),                // no cost field
      mkTask({ cost: 0 }),
      mkTask({ cost: -50 }),
    ];
    expect(sumTaskCosts(tasks)).toBe(1000);
  });

  it("returns 0 for empty list", () => {
    expect(sumTaskCosts([])).toBe(0);
  });

  it("coerces string-cost fields (Apps Script may send strings)", () => {
    const tasks = [
      mkTask({ cost: "1500" as unknown as number }),
      mkTask({ cost: "abc" as unknown as number }),
    ];
    expect(sumTaskCosts(tasks)).toBe(1500);
  });
});

describe("sumCompletedCosts", () => {
  it("sums only tasks with completed-style status", () => {
    const tasks = [
      mkTask({ cost: 1000, status: "เสร็จ" }),
      mkTask({ cost: 500,  status: "done" }),
      mkTask({ cost: 200,  status: "ปิดแล้ว" }),
      mkTask({ cost: 999,  status: "pending" }),   // excluded
      mkTask({ cost: 999,  status: "ยกเลิก" }),   // excluded
    ];
    expect(sumCompletedCosts(tasks)).toBe(1700);
  });
});

describe("formatBaht", () => {
  it("uses Thai locale grouping + ฿ suffix", () => {
    expect(formatBaht(1500)).toBe("1,500 ฿");
    expect(formatBaht(1234567)).toBe("1,234,567 ฿");
  });
  it("returns empty string for 0 / negative / NaN", () => {
    expect(formatBaht(0)).toBe("");
    expect(formatBaht(-100)).toBe("");
    expect(formatBaht(NaN)).toBe("");
  });
});

describe("parseCostInput", () => {
  it("parses '1,500' / '1500' / '1500 ฿'", () => {
    expect(parseCostInput("1,500")).toBe(1500);
    expect(parseCostInput("1500")).toBe(1500);
    expect(parseCostInput("1500 ฿")).toBe(1500);
  });
  it("returns 0 for empty / invalid / negative", () => {
    expect(parseCostInput("")).toBe(0);
    expect(parseCostInput("abc")).toBe(0);
    expect(parseCostInput("-100")).toBe(0);
  });
});
