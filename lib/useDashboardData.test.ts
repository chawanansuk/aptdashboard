import { describe, it, expect } from "vitest";
import {
  mergeRoomsAndTasks,
  applyOptimisticRoomPatches,
  type OptimisticRoomPatch,
} from "./useDashboardData";
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

describe("applyOptimisticRoomPatches", () => {
  const TTL = 5 * 60_000;
  const patches = (entries: [string, OptimisticRoomPatch][]) =>
    new Map<string, OptimisticRoomPatch>(entries);

  it("returns rooms unchanged when nothing is pending", () => {
    const rooms = [room()];
    const out = applyOptimisticRoomPatches(rooms, new Map(), Date.now(), TTL);
    expect(out).toBe(rooms);
  });

  it("re-applies a pending patch over stale (pre-write) server data", () => {
    const now = Date.now();
    // Server still shows the OLD status (CSV hasn't published the write).
    const server = [room({ status: "ว่าง" })];
    const map = patches([["A|101", { patch: { status: "รอสัญญา", tenant: "พู" }, at: now }]]);
    const [out] = applyOptimisticRoomPatches(server, map, now, TTL);
    expect(out.status).toBe("รอสัญญา");
    expect(out.tenant).toBe("พู");
    // Still pending — server hasn't confirmed yet.
    expect(map.has("A|101")).toBe(true);
  });

  it("drops a patch once the server row reflects every patched field", () => {
    const now = Date.now();
    // Server now matches the optimistic write → write landed.
    const server = [room({ status: "รอสัญญา", tenant: "พู" })];
    const map = patches([["A|101", { patch: { status: "รอสัญญา", tenant: "พู" }, at: now }]]);
    const [out] = applyOptimisticRoomPatches(server, map, now, TTL);
    expect(out.status).toBe("รอสัญญา");
    expect(map.has("A|101")).toBe(false);
  });

  it("drops a patch past the TTL even if unconfirmed (safety net)", () => {
    const now = Date.now();
    const server = [room({ status: "ว่าง" })];
    const map = patches([["A|101", { patch: { status: "รอสัญญา" }, at: now - TTL - 1 }]]);
    const [out] = applyOptimisticRoomPatches(server, map, now, TTL);
    expect(out.status).toBe("ว่าง"); // patch expired → server wins
    expect(map.has("A|101")).toBe(false);
  });

  it("leaves other rooms untouched", () => {
    const now = Date.now();
    const server = [room({ room: "101", status: "ว่าง" }), room({ room: "102", status: "occupied" })];
    const map = patches([["A|101", { patch: { status: "รอสัญญา" }, at: now }]]);
    const out = applyOptimisticRoomPatches(server, map, now, TTL);
    expect(out[0].status).toBe("รอสัญญา");
    expect(out[1].status).toBe("occupied");
  });
});
