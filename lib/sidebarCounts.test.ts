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
    expect(c.engTurnover).toBe(0);
  });

  it("engTurnover counts open tasks tagged with a turnover note prefix", () => {
    const tasks = [
      // The 5 turnover stages — first segment matches detectTurnoverStep.
      mkTask({ type: "อื่นๆ",    note: "ตรวจห้องก่อนคืนมัดจำ — เช็คเฟอร์" }),
      mkTask({ type: "ทำสะอาด",  note: "ทำสะอาดหลังย้ายออก — ปล่อยห้องใหม่ต่อ" }),
      mkTask({ type: "ซ่อม",     note: "ซ่อมตามผลตรวจห้อง — ก่อนปล่อยขาย" }),
      mkTask({ type: "ทำสะอาด",  note: "ทำสะอาดหลังซ่อม — เตรียม QC ก่อนปล่อยขาย" }),
      mkTask({ type: "อื่นๆ",    note: "Checklist สภาพห้องก่อนปล่อยขาย — ตรวจตามฟอร์ม" }),
      // Excluded — neither note matches the turnover prefixes.
      mkTask({ type: "ซ่อม",     note: "เปลี่ยนหลอดไฟ" }),
      mkTask({ type: "ทำสะอาด",  note: "ทำสะอาดประจำเดือน" }),
      // Excluded — closed.
      mkTask({ type: "ทำสะอาด",  note: "ทำสะอาดหลังย้ายออก — ปล่อยห้องใหม่", status: "เสร็จ" }),
    ];
    const c = computeSidebarCounts([], tasks, "ทั้งหมด", NOW);
    expect(c.engTurnover).toBe(5);
  });
});
