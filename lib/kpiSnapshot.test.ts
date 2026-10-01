import { describe, expect, it } from "vitest";
import type { RoomView } from "@/types";
import { DaySnapshotSchema, buildDaySnapshot, lastBangkokDates, trendsFor } from "./kpiSnapshot";

function room(over: Partial<RoomView>): RoomView {
  return {
    building: "มั่งมี", room: "101", floor: "1", price: "4500",
    status: "ready", rawStatus: "ว่าง", tenant: "", phone: "", contractEnd: "",
    today: false, needsCleaning: false, todayTasks: [], upcomingTasks: [], pastTasks: [],
    ...over,
  };
}

describe("buildDaySnapshot", () => {
  it("counts the same statuses the sales cards count, for ทั้งหมด and each building", () => {
    const snap = buildDaySnapshot([
      room({ room: "101" }),
      room({ room: "102", status: "pending", rawStatus: "รอสัญญา" }),
      room({ building: "KL", room: "201", status: "moveout", rawStatus: "แจ้งย้ายออก" }),
      room({ building: "KL", room: "202", status: "occupied", rawStatus: "มีผู้เช่า" }),
    ]);
    expect(snap["ทั้งหมด"]).toEqual({ available: 1, pending: 1, moveout: 1 });
    expect(snap["มั่งมี"]).toEqual({ available: 1, pending: 1, moveout: 0 });
    expect(snap["KL"]).toEqual({ available: 0, pending: 0, moveout: 1 });
    expect(DaySnapshotSchema.safeParse(snap).success).toBe(true);
  });
});

describe("trendsFor", () => {
  const live = { available: 5, pending: 2, moveout: 1 };

  it("no stored day → no series (the card shows the number only)", () => {
    expect(trendsFor([], "ทั้งหมด", live)).toEqual({});
    expect(trendsFor([{ date: "2026-09-24", snapshot: null }], "ทั้งหมด", live)).toEqual({});
  });

  it("stored days oldest→newest, skipping days nobody opened the page, then today's live value", () => {
    const t = trendsFor([
      { date: "2026-09-22", snapshot: { "ทั้งหมด": { available: 3, pending: 4, moveout: 0 } } },
      { date: "2026-09-23", snapshot: null },
      { date: "2026-09-24", snapshot: { "ทั้งหมด": { available: 4, pending: 3, moveout: 1 } } },
    ], "ทั้งหมด", live);
    expect(t).toEqual({ available: [3, 4, 5], pending: [4, 3, 2], moveout: [0, 1, 1] });
  });

  it("a building tab reads its own counts", () => {
    const t = trendsFor([{ date: "2026-09-24", snapshot: { "ทั้งหมด": { available: 9, pending: 9, moveout: 9 }, KL: { available: 1, pending: 0, moveout: 2 } } }], "KL", live);
    expect(t.available).toEqual([1, 5]);
  });
});

describe("lastBangkokDates", () => {
  it("ends on Bangkok's today, oldest first — 20:00 UTC is already tomorrow in Bangkok", () => {
    expect(lastBangkokDates(3, new Date("2026-09-24T20:00:00Z"))).toEqual(["2026-09-23", "2026-09-24", "2026-09-25"]);
  });
});

describe("DaySnapshotSchema", () => {
  it("rejects junk: missing ทั้งหมด, negative or fractional counts, extra fields", () => {
    expect(DaySnapshotSchema.safeParse({ KL: { available: 1, pending: 0, moveout: 0 } }).success).toBe(false);
    expect(DaySnapshotSchema.safeParse({ "ทั้งหมด": { available: -1, pending: 0, moveout: 0 } }).success).toBe(false);
    expect(DaySnapshotSchema.safeParse({ "ทั้งหมด": { available: 1.5, pending: 0, moveout: 0 } }).success).toBe(false);
    expect(DaySnapshotSchema.safeParse({ "ทั้งหมด": { available: 1, pending: 0, moveout: 0, tenant: 1 } }).success).toBe(false);
  });
});
