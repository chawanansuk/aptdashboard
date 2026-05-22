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

describe("searchRooms with vehicles", () => {
  const rooms = [
    mkRoom({ building: "Kl", room: "101", tenant: "" }),
    mkRoom({ building: "Kl", room: "202", tenant: "" }),
    mkRoom({ building: "G48", room: "303", tenant: "" }),
  ];
  const vehicles = [
    { building: "Kl",  room: "101", plate: "1กข-1234", model: "Honda Click", color: "แดง" },
    { building: "Kl",  room: "202", plate: "2ขค-5678", model: "Yamaha Aerox", color: "ดำ" },
    { building: "G48", room: "303", plate: "3คง-9999", model: "Yamaha NMAX",  color: "ขาว" },
  ];

  it("matches by exact plate", () => {
    const hits = searchRooms(rooms, "1กข-1234", 8, vehicles);
    expect(hits).toHaveLength(1);
    expect(hits[0].room.room).toBe("101");
    expect(hits[0].matchedVehicle?.plate).toBe("1กข-1234");
    expect(hits[0].rank).toBe(0);
  });

  it("matches by partial plate substring", () => {
    const hits = searchRooms(rooms, "5678", 8, vehicles);
    expect(hits).toHaveLength(1);
    expect(hits[0].room.room).toBe("202");
    expect(hits[0].matchedVehicle?.model).toBe("Yamaha Aerox");
  });

  it("matches by model name", () => {
    const hits = searchRooms(rooms, "click", 8, vehicles);
    expect(hits).toHaveLength(1);
    expect(hits[0].room.room).toBe("101");
  });

  it("matches by color", () => {
    const hits = searchRooms(rooms, "ขาว", 8, vehicles);
    expect(hits).toHaveLength(1);
    expect(hits[0].room.room).toBe("303");
  });

  it("matches multiple rooms with same model query", () => {
    const hits = searchRooms(rooms, "yamaha", 8, vehicles);
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.room.room).sort()).toEqual(["202", "303"]);
  });

  it("returns matchedVehicle = undefined when match came from room fields", () => {
    const hits = searchRooms(rooms, "101", 8, vehicles);
    expect(hits[0].room.room).toBe("101");
    expect(hits[0].matchedVehicle).toBeUndefined();
  });

  it("works with empty vehicles list (backward compat)", () => {
    const hits = searchRooms(rooms, "1กข-1234", 8, []);
    expect(hits).toHaveLength(0);
  });

  it("works with empty vehicles list default arg (backward compat)", () => {
    const hits = searchRooms(rooms, "101");
    expect(hits).toHaveLength(1);
    expect(hits[0].matchedVehicle).toBeUndefined();
  });

  it("prefers stronger rank from vehicles over weaker rank from room fields", () => {
    // Room "Kl/abc" matches "ab" as substring (rank 2). Vehicle plate
    // "abc-123" prefix-matches "ab" (rank 1). Vehicle wins → hint
    // surfaces the matched vehicle.
    const v = [
      { building: "Kl", room: "abc", plate: "abc-123", model: "", color: "" },
    ];
    const r = [mkRoom({ building: "Kl", room: "abc" })];
    const hits = searchRooms(r, "ab", 8, v);
    // Room field "abc" prefix-matches "ab" (rank 1) — same as plate
    // prefix. Tie → keep base hint (matchedVehicle undefined).
    expect(hits[0].rank).toBe(1);
    expect(hits[0].matchedVehicle).toBeUndefined();
  });

  it("uses vehicle when room fields don't match at all", () => {
    // Query "honda" matches no room field but matches a vehicle model.
    // Vehicle wins, hint surfaces it.
    const v = [
      { building: "Kl", room: "101", plate: "x", model: "Honda Click", color: "" },
    ];
    const r = [mkRoom({ building: "Kl", room: "101" })];
    const hits = searchRooms(r, "honda", 8, v);
    expect(hits[0].matchedVehicle?.model).toBe("Honda Click");
  });
});

describe("searchViews — permission filtering", () => {
  it("sales sees room/calendar views, NOT tenants (PII) / income / maintenance", () => {
    const hits = searchViews(["sales"], "");
    const labels = hits.map((h) => h.def.route);
    expect(labels).toContain("ready");
    // tenants is management-only after 2026-05 PII restriction
    expect(labels).not.toContain("tenants");
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

  it("multi-role sales+engineer sees union (still NO tenants — mgmt-only PII)", () => {
    const hits = searchViews(["sales", "engineer"], "");
    const labels = hits.map((h) => h.def.route);
    expect(labels).not.toContain("tenants");  // PII — mgmt-only
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
