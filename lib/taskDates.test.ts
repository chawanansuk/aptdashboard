import { describe, expect, it } from "vitest";
import { taskActivityDay } from "./taskDates";
import type { SheetRow } from "@/types";

const t = (over: Partial<SheetRow>): SheetRow => ({
  date: "2026-09-10", type: "ซ่อม", building: "A", room: "101", customer: "", phone: "", note: "", status: "", ...over,
});

describe("taskActivityDay", () => {
  it("a finished task counts on the day it was closed, not the day it was scheduled", () => {
    expect(taskActivityDay(t({ status: "เสร็จ", doneAt: "2026-10-01 09:30" }))).toBe("2026-10-01");
  });
  it("open tasks and rows from before the column keep their date", () => {
    expect(taskActivityDay(t({ status: "", doneAt: "2026-10-01 09:30" }))).toBe("2026-09-10"); // reopened: doneAt stale
    expect(taskActivityDay(t({ status: "เสร็จ" }))).toBe("2026-09-10");
    expect(taskActivityDay(t({ status: "เสร็จ", doneAt: "" }))).toBe("2026-09-10");
  });
});
