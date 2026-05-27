import { describe, it, expect } from "vitest";
import {
  mergeRoomsAndTasks,
  applyOptimisticRoomPatches,
  applyOptimisticTasks,
  taskKey,
  type OptimisticRoomPatch,
  type OptimisticTask,
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

describe("mergeRoomsAndTasks — needsCleaning flag (#6)", () => {
  const future = () => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  };

  it("booked (ว่าง + ย้ายเข้า) room that also needs cleaning → pending + needsCleaning", () => {
    const f = future();
    const [view] = mergeRoomsAndTasks(
      [room({ status: "ว่าง" })],
      [task({ type: "ย้ายเข้า", date: f }), task({ type: "ทำสะอาด", date: f })],
    );
    expect(view.status).toBe("pending"); // headline stays booked (no double-book)
    expect(view.needsCleaning).toBe(true); // but the clean is flagged
  });

  it("does NOT flag when the headline is already qc (ว่าง + ทำสะอาด only)", () => {
    const f = future();
    const [view] = mergeRoomsAndTasks([room({ status: "ว่าง" })], [task({ type: "ทำสะอาด", date: f })]);
    expect(view.status).toBe("qc");
    expect(view.needsCleaning).toBe(false); // redundant — headline shows it
  });

  it("flags a sheet-pending (รอสัญญา) room with an outstanding clean", () => {
    const f = future();
    const [view] = mergeRoomsAndTasks([room({ status: "รอสัญญา" })], [task({ type: "ทำสะอาด", date: f })]);
    expect(view.status).toBe("pending");
    expect(view.needsCleaning).toBe(true);
  });

  it("no clean task → needsCleaning false", () => {
    const f = future();
    const [view] = mergeRoomsAndTasks([room({ status: "ว่าง" })], [task({ type: "ย้ายเข้า", date: f })]);
    expect(view.needsCleaning).toBe(false);
  });
});

describe("applyOptimisticTasks", () => {
  const TTL = 5 * 60_000;
  const mk = (over: Partial<SheetRow> = {}): SheetRow => ({
    date: "27/05/2026", type: "ชมห้อง", building: "A", room: "101",
    customer: "", phone: "", note: "", status: "", ...over,
  });
  const pend = (entries: [string, OptimisticTask][]) => new Map<string, OptimisticTask>(entries);

  it("returns server tasks unchanged when nothing pending", () => {
    const server = [mk()];
    expect(applyOptimisticTasks(server, new Map(), Date.now(), TTL)).toBe(server);
  });

  it("prepends a pending task the server hasn't returned yet", () => {
    const now = Date.now();
    const added = mk({ room: "205" });
    const map = pend([[taskKey(added), { task: added, at: now }]]);
    const out = applyOptimisticTasks([mk({ room: "101" })], map, now, TTL);
    expect(out).toHaveLength(2);
    expect(out[0].room).toBe("205"); // prepended
    expect(map.size).toBe(1); // still pending — server hasn't confirmed
  });

  it("drops a pending task once the server list contains its key (confirmed)", () => {
    const now = Date.now();
    const added = mk({ room: "205" });
    const map = pend([[taskKey(added), { task: added, at: now }]]);
    // Server now returns the same task → reconcile away.
    const out = applyOptimisticTasks([mk({ room: "205" })], map, now, TTL);
    expect(out).toHaveLength(1);
    expect(map.has(taskKey(added))).toBe(false);
  });

  it("drops a pending task past the TTL even if unconfirmed", () => {
    const now = Date.now();
    const added = mk({ room: "205" });
    const map = pend([[taskKey(added), { task: added, at: now - TTL - 1 }]]);
    const out = applyOptimisticTasks([], map, now, TTL);
    expect(out).toHaveLength(0);
    expect(map.size).toBe(0);
  });

  it("taskKey matches the AddTaskModal identity (date|building|room|type)", () => {
    expect(taskKey(mk())).toBe("27/05/2026|A|101|ชมห้อง");
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
