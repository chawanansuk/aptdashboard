import { describe, expect, it } from "vitest";
import { suggestRoomStatusAfterTaskDone } from "./autoRoomStatus";
import {
  MOVEOUT_CLEAN_NOTE, MOVEOUT_INSPECT_NOTE,
  AFTER_REPAIR_CLEAN_NOTE, QC_CHECKLIST_NOTE, TURNOVER_REPAIR_NOTE,
} from "./moveoutTasks";

describe("suggestRoomStatusAfterTaskDone", () => {
  it("cleaning done + qc room → ready", () => {
    const s = suggestRoomStatusAfterTaskDone("ทำสะอาด", "เสร็จ", "qc");
    expect(s?.rawStatus).toBe("ว่าง");
  });

  it("cleaning done + moveout room → ready", () => {
    const s = suggestRoomStatusAfterTaskDone("ทำสะอาด", "เสร็จ", "moveout");
    expect(s?.rawStatus).toBe("ว่าง");
  });

  it("cleaning done + already ready → no change", () => {
    expect(suggestRoomStatusAfterTaskDone("ทำสะอาด", "เสร็จ", "ready")).toBeNull();
  });

  it("cleaning done + occupied → no change (room still occupied)", () => {
    expect(suggestRoomStatusAfterTaskDone("ทำสะอาด", "เสร็จ", "occupied")).toBeNull();
  });

  it("move-in done + ready → occupied", () => {
    expect(suggestRoomStatusAfterTaskDone("ย้ายเข้า", "เสร็จ", "ready")?.rawStatus).toBe("มีผู้เช่า");
  });

  it("move-in done + pending → occupied", () => {
    expect(suggestRoomStatusAfterTaskDone("ย้ายเข้า", "เสร็จ", "pending")?.rawStatus).toBe("มีผู้เช่า");
  });

  it("move-out done + occupied → ready", () => {
    expect(suggestRoomStatusAfterTaskDone("ย้ายออก", "เสร็จ", "occupied")?.rawStatus).toBe("ว่าง");
  });

  it("move-out done + already moveout → ready", () => {
    expect(suggestRoomStatusAfterTaskDone("ย้ายออก", "เสร็จ", "moveout")?.rawStatus).toBe("ว่าง");
  });

  it("repair done → no automation (ambiguous)", () => {
    expect(suggestRoomStatusAfterTaskDone("ซ่อม", "เสร็จ", "occupied")).toBeNull();
  });

  it("ชมห้อง done → no automation", () => {
    expect(suggestRoomStatusAfterTaskDone("ชมห้อง", "เสร็จ", "ready")).toBeNull();
  });

  it("task not done → no suggestion", () => {
    expect(suggestRoomStatusAfterTaskDone("ทำสะอาด", "กำลังทำ", "qc")).toBeNull();
    expect(suggestRoomStatusAfterTaskDone("ทำสะอาด", "ติดขัด", "qc")).toBeNull();
    expect(suggestRoomStatusAfterTaskDone("ทำสะอาด", "ยกเลิก", "qc")).toBeNull();
  });

  it("no current room status → no suggestion", () => {
    expect(suggestRoomStatusAfterTaskDone("ทำสะอาด", "เสร็จ", undefined)).toBeNull();
  });

  it("recognizes 'done' aliases (English + ปิดแล้ว)", () => {
    expect(suggestRoomStatusAfterTaskDone("ทำสะอาด", "done", "qc")?.rawStatus).toBe("ว่าง");
    expect(suggestRoomStatusAfterTaskDone("ทำสะอาด", "ปิดแล้ว", "qc")?.rawStatus).toBe("ว่าง");
  });

  // Turnover-pipeline override: lib/roomJourney owns these tasks. The
  // engineer closing one mid-pipeline must NOT auto-flip the room to ว่าง,
  // or the remaining journey steps get skipped.
  describe("turnover marker override → null", () => {
    const cases: Array<[string, string]> = [
      ["ทำสะอาดก่อนตรวจ", MOVEOUT_CLEAN_NOTE],
      ["ตรวจห้อง+คืนประกัน", MOVEOUT_INSPECT_NOTE],
      ["ทำสะอาดหลังซ่อม", AFTER_REPAIR_CLEAN_NOTE],
      ["Checklist QC", QC_CHECKLIST_NOTE],
      ["ซ่อมตามผลตรวจ", TURNOVER_REPAIR_NOTE],
    ];
    for (const [label, note] of cases) {
      it(`returns null for ${label} marker (note starts with "${note.slice(0, 20)}…")`, () => {
        expect(
          suggestRoomStatusAfterTaskDone("ทำสะอาด", "เสร็จ", "moveout", note),
        ).toBeNull();
      });
      it(`returns null even when caller appends extra text to "${label}" note`, () => {
        expect(
          suggestRoomStatusAfterTaskDone("ทำสะอาด", "เสร็จ", "moveout", `${note} — เพิ่มเติม`),
        ).toBeNull();
      });
    }

    it("non-turnover cleaning note still auto-flips (regression guard)", () => {
      const s = suggestRoomStatusAfterTaskDone("ทำสะอาด", "เสร็จ", "moveout", "ทำสะอาดทั่วไป");
      expect(s?.rawStatus).toBe("ว่าง");
    });

    it("empty/undefined note still auto-flips", () => {
      expect(suggestRoomStatusAfterTaskDone("ทำสะอาด", "เสร็จ", "qc", "")?.rawStatus).toBe("ว่าง");
      expect(suggestRoomStatusAfterTaskDone("ทำสะอาด", "เสร็จ", "qc")?.rawStatus).toBe("ว่าง");
    });
  });
});
