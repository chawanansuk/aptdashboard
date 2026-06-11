import { describe, expect, it } from "vitest";
import type { RoomView, SheetRow } from "@/types";
import { computeSidebarCounts } from "./sidebarCounts";

function mkRoom(p: Partial<RoomView>): RoomView {
  return {
    building: "Kl", room: "101", floor: "1", price: "5000",
    status: "ready", rawStatus: "ว่าง", tenant: "", phone: "",
    contractEnd: "", today: false, needsCleaning: false,
    todayTasks: [], upcomingTasks: [], pastTasks: [],
    ...p,
  };
}

function mkTask(p: Partial<SheetRow>): SheetRow {
  return {
    date: "10/06/2026", type: "ซ่อม", building: "Kl", room: "101",
    customer: "", phone: "", note: "", status: "",
    ...p,
  };
}

const NOW = new Date(2026, 5, 11); // 11 Jun 2026

describe("computeSidebarCounts", () => {
  it("counts rooms per status + today flags + total", () => {
    const rooms = [
      mkRoom({ status: "ready" }),
      mkRoom({ status: "ready", today: true }),
      mkRoom({ status: "occupied" }),
      mkRoom({ status: "moveout", today: true }),
    ];
    const c = computeSidebarCounts(rooms, [], "ทั้งหมด", NOW);
    expect(c.ready).toBe(2);
    expect(c.occupied).toBe(1);
    expect(c.moveout).toBe(1);
    expect(c.today).toBe(2);
    expect(c.total).toBe(4);
  });

  it("scopes rooms AND tasks by the active building", () => {
    const rooms = [
      mkRoom({ building: "Kl", status: "ready" }),
      mkRoom({ building: "มั่งมี", status: "ready" }),
    ];
    const tasks = [
      mkTask({ building: "Kl", date: "01/06/2026" }),      // overdue, in scope
      mkTask({ building: "มั่งมี", date: "01/06/2026" }),  // overdue, out of scope
    ];
    const c = computeSidebarCounts(rooms, tasks, "Kl", NOW);
    expect(c.total).toBe(1);
    expect(c.overdue).toBe(1);
  });

  it("overdue counts open tasks dated before today only", () => {
    const tasks = [
      mkTask({ date: "10/06/2026", status: "" }),       // yesterday, open → overdue
      mkTask({ date: "11/06/2026", status: "" }),       // today → not overdue
      mkTask({ date: "01/06/2026", status: "เสร็จ" }),   // closed → skip
      mkTask({ date: "01/06/2026", status: "ยกเลิก" }),  // cancelled → skip
      mkTask({ date: "20/06/2026", status: "" }),       // future → not overdue
    ];
    const c = computeSidebarCounts([], tasks, "ทั้งหมด", NOW);
    expect(c.overdue).toBe(1);
  });

  it("returns zeroed counts for empty inputs", () => {
    const c = computeSidebarCounts([], [], "ทั้งหมด", NOW);
    expect(c.total).toBe(0);
    expect(c.today).toBe(0);
    expect(c.overdue).toBe(0);
    expect(c.ready).toBe(0);
  });
});
