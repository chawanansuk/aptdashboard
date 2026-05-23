import { describe, it, expect } from "vitest";
import type { SheetRow, RoomView } from "@/types";
import { buildNotifications, totalNotificationCount } from "./notifications";

const NOW = new Date(2026, 4, 23); // 23 May 2026 (Sat)

function dmy(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${date.getFullYear()}`;
}

function task(over: Partial<SheetRow> = {}): SheetRow {
  return {
    date: dmy(NOW),
    building: "ตึก A",
    room: "101",
    type: "ซ่อม",
    status: "",
    customer: "",
    phone: "",
    note: "",
    cost: 0,
    creator: "",
    createdAt: "",
    ...over,
  };
}

function room(over: Partial<RoomView> = {}): RoomView {
  return {
    building: "ตึก A",
    room: "101",
    floor: "1",
    price: "5000",
    status: "occupied",
    rawStatus: "มีคนอยู่",
    tenant: "นาย ก",
    phone: "0812345678",
    contractEnd: "",
    today: false,
    todayTasks: [],
    upcomingTasks: [],
    pastTasks: [],
    ...over,
  };
}

describe("buildNotifications", () => {
  it("returns empty list when nothing is wrong", () => {
    const items = buildNotifications({
      tasks: [],
      rooms: [],
      roles: ["management"],
      assetAlerts: { lowStockParts: 0, overdueEquipment: 0 },
      now: NOW,
    });
    expect(items).toEqual([]);
  });

  it("flags overdue open tasks and reports worst staleness", () => {
    const overdueOne = task({ date: dmy(new Date(2026, 4, 20)) }); // 3 days late
    const overdueTwo = task({ date: dmy(new Date(2026, 4, 15)) }); // 8 days late
    const futureTask = task({ date: dmy(new Date(2026, 4, 30)) });
    const doneTask  = task({ date: dmy(new Date(2026, 4, 1)), status: "เสร็จ" });
    const items = buildNotifications({
      tasks: [overdueOne, overdueTwo, futureTask, doneTask],
      rooms: [],
      roles: ["engineer"],
      now: NOW,
    });
    const o = items.find((i) => i.kind === "overdueTasks");
    expect(o).toBeDefined();
    expect(o!.count).toBe(2);
    expect(o!.detail).toContain("8");
    expect(o!.level).toBe("critical");
  });

  it("flags contracts expiring within 30 days but skips long-tail contracts", () => {
    const expiringSoon = room({ contractEnd: dmy(new Date(2026, 4, 30)) }); // 7 days
    const expiringEdge = room({ contractEnd: dmy(new Date(2026, 5, 22)) }); // 30 days
    const expiringLater = room({ contractEnd: dmy(new Date(2026, 6, 30)) }); // 68 days
    const vacant = room({ status: "ready", contractEnd: dmy(new Date(2026, 4, 25)) });
    const items = buildNotifications({
      tasks: [],
      rooms: [expiringSoon, expiringEdge, expiringLater, vacant],
      roles: ["sales", "management"],
      now: NOW,
    });
    const c = items.find((i) => i.kind === "contractsExpiring");
    expect(c).toBeDefined();
    expect(c!.count).toBe(2);
    expect(c!.detail).toContain("7");
  });

  it("hides parts/equipment notifications from sales", () => {
    const items = buildNotifications({
      tasks: [],
      rooms: [],
      roles: ["sales"],
      assetAlerts: { lowStockParts: 5, overdueEquipment: 3 },
      now: NOW,
    });
    expect(items.find((i) => i.kind === "lowStock")).toBeUndefined();
    expect(items.find((i) => i.kind === "overdueEquipment")).toBeUndefined();
  });

  it("shows parts/equipment notifications for engineer", () => {
    const items = buildNotifications({
      tasks: [],
      rooms: [],
      roles: ["engineer"],
      assetAlerts: { lowStockParts: 5, overdueEquipment: 3 },
      now: NOW,
    });
    expect(items.find((i) => i.kind === "lowStock")?.count).toBe(5);
    expect(items.find((i) => i.kind === "overdueEquipment")?.count).toBe(3);
  });

  it("flags moveout rooms and routes to moveout view", () => {
    const moveoutRoom = room({ status: "moveout" });
    const items = buildNotifications({
      tasks: [],
      rooms: [moveoutRoom, room({ status: "ready" })],
      roles: ["sales"],
      now: NOW,
    });
    const m = items.find((i) => i.kind === "moveoutPending");
    expect(m).toBeDefined();
    expect(m!.count).toBe(1);
    expect(m!.route).toBe("moveout");
  });

  it("orders critical items before warnings", () => {
    const items = buildNotifications({
      tasks: [task({ date: dmy(new Date(2026, 4, 20)) })],
      rooms: [room({ status: "moveout" })],
      roles: ["management"],
      assetAlerts: { lowStockParts: 1, overdueEquipment: 0 },
      now: NOW,
    });
    expect(items[0].level).toBe("critical");
    expect(items[items.length - 1].level === "warning").toBe(true);
  });

  it("totalNotificationCount sums every item's count", () => {
    const items = buildNotifications({
      tasks: [
        task({ date: dmy(new Date(2026, 4, 20)) }),
        task({ date: dmy(new Date(2026, 4, 20)), room: "102" }),
      ],
      rooms: [room({ status: "moveout" })],
      roles: ["management"],
      assetAlerts: { lowStockParts: 4, overdueEquipment: 0 },
      now: NOW,
    });
    expect(totalNotificationCount(items)).toBe(2 + 1 + 4);
  });
});
