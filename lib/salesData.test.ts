import { describe, expect, it } from "vitest";
import type { RoomView, SheetRow, RoomStatus } from "@/types";
import {
  scopeRooms, buildAppointments, countAppointmentsWithinDays,
  groupAppointmentsByDay, dayLabel, groupByBuildingFloor, buildBuildingGrids,
  buildKpis, applyBoardFilter, distinctFloors, formatDateShort,
  buildOccupancyByBuilding, buildAppointmentsTrend,
} from "./salesData";

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
    date: "10/06/2026", type: "ชมห้อง", building: "Kl", room: "101",
    customer: "", phone: "", note: "", status: "pending",
    ...p,
  };
}

const NOW = new Date(2026, 5, 5); // 5 Jun 2026 (Fri)

describe("scopeRooms", () => {
  it("returns all rooms for ทั้งหมด", () => {
    const rooms = [mkRoom({ building: "Kl" }), mkRoom({ building: "มั่งมี" })];
    expect(scopeRooms(rooms, "ทั้งหมด")).toHaveLength(2);
  });
  it("filters to the active building", () => {
    const rooms = [mkRoom({ building: "Kl" }), mkRoom({ building: "มั่งมี" })];
    expect(scopeRooms(rooms, "มั่งมี")).toEqual([rooms[1]]);
  });
});

describe("buildAppointments", () => {
  const tasks = [
    mkTask({ date: "10/06/2026", type: "ชมห้อง" }),       // future, sales
    mkTask({ date: "01/06/2026", type: "ชมห้อง" }),       // past → out
    mkTask({ date: "12/06/2026", type: "ซ่อม" }),         // not sales → out
    mkTask({ date: "11/06/2026", type: "ย้ายเข้า", status: "เสร็จ" }), // closed → out
    mkTask({ date: "08/06/2026", type: "ย้ายออก" }),       // future, sales
  ];

  it("keeps only future-dated, sales-type, open tasks sorted soonest-first", () => {
    const out = buildAppointments(tasks, "ทั้งหมด", NOW);
    expect(out.map((a) => a.task.date)).toEqual(["08/06/2026", "10/06/2026"]);
  });

  it("respects the active building scope", () => {
    const mixed = [mkTask({ date: "10/06/2026", building: "Kl" }), mkTask({ date: "10/06/2026", building: "มั่งมี" })];
    expect(buildAppointments(mixed, "มั่งมี", NOW)).toHaveLength(1);
  });
});

describe("countAppointmentsWithinDays", () => {
  it("counts inclusively to the last day", () => {
    const items = [{ date: new Date(2026, 5, 5) }, { date: new Date(2026, 5, 12) }, { date: new Date(2026, 5, 13) }];
    expect(countAppointmentsWithinDays(items, 7, NOW)).toBe(2); // 5th + 12th, not 13th
  });
});

describe("dayLabel + groupAppointmentsByDay", () => {
  it("labels today / tomorrow / weekday", () => {
    expect(dayLabel(new Date(2026, 5, 5), NOW)).toBe("วันนี้");
    expect(dayLabel(new Date(2026, 5, 6), NOW)).toBe("พรุ่งนี้");
    expect(dayLabel(new Date(2026, 5, 7), NOW)).toBe("อาทิตย์ 7 มิ.ย.");
  });

  it("groups appointments by calendar day preserving order", () => {
    const appts = buildAppointments(
      [mkTask({ date: "08/06/2026" }), mkTask({ date: "08/06/2026", room: "102" }), mkTask({ date: "10/06/2026" })],
      "ทั้งหมด", NOW,
    );
    const groups = groupAppointmentsByDay(appts, NOW);
    expect(groups).toHaveLength(2);
    expect(groups[0].items).toHaveLength(2);
  });
});

describe("groupByBuildingFloor", () => {
  const rooms = [
    mkRoom({ building: "Kl", floor: "2", room: "201" }),
    mkRoom({ building: "Kl", floor: "1", room: "102" }),
    mkRoom({ building: "Kl", floor: "1", room: "101" }),
    mkRoom({ building: "มั่งมี", floor: "1", room: "1" }),
  ];

  it("orders buildings by preference, floors ascending, rooms numerically", () => {
    const out = groupByBuildingFloor(rooms);
    expect(out.map((b) => b.building)).toEqual(["Kl", "มั่งมี"]);
    expect(out[0].floors.map((f) => f.floor)).toEqual(["1", "2"]);
    expect(out[0].floors[0].rooms.map((r) => r.room)).toEqual(["101", "102"]);
  });

  it("floorDesc flips floors highest-first", () => {
    const out = groupByBuildingFloor(rooms, true);
    expect(out[0].floors.map((f) => f.floor)).toEqual(["2", "1"]);
  });
});

describe("buildBuildingGrids", () => {
  it("computes occupied% and vacant per building, floors highest-first", () => {
    const rooms = [
      mkRoom({ building: "Kl", floor: "1", room: "101", status: "ready" }),
      mkRoom({ building: "Kl", floor: "1", room: "102", status: "occupied" }),
      mkRoom({ building: "Kl", floor: "2", room: "201", status: "occupied" }),
      mkRoom({ building: "Kl", floor: "2", room: "202", status: "moveout" }),
    ];
    const [kl] = buildBuildingGrids(rooms);
    expect(kl.total).toBe(4);
    expect(kl.floorCount).toBe(2);
    expect(kl.occupiedPct).toBe(50); // 2 of 4 occupied
    expect(kl.vacant).toBe(1);       // 1 ready
    expect(kl.floors.map((f) => f.floor)).toEqual(["2", "1"]);
  });
});

describe("buildOccupancyByBuilding", () => {
  it("counts each status, derives occupied = total − available, and %", () => {
    const rooms = [
      mkRoom({ building: "Kl", status: "ready" }),     // available
      mkRoom({ building: "Kl", status: "ready" }),     // available
      mkRoom({ building: "Kl", status: "occupied" }),
      mkRoom({ building: "Kl", status: "pending" }),
      mkRoom({ building: "Kl", status: "moveout" }),
    ];
    const [kl] = buildOccupancyByBuilding(rooms);
    expect(kl.total).toBe(5);
    expect(kl.counts).toEqual({ available: 2, pending: 1, occupied: 1, moveout: 1 });
    expect(kl.vacant).toBe(2);
    expect(kl.occupied).toBe(3);           // total − available
    expect(kl.occupiedPct).toBe(60);       // 3/5
  });

  it("orders buildings by sales preference", () => {
    const rooms = [
      mkRoom({ building: "มีทอง", status: "ready" }),
      mkRoom({ building: "Kl", status: "ready" }),
    ];
    expect(buildOccupancyByBuilding(rooms).map((b) => b.building)).toEqual(["Kl", "มีทอง"]);
  });

  it("a fully-let building reads 100% with zero vacancy", () => {
    const rooms = [
      mkRoom({ building: "Kl", status: "occupied" }),
      mkRoom({ building: "Kl", status: "moveout" }),
    ];
    const [kl] = buildOccupancyByBuilding(rooms);
    expect(kl.occupiedPct).toBe(100);
    expect(kl.vacant).toBe(0);
  });

  it("returns an empty array for no rooms", () => {
    expect(buildOccupancyByBuilding([])).toEqual([]);
  });
});

describe("buildKpis", () => {
  it("counts available/pending/moveout + appointments this week", () => {
    const rooms = [
      mkRoom({ status: "ready" }), mkRoom({ status: "ready" }),
      mkRoom({ status: "pending" }), mkRoom({ status: "moveout" }),
      mkRoom({ status: "occupied" }),
    ];
    const appts = buildAppointments([mkTask({ date: "08/06/2026" })], "ทั้งหมด", NOW);
    const k = buildKpis(rooms, appts, NOW);
    expect(k).toEqual({ available: 2, pending: 1, moveout: 1, appointmentsThisWeek: 1 });
  });
});

describe("applyBoardFilter", () => {
  const rooms = [
    mkRoom({ room: "101", status: "ready", floor: "1", tenant: "" }),
    mkRoom({ room: "102", status: "occupied", floor: "1", tenant: "สมชาย" }),
    mkRoom({ room: "201", status: "pending", floor: "2", tenant: "" }),
  ];

  it("hides occupied by default (no status filter, toggle off)", () => {
    const out = applyBoardFilter(rooms, { statuses: new Set(), floor: "all", search: "", showOccupied: false });
    expect(out.map((r) => r.room)).toEqual(["101", "201"]);
  });

  it("shows occupied when toggle on", () => {
    const out = applyBoardFilter(rooms, { statuses: new Set(), floor: "all", search: "", showOccupied: true });
    expect(out).toHaveLength(3);
  });

  it("status filter overrides the occupied toggle", () => {
    const out = applyBoardFilter(rooms, { statuses: new Set(["occupied"]), floor: "all", search: "", showOccupied: false });
    expect(out.map((r) => r.room)).toEqual(["102"]);
  });

  it("filters by floor", () => {
    const out = applyBoardFilter(rooms, { statuses: new Set(), floor: "2", search: "", showOccupied: true });
    expect(out.map((r) => r.room)).toEqual(["201"]);
  });

  it("searches room number and tenant name", () => {
    expect(applyBoardFilter(rooms, { statuses: new Set(), floor: "all", search: "201", showOccupied: true }).map((r) => r.room)).toEqual(["201"]);
    expect(applyBoardFilter(rooms, { statuses: new Set(), floor: "all", search: "สมชาย", showOccupied: true }).map((r) => r.room)).toEqual(["102"]);
  });
});

describe("distinctFloors", () => {
  it("returns sorted distinct floors", () => {
    const rooms = [mkRoom({ floor: "2" }), mkRoom({ floor: "1" }), mkRoom({ floor: "2" }), mkRoom({ floor: "10" })];
    expect(distinctFloors(rooms)).toEqual(["1", "2", "10"]);
  });
});

describe("formatDateShort", () => {
  it("pads to dd/MM", () => {
    expect(formatDateShort(new Date(2026, 0, 5))).toBe("05/01");
  });
});

describe("buildAppointmentsTrend", () => {
  // Anchor on Mon 1 Jun 2026 so weeks land on clean boundaries.
  const NOW_MON = new Date(2026, 5, 1);

  it("returns `weeks` slots, oldest → newest (current week last)", () => {
    const out = buildAppointmentsTrend([], "ทั้งหมด", 7, NOW_MON);
    expect(out).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("counts a task in the current week into the last bucket", () => {
    // Friday 5 Jun is the same week as Mon 1 Jun.
    const tasks = [mkTask({ date: "05/06/2026", type: "ชมห้อง" })];
    expect(buildAppointmentsTrend(tasks, "ทั้งหมด", 7, NOW_MON)).toEqual([0, 0, 0, 0, 0, 0, 1]);
  });

  it("counts a task in the previous week into bucket weeks-2", () => {
    // Wed 27 May 2026 is in the previous week (Mon 25 May–Sun 31 May).
    const tasks = [mkTask({ date: "27/05/2026", type: "ย้ายเข้า" })];
    expect(buildAppointmentsTrend(tasks, "ทั้งหมด", 7, NOW_MON)).toEqual([0, 0, 0, 0, 0, 1, 0]);
  });

  it("ignores tasks older than the window and future tasks past current week", () => {
    const tasks = [
      mkTask({ date: "01/01/2026", type: "ชมห้อง" }), // way past
      mkTask({ date: "20/06/2026", type: "ชมห้อง" }), // future, beyond current week
    ];
    expect(buildAppointmentsTrend(tasks, "ทั้งหมด", 7, NOW_MON)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("respects the active building filter", () => {
    const tasks = [
      mkTask({ date: "05/06/2026", type: "ชมห้อง", building: "Kl" }),
      mkTask({ date: "05/06/2026", type: "ชมห้อง", building: "มั่งมี" }),
    ];
    expect(buildAppointmentsTrend(tasks, "Kl", 7, NOW_MON)).toEqual([0, 0, 0, 0, 0, 0, 1]);
  });

  it("ignores non-sales task types", () => {
    const tasks = [mkTask({ date: "05/06/2026", type: "ซ่อม" })];
    expect(buildAppointmentsTrend(tasks, "ทั้งหมด", 7, NOW_MON)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("aggregates multiple tasks in the same week", () => {
    const tasks = [
      mkTask({ date: "01/06/2026", type: "ชมห้อง" }),
      mkTask({ date: "03/06/2026", type: "ย้ายเข้า" }),
      mkTask({ date: "07/06/2026", type: "ย้ายออก" }),
    ];
    expect(buildAppointmentsTrend(tasks, "ทั้งหมด", 7, NOW_MON)).toEqual([0, 0, 0, 0, 0, 0, 3]);
  });
});
