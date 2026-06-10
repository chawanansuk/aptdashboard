import { describe, expect, it } from "vitest";
import type { SheetRow } from "@/types";
import { groupTasksForKanban, ageLabel, creatorLabel, COLUMN_STATUS } from "./EngineerKanban";
import { TASK_STATUS } from "@/lib/taskStatus";

describe("COLUMN_STATUS — drop target mapping", () => {
  it("maps each column to the status a drop should write", () => {
    expect(COLUMN_STATUS.pending).toBe(TASK_STATUS.PENDING);
    expect(COLUMN_STATUS.in_progress).toBe(TASK_STATUS.IN_PROGRESS);
    expect(COLUMN_STATUS.blocked).toBe(TASK_STATUS.BLOCKED);
    expect(COLUMN_STATUS.done).toBe(TASK_STATUS.DONE);
  });

  it("round-trips through groupTasksForKanban — a task written with a column's status buckets back there", () => {
    const today = "06/06/2026";
    const moved: SheetRow = {
      building: "Kl", room: "101", type: "ซ่อม", customer: "", phone: "",
      note: "", date: today, status: COLUMN_STATUS.in_progress,
    };
    const buckets = groupTasksForKanban([moved], today);
    expect(buckets.in_progress).toHaveLength(1);
    expect(buckets.pending).toHaveLength(0);
  });
});

describe("creatorLabel (Task 39)", () => {
  it("strips @domain from email so card stays compact", () => {
    expect(creatorLabel("john@example.com")).toBe("john");
  });
  it("returns the string as-is when no @", () => {
    expect(creatorLabel("admin")).toBe("admin");
  });
  it("returns '—' for undefined/empty (consistent fallback)", () => {
    expect(creatorLabel(undefined)).toBe("—");
    expect(creatorLabel("")).toBe("—");
  });
});

function task(overrides: Partial<SheetRow>): SheetRow {
  return {
    date: "01/05/2026",
    type: "ซ่อม",
    building: "Kl",
    room: "101",
    customer: "",
    phone: "",
    note: "",
    status: "",
    ...overrides,
  };
}

describe("groupTasksForKanban", () => {
  const today = "19/05/2026";

  it("blank status → pending column", () => {
    const out = groupTasksForKanban([task({ status: "" })], today);
    expect(out.pending.length).toBe(1);
    expect(out.in_progress.length).toBe(0);
    expect(out.blocked.length).toBe(0);
    expect(out.done.length).toBe(0);
  });

  it("กำลังทำ → in_progress column", () => {
    const out = groupTasksForKanban([task({ status: TASK_STATUS.IN_PROGRESS })], today);
    expect(out.in_progress.length).toBe(1);
  });

  it("ติดขัด → blocked column", () => {
    const out = groupTasksForKanban([task({ status: TASK_STATUS.BLOCKED })], today);
    expect(out.blocked.length).toBe(1);
  });

  it("เสร็จ on today → done column", () => {
    const out = groupTasksForKanban([task({ status: "เสร็จ", date: today })], today);
    expect(out.done.length).toBe(1);
  });

  it("เสร็จ on OLD date → not shown (would crowd the column)", () => {
    const out = groupTasksForKanban([task({ status: "เสร็จ", date: "01/05/2026" })], today);
    expect(out.done.length).toBe(0);
    expect(out.pending.length).toBe(0);
  });

  it("ยกเลิก → filtered out completely", () => {
    const out = groupTasksForKanban([task({ status: "ยกเลิก" })], today);
    expect(out.pending.length + out.in_progress.length + out.blocked.length + out.done.length).toBe(0);
  });

  it("sorts pending oldest-first (most urgent at top)", () => {
    const out = groupTasksForKanban([
      task({ room: "A", date: "20/05/2026" }),
      task({ room: "B", date: "01/05/2026" }), // older
      task({ room: "C", date: "10/05/2026" }),
    ], today);
    expect(out.pending.map((t) => t.room)).toEqual(["B", "C", "A"]);
  });

  it("unknown status values fall through to pending (defensive)", () => {
    const out = groupTasksForKanban([task({ status: "ว่าง" })], today);
    expect(out.pending.length).toBe(1);
  });
});

describe("ageLabel", () => {
  const now = new Date(2026, 4, 19); // 19 May 2026

  it("'วันนี้' for today's date", () => {
    expect(ageLabel("19/05/2026", now)).toBe("วันนี้");
  });
  it("'พรุ่งนี้' for tomorrow", () => {
    expect(ageLabel("20/05/2026", now)).toBe("พรุ่งนี้");
  });
  it("'อีก N วัน' for future > 1", () => {
    expect(ageLabel("25/05/2026", now)).toBe("อีก 6 วัน");
  });
  it("'เลย N วัน' for past dates (engineer needs to see backlog)", () => {
    expect(ageLabel("17/05/2026", now)).toBe("เลย 2 วัน");
    expect(ageLabel("01/05/2026", now)).toBe("เลย 18 วัน");
  });
  it("returns empty string for unparseable dates", () => {
    expect(ageLabel("not a date", now)).toBe("");
    expect(ageLabel("", now)).toBe("");
  });
});
