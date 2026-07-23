import { describe, expect, it } from "vitest";
import type { SheetRow } from "@/types";
import {
  buildPeriods, buildMaintDigest, digestToMarkdown, COMMON_AREA_ROOM,
} from "./maintLog";

function mk(over: Partial<SheetRow>): SheetRow {
  return {
    date: "15/07/2026", type: "ซ่อม", building: "มีทอง", room: "204",
    customer: "", phone: "", note: "", status: "เสร็จ", ...over,
  };
}

// A fixed "now" mid-month, mid-week (Wed 15 Jul 2026) keeps period math
// deterministic.
const NOW = new Date(2026, 6, 15);
const periods = buildPeriods(NOW);
const thisWeek = periods.find((p) => p.key === "w0")!;
const thisMonth = periods.find((p) => p.key === "m0")!;
const lastMonth = periods.find((p) => p.key === "m1")!;

describe("buildPeriods", () => {
  it("week starts Monday and spans 7 days", () => {
    const start = new Date(thisWeek.start);
    expect(start.getDay()).toBe(1); // Monday
    expect((thisWeek.end - thisWeek.start) / 86400000).toBe(7);
  });

  it("month period covers the calendar month exactly", () => {
    expect(new Date(thisMonth.start).getDate()).toBe(1);
    expect(new Date(thisMonth.end).getDate()).toBe(1);
    expect(new Date(thisMonth.end).getMonth()).toBe(7); // Aug
  });
});

describe("buildMaintDigest", () => {
  it("buckets rooms vs common area, sums costs, counts types", () => {
    const tasks = [
      mk({ note: "ก๊อกรั่ว", cost: 350 }),
      mk({ room: "305", type: "ทำสะอาด", note: "ล้างแอร์" }),
      mk({ room: COMMON_AREA_ROOM, type: "อื่นๆ", note: "[โถงชั้น1] เปลี่ยนหลอดไฟ", cost: 120 }),
    ];
    const d = buildMaintDigest(tasks, thisMonth);
    expect(d.rooms).toHaveLength(2);
    expect(d.common).toHaveLength(1);
    expect(d.doneCount).toBe(3);
    expect(d.totalCost).toBe(470);
    expect(Object.fromEntries(d.countsByType)).toEqual({ "ซ่อม": 1, "ทำสะอาด": 1, "อื่นๆ": 1 });
  });

  it("excludes sales task types and cancelled tasks", () => {
    const tasks = [
      mk({ type: "ชมห้อง" }),
      mk({ type: "ย้ายเข้า" }),
      mk({ status: "ยกเลิก", note: "ยกเลิกไปแล้ว" }),
    ];
    const d = buildMaintDigest(tasks, thisMonth);
    expect(d.rooms).toHaveLength(0);
    expect(d.doneCount).toBe(0);
  });

  it("shows open (unfinished) work in the period but never counts its cost", () => {
    const tasks = [mk({ status: "", note: "รอซ่อมต่อ", cost: 999 })];
    const d = buildMaintDigest(tasks, thisMonth);
    expect(d.openCount).toBe(1);
    expect(d.totalCost).toBe(0);
    expect(d.rooms[0].entries[0].done).toBe(false);
  });

  it("filters by period — a June task is in last month, not this month", () => {
    const june = mk({ date: "20/06/2026" });
    expect(buildMaintDigest([june], thisMonth).doneCount).toBe(0);
    expect(buildMaintDigest([june], lastMonth).doneCount).toBe(1);
  });

  it("handles ISO-formatted date cells (Apps Script Date cells)", () => {
    const iso = mk({ date: "2026-07-10" });
    expect(buildMaintDigest([iso], thisMonth).doneCount).toBe(1);
  });
});

describe("digestToMarkdown", () => {
  const tasks = [
    mk({ note: "ก๊อกรั่ว", cost: 350 }),
    mk({ room: COMMON_AREA_ROOM, type: "อื่นๆ", note: "[ดาดฟ้า] ทาสีกันซึม", cost: 2500 }),
  ];
  const digest = buildMaintDigest(tasks, thisMonth);

  it("renders sections, entries, and cost when allowed", () => {
    const md = digestToMarkdown(digest, "เดือนนี้", { includeCost: true });
    expect(md).toContain("# สรุปงานซ่อมบำรุง — เดือนนี้");
    expect(md).toContain("## รายห้อง");
    expect(md).toContain("## พื้นที่ส่วนกลาง");
    expect(md).toContain("ก๊อกรั่ว");
    expect(md).toContain("ทาสีกันซึม");
    expect(md).toContain("2,850 บาท"); // total
  });

  it("omits every cost figure when the viewer can't see financials", () => {
    const md = digestToMarkdown(digest, "เดือนนี้", { includeCost: false });
    expect(md).not.toContain("บาท");
    expect(md).not.toContain("350");
  });
});
