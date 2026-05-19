import { describe, expect, it } from "vitest";
import type { SheetRow } from "@/types";
import {
  getTaskUrgency, daysOverdue, bucketTasks,
  URGENCY_ORDER,
} from "./taskUrgency";

// Frozen "today" for all tests
const NOW = new Date("2026-05-19T10:00:00+07:00");

function mkTask(p: Partial<SheetRow>): SheetRow {
  return {
    date: "",
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

describe("getTaskUrgency", () => {
  it("returns 'today' for date = today", () => {
    expect(getTaskUrgency(mkTask({ date: "19/05/2026" }), NOW)).toBe("today");
  });

  it("returns 'tomorrow' for date = today + 1", () => {
    expect(getTaskUrgency(mkTask({ date: "20/05/2026" }), NOW)).toBe("tomorrow");
  });

  it("returns 'thisWeek' for 2-7 days out", () => {
    expect(getTaskUrgency(mkTask({ date: "21/05/2026" }), NOW)).toBe("thisWeek");
    expect(getTaskUrgency(mkTask({ date: "26/05/2026" }), NOW)).toBe("thisWeek");
  });

  it("returns 'later' for date > 7 days out", () => {
    expect(getTaskUrgency(mkTask({ date: "27/05/2026" }), NOW)).toBe("later");
    expect(getTaskUrgency(mkTask({ date: "01/06/2026" }), NOW)).toBe("later");
  });

  it("returns 'overdue' for past date", () => {
    expect(getTaskUrgency(mkTask({ date: "18/05/2026" }), NOW)).toBe("overdue");
    expect(getTaskUrgency(mkTask({ date: "01/01/2026" }), NOW)).toBe("overdue");
  });

  it("returns 'noDate' for empty / unparseable date", () => {
    expect(getTaskUrgency(mkTask({ date: "" }), NOW)).toBe("noDate");
    expect(getTaskUrgency(mkTask({ date: "not-a-date" }), NOW)).toBe("noDate");
  });
});

describe("daysOverdue", () => {
  it("returns positive day count for overdue tasks", () => {
    expect(daysOverdue(mkTask({ date: "18/05/2026" }), NOW)).toBe(1);
    expect(daysOverdue(mkTask({ date: "12/05/2026" }), NOW)).toBe(7);
  });
  it("returns 0 for non-overdue (today or future)", () => {
    expect(daysOverdue(mkTask({ date: "19/05/2026" }), NOW)).toBe(0);
    expect(daysOverdue(mkTask({ date: "21/05/2026" }), NOW)).toBe(0);
  });
  it("returns 0 for no-date tasks", () => {
    expect(daysOverdue(mkTask({ date: "" }), NOW)).toBe(0);
  });
});

describe("bucketTasks", () => {
  it("groups tasks into urgency buckets in canonical order", () => {
    const tasks = [
      mkTask({ date: "27/05/2026", room: "5" }),  // later
      mkTask({ date: "19/05/2026", room: "1" }),  // today
      mkTask({ date: "10/05/2026", room: "2" }),  // overdue
      mkTask({ date: "21/05/2026", room: "3" }),  // thisWeek
      mkTask({ date: "20/05/2026", room: "4" }),  // tomorrow
    ];
    const result = bucketTasks(tasks, NOW);
    expect(result.map((g) => g.urgency)).toEqual([
      "overdue", "today", "tomorrow", "thisWeek", "later",
    ]);
  });

  it("omits empty buckets", () => {
    const tasks = [mkTask({ date: "19/05/2026" })]; // only today
    const result = bucketTasks(tasks, NOW);
    expect(result.length).toBe(1);
    expect(result[0].urgency).toBe("today");
  });

  it("sorts overdue most-overdue first", () => {
    const tasks = [
      mkTask({ date: "17/05/2026", room: "newer" }),  // 2 days overdue
      mkTask({ date: "01/05/2026", room: "older" }),  // 18 days overdue
      mkTask({ date: "10/05/2026", room: "middle" }), // 9 days overdue
    ];
    const result = bucketTasks(tasks, NOW);
    expect(result[0].tasks.map((t) => t.room)).toEqual(["older", "middle", "newer"]);
  });

  it("sorts non-overdue buckets by building + room (numeric)", () => {
    const tasks = [
      mkTask({ date: "19/05/2026", building: "Kl", room: "201" }),
      mkTask({ date: "19/05/2026", building: "Kl", room: "10" }),
      mkTask({ date: "19/05/2026", building: "G48", room: "5" }),
    ];
    const result = bucketTasks(tasks, NOW);
    const order = result[0].tasks.map((t) => `${t.building}-${t.room}`);
    expect(order[0]).toBe("G48-5"); // building comes first
    expect(order[1]).toBe("Kl-10"); // numeric: 10 before 201
    expect(order[2]).toBe("Kl-201");
  });

  it("noDate bucket sorts last", () => {
    const tasks = [
      mkTask({ date: "", room: "X" }),
      mkTask({ date: "19/05/2026", room: "Y" }),
    ];
    const result = bucketTasks(tasks, NOW);
    expect(result[result.length - 1].urgency).toBe("noDate");
  });

  it("URGENCY_ORDER matches actual rendering order", () => {
    const allUrgencies = [
      mkTask({ date: "10/05/2026" }),  // overdue
      mkTask({ date: "19/05/2026" }),  // today
      mkTask({ date: "20/05/2026" }),  // tomorrow
      mkTask({ date: "22/05/2026" }),  // thisWeek
      mkTask({ date: "30/05/2026" }),  // later
      mkTask({ date: "" }),            // noDate
    ];
    const result = bucketTasks(allUrgencies, NOW);
    expect(result.map((g) => g.urgency)).toEqual(URGENCY_ORDER);
  });
});
