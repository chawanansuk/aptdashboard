import { describe, it, expect } from "vitest";
import { mergeRoomsAndTasks } from "./useDashboardData";
import type { RoomRow, SheetRow } from "@/types";

function room(over: Partial<RoomRow> = {}): RoomRow {
  return {
    building: "A", room: "101", floor: "1", price: "5000",
    status: "ว่าง", tenant: "", phone: "", contractEnd: "", ...over,
  };
}

function task(over: Partial<SheetRow> = {}): SheetRow {
  return {
    date: "", type: "ทำสะอาด", building: "A", room: "101",
    customer: "", phone: "", note: "", status: "รอ", ...over,
  };
}

function todayParts() {
  const d = new Date();
  return {
    iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    dmy: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`,
  };
}

describe("mergeRoomsAndTasks — today bucket", () => {
  it("flags a task dated today in ISO format (yyyy-MM-dd) as today", () => {
    const { iso } = todayParts();
    const [view] = mergeRoomsAndTasks([room()], [task({ date: iso })]);
    expect(view.today).toBe(true);
    expect(view.todayTasks).toHaveLength(1);
  });

  it("flags a task dated today in DMY format (dd/MM/yyyy) as today", () => {
    const { dmy } = todayParts();
    const [view] = mergeRoomsAndTasks([room()], [task({ date: dmy })]);
    expect(view.today).toBe(true);
  });

  it("ignores done/cancelled tasks dated today", () => {
    const { iso } = todayParts();
    const [view] = mergeRoomsAndTasks(
      [room()],
      [task({ date: iso, status: "เสร็จ" }), task({ date: iso, status: "ยกเลิก" })],
    );
    expect(view.today).toBe(false);
    expect(view.todayTasks).toHaveLength(0);
  });
});
