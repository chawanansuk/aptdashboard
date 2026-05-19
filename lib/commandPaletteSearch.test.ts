import { describe, expect, it } from "vitest";
import {
  matchRank, searchRooms, searchViews, searchCommands, buildActions,
  type CommandDef,
} from "./commandPaletteSearch";
import type { RoomView } from "@/types";

function mkRoom(p: Partial<RoomView>): RoomView {
  return {
    building: "Kl",
    room: "101",
    floor: "1",
    price: "",
    status: "ready",
    rawStatus: "ว่าง",
    tenant: "",
    phone: "",
    contractEnd: "",
    today: false,
    todayTasks: [],
    upcomingTasks: [],
    pastTasks: [],
    ...p,
  };
}

describe("matchRank", () => {
  it("returns 0 for exact, 1 for prefix, 2 for substring", () => {
    expect(matchRank("305", "305")).toBe(0);
    expect(matchRank("305A", "305")).toBe(1);
    expect(matchRank("room-305", "305")).toBe(2);
    expect(matchRank("room", "305")).toBe(-1);
  });
  it("is case-insensitive", () => {
    expect(matchRank("Kl", "kl")).toBe(0);
    expect(matchRank("Mitsubishi", "MITSU")).toBe(1);
  });
  it("empty query matches everything with rank 0", () => {
    expect(matchRank("anything", "")).toBe(0);
  });
});

describe("searchRooms", () => {
  const rooms = [
    mkRoom({ building: "Kl", room: "305", tenant: "สมชาย", phone: "0812345678" }),
    mkRoom({ building: "G48", room: "305", tenant: "" }),
    mkRoom({ building: "Kl", room: "102", tenant: "สมหญิง" }),
    mkRoom({ building: "Kl", room: "203", tenant: "" }),
  ];

  it("finds rooms by room number across buildings", () => {
    const hits = searchRooms(rooms, "305");
    expect(hits.length).toBe(2);
    expect(hits.map((h) => h.room.building).sort()).toEqual(["G48", "Kl"]);
  });

  it("finds rooms by tenant name (substring)", () => {
    const hits = searchRooms(rooms, "สมชาย");
    expect(hits.length).toBe(1);
    expect(hits[0].room.room).toBe("305");
    expect(hits[0].room.tenant).toBe("สมชาย");
  });

  it("finds rooms by partial phone", () => {
    const hits = searchRooms(rooms, "0812");
    expect(hits.length).toBe(1);
    expect(hits[0].room.tenant).toBe("สมชาย");
  });

  it("respects limit", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      mkRoom({ building: "Kl", room: String(100 + i) })
    );
    expect(searchRooms(many, "1", 5).length).toBe(5);
  });

  it("ranks exact matches first", () => {
    const hits = searchRooms(rooms, "305");
    // both 305 rooms have exact rank 0; assert no non-exact bubble up first
    expect(hits[0].rank).toBe(0);
    expect(hits[1].rank).toBe(0);
  });
});

describe("searchViews — permission filtering", () => {
  it("sales sees room/tenant/calendar views, NOT income or maintenance", () => {
    const hits = searchViews(["sales"], "");
    const labels = hits.map((h) => h.def.route);
    expect(labels).toContain("ready");
    expect(labels).toContain("tenants");
    expect(labels).toContain("calendar");
    expect(labels).not.toContain("income");
    expect(labels).not.toContain("maintenance");
    expect(labels).not.toContain("qc");
  });

  it("engineer sees maintenance + qc, NOT income or tenants", () => {
    const hits = searchViews(["engineer"], "");
    const labels = hits.map((h) => h.def.route);
    expect(labels).toContain("maintenance");
    expect(labels).toContain("qc");
    expect(labels).not.toContain("income");
    expect(labels).not.toContain("tenants");
  });

  it("management sees income", () => {
    const hits = searchViews(["management"], "income");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].def.route).toBe("income");
  });

  it("multi-role sales+engineer sees union", () => {
    const hits = searchViews(["sales", "engineer"], "");
    const labels = hits.map((h) => h.def.route);
    expect(labels).toContain("tenants");
    expect(labels).toContain("maintenance");
    expect(labels).not.toContain("income"); // mgmt-only
  });

  it("filters by query — 'บำรุง' matches maintenance label", () => {
    const hits = searchViews(["management"], "บำรุง");
    const labels = hits.map((h) => h.def.route);
    expect(labels).toContain("maintenance");
  });

  it("nothing for unauthenticated (empty roles)", () => {
    expect(searchViews([], "")).toEqual([]);
    expect(searchViews(undefined, "")).toEqual([]);
  });
});

describe("searchCommands — permission filtering", () => {
  const commands: CommandDef[] = [
    { id: "addTask", label: "เพิ่มงานใหม่", requires: { action: "task.add" }, run: () => {} },
    { id: "deleteAll", label: "ลบงานทั้งหมด", requires: { action: "task.delete" }, run: () => {} },
    { id: "viewIncome", label: "ดูรายได้", requires: { route: "income" }, run: () => {} },
    { id: "toggleTheme", label: "Toggle dark mode", run: () => {} },
  ];

  it("sales sees addTask + toggleTheme but NOT deleteAll/viewIncome", () => {
    const hits = searchCommands(["sales"], commands, "");
    const ids = hits.map((h) => h.cmd.id);
    expect(ids).toContain("addTask");
    expect(ids).toContain("toggleTheme");
    expect(ids).not.toContain("deleteAll");
    expect(ids).not.toContain("viewIncome");
  });

  it("management sees all", () => {
    const hits = searchCommands(["management"], commands, "");
    expect(hits.map((h) => h.cmd.id).sort()).toEqual(
      ["addTask", "deleteAll", "toggleTheme", "viewIncome"]
    );
  });

  it("filters by query", () => {
    const hits = searchCommands(["management"], commands, "dark");
    expect(hits.length).toBe(1);
    expect(hits[0].cmd.id).toBe("toggleTheme");
  });
});

describe("buildActions — flat list ordering", () => {
  it("groups rooms first, then views, then commands", () => {
    const rooms = [mkRoom({ building: "Kl", room: "305" })];
    const cmds: CommandDef[] = [
      { id: "addTask", label: "เพิ่มงาน", requires: { action: "task.add" }, run: () => {} },
    ];
    const actions = buildActions({
      rooms, roles: ["management"], commands: cmds, query: "",
      onSelectRoom: () => {}, onChangeView: () => {},
    });

    const groups = actions.map((a) => a.groupOrder);
    // Must be non-decreasing
    for (let i = 1; i < groups.length; i++) {
      expect(groups[i]).toBeGreaterThanOrEqual(groups[i - 1]);
    }
  });

  it("filters rooms + views + commands by single query consistently", () => {
    const rooms = [
      mkRoom({ building: "Kl", room: "305" }),
      mkRoom({ building: "Kl", room: "101" }),
    ];
    const actions = buildActions({
      rooms, roles: ["management"],
      commands: [], query: "305",
      onSelectRoom: () => {}, onChangeView: () => {},
    });
    // Only the 305 room and no views/commands match "305"
    expect(actions.length).toBe(1);
    expect(actions[0].type).toBe("room");
    expect(actions[0].label).toContain("305");
  });
});
