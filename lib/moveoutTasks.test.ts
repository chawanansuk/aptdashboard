import { describe, it, expect } from "vitest";
import type { SheetRow } from "@/types";
import {
  MOVEOUT_INSPECT_TYPE,
  MOVEOUT_CLEAN_TYPE,
  MOVEOUT_PREP_KINDS,
  findOpenPrepTask,
  hasOpenPrepTask,
  todayThaiDate,
} from "./moveoutTasks";

function row(overrides: Partial<SheetRow> = {}): SheetRow {
  return {
    date: "01/01/2026",
    type: MOVEOUT_INSPECT_TYPE,
    building: "Kl",
    room: "101",
    customer: "",
    phone: "",
    note: "",
    cost: 0,
    status: "",
    ...overrides,
  } as SheetRow;
}

describe("moveoutTasks", () => {
  it("exports two prep kinds covering inspection + clean", () => {
    expect(MOVEOUT_PREP_KINDS).toHaveLength(2);
    const types = MOVEOUT_PREP_KINDS.map((k) => k.type);
    expect(types).toContain(MOVEOUT_INSPECT_TYPE);
    expect(types).toContain(MOVEOUT_CLEAN_TYPE);
  });

  it("hasOpenPrepTask returns true for an open match", () => {
    const tasks = [row({ status: "" }), row({ type: MOVEOUT_CLEAN_TYPE })];
    expect(hasOpenPrepTask(tasks, "Kl", "101", MOVEOUT_INSPECT_TYPE)).toBe(true);
    expect(hasOpenPrepTask(tasks, "Kl", "101", MOVEOUT_CLEAN_TYPE)).toBe(true);
  });

  it("hasOpenPrepTask ignores closed (done/cancelled) tasks", () => {
    const tasks = [
      row({ status: "เสร็จ" }),
      row({ status: "ยกเลิก" }),
    ];
    expect(hasOpenPrepTask(tasks, "Kl", "101", MOVEOUT_INSPECT_TYPE)).toBe(false);
  });

  it("hasOpenPrepTask filters by building+room+type", () => {
    const tasks = [
      row({ building: "มั่งมี", room: "101" }),
      row({ building: "Kl", room: "999" }),
      row({ building: "Kl", room: "101", type: "ซ่อม" }),
    ];
    expect(hasOpenPrepTask(tasks, "Kl", "101", MOVEOUT_INSPECT_TYPE)).toBe(false);
    expect(hasOpenPrepTask(tasks, "Kl", "101", "ซ่อม")).toBe(true);
  });

  it("hasOpenPrepTask handles undefined/empty list", () => {
    expect(hasOpenPrepTask(undefined, "Kl", "101", MOVEOUT_INSPECT_TYPE)).toBe(false);
    expect(hasOpenPrepTask([], "Kl", "101", MOVEOUT_INSPECT_TYPE)).toBe(false);
  });

  it("findOpenPrepTask returns the matching open task", () => {
    const target = row({ note: "target" });
    const tasks = [row({ status: "เสร็จ", note: "old" }), target];
    expect(findOpenPrepTask(tasks, "Kl", "101", MOVEOUT_INSPECT_TYPE)).toBe(target);
  });

  it("findOpenPrepTask returns undefined when no open match", () => {
    const tasks = [row({ status: "เสร็จ" })];
    expect(findOpenPrepTask(tasks, "Kl", "101", MOVEOUT_INSPECT_TYPE)).toBeUndefined();
  });

  it("todayThaiDate formats as dd/MM/yyyy", () => {
    const s = todayThaiDate();
    expect(s).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});
