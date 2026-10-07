import { describe, expect, it } from "vitest";
import type { SheetRow } from "@/types";
import {
  frequentRooms, priorSameFault, repairBreakdown, repairRecords, repeatFaults,
} from "./repairInsights";

const NOW = new Date(2026, 9, 7, 12).getTime(); // 7 Oct 2026

const t = (o: Partial<SheetRow>): SheetRow => ({
  date: "01/10/2026", type: "ซ่อม", building: "มั่งมี", room: "101", customer: "", phone: "",
  note: "", status: "เสร็จ", ...o,
});

const TASKS: SheetRow[] = [
  t({ room: "101", note: "เปลี่ยนหลอดไฟห้องน้ำ", category: "ไฟฟ้า", cost: 120, doneAt: "2026-10-01 10:00" }),
  t({ room: "101", note: "ไฟห้องน้ำดับอีก", category: "ไฟฟ้า", cost: 80, doneAt: "2026-09-12 09:00" }),
  t({ room: "101", note: "ก๊อกรั่ว", category: "ประปา", cost: 250, doneAt: "2026-08-20 09:00" }),
  t({ room: "102", note: "ล้างแอร์", status: "", date: "05/10/2026" }),          // open: counted, no money
  t({ room: "102", note: "ชักโครกตัน", cost: 300, doneAt: "2026-10-02 15:00" }), // no category → guessed ประปา
  t({ room: "103", note: "ไฟดับ", category: "ไฟฟ้า", cost: 50, doneAt: "2026-05-01 10:00" }), // > 90 days ago
  t({ room: "103", note: "ไฟดับ", category: "ไฟฟ้า", cost: 50, doneAt: "2026-10-03 10:00" }),
  t({ room: "104", note: "แปลก", category: "อื่นๆ", doneAt: "2026-10-01 10:00" }),
  t({ room: "104", note: "แปลกอีก", category: "อื่นๆ", doneAt: "2026-10-02 10:00" }),
  t({ room: "105", note: "ไฟดับ", category: "ไฟฟ้า", status: "ยกเลิก", date: "01/10/2026" }), // cancelled
  t({ type: "ทำสะอาด", room: "101", note: "ทำสะอาด" }),                                  // not a repair
];

describe("repairRecords", () => {
  it("repairs only, cancelled out; a missing category is guessed from the note", () => {
    const rs = repairRecords(TASKS);
    expect(rs).toHaveLength(9);
    const toilet = rs.find((r) => r.task.note === "ชักโครกตัน")!;
    expect(toilet).toMatchObject({ category: "ประปา", guessed: true, cost: 300 });
    expect(rs.find((r) => r.task.note === "ล้างแอร์")).toMatchObject({ done: false, cost: 0, category: "แอร์" });
  });
});

describe("repairBreakdown", () => {
  it("count and spend per category and building, biggest spend first", () => {
    const b = repairBreakdown(repairRecords(TASKS));
    expect(b.byCategory[0]).toEqual({ category: "ประปา", count: 2, cost: 550 });
    expect(b.byCategory.find((c) => c.category === "ไฟฟ้า")).toEqual({ category: "ไฟฟ้า", count: 4, cost: 300 });
    expect(b.total).toEqual({ count: 9, cost: 850 });
    expect(b.byBuilding).toEqual([{ building: "มั่งมี", count: 9, cost: 850 }]);
  });
});

describe("frequentRooms", () => {
  it("rooms with 2+ repairs, most first, with what broke", () => {
    const f = frequentRooms(repairRecords(TASKS));
    expect(f.map((r) => r.room)).toEqual(["101", "102", "103", "104"]);
    expect(f[0]).toMatchObject({ count: 3, cost: 450, categories: [["ไฟฟ้า", 2], ["ประปา", 1]] });
  });
});

describe("repeatFaults", () => {
  it("same room + category twice within 90 days; older ones and อื่นๆ don't count", () => {
    const r = repeatFaults(repairRecords(TASKS), NOW);
    expect(r.map((g) => `${g.room}:${g.category}`)).toEqual(["101:ไฟฟ้า"]);
    expect(r[0].records.map((x) => x.task.note)).toEqual(["เปลี่ยนหลอดไฟห้องน้ำ", "ไฟห้องน้ำดับอีก"]); // newest first
  });
});

describe("priorSameFault", () => {
  it("what the form warns about before the next repair is saved", () => {
    expect(priorSameFault(TASKS, { building: "มั่งมี", room: "101", category: "ไฟฟ้า" }, NOW)).toHaveLength(2);
    expect(priorSameFault(TASKS, { building: "มั่งมี", room: "103", category: "ไฟฟ้า" }, NOW)).toHaveLength(1); // May is outside
    expect(priorSameFault(TASKS, { building: "มั่งมี", room: "104", category: "อื่นๆ" }, NOW)).toEqual([]);
    expect(priorSameFault(TASKS, { building: "มั่งมี", room: "", category: "ไฟฟ้า" }, NOW)).toEqual([]);
  });
});
