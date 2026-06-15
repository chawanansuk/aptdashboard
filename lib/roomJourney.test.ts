import { describe, expect, it } from "vitest";
import type { RoomView, SheetRow } from "@/types";
import { deriveJourney } from "./roomJourney";
import {
  MOVEOUT_CLEAN_NOTE, MOVEOUT_INSPECT_NOTE,
  AFTER_REPAIR_CLEAN_NOTE, QC_CHECKLIST_NOTE, TURNOVER_REPAIR_NOTE,
} from "./moveoutTasks";

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
    date: "12/06/2026", type: "ทำสะอาด", building: "Kl", room: "101",
    customer: "", phone: "", note: "", status: "",
    ...p,
  };
}

// Shorthand task builders for each marker.
const cleanBefore = (status = "") => mkTask({ type: "ทำสะอาด", note: MOVEOUT_CLEAN_NOTE, status });
const inspect = (status = "") => mkTask({ type: "อื่นๆ", note: MOVEOUT_INSPECT_NOTE, status });
const repair = (status = "") => mkTask({ type: "ซ่อม", note: TURNOVER_REPAIR_NOTE, status });
const cleanAfter = (status = "") => mkTask({ type: "ทำสะอาด", note: AFTER_REPAIR_CLEAN_NOTE, status });
const qc = (status = "") => mkTask({ type: "อื่นๆ", note: QC_CHECKLIST_NOTE, status });

describe("deriveJourney — selling side", () => {
  it("ready → offers booking + viewing", () => {
    const j = deriveJourney(mkRoom({ status: "ready" }));
    expect(j.stage).toBe("ready");
    expect(j.actions.map((a) => a.id)).toEqual(["confirmBooking", "addViewing"]);
  });

  it("ready with an open viewing shows it in the subtitle", () => {
    const j = deriveJourney(mkRoom({
      status: "ready",
      upcomingTasks: [mkTask({ type: "ชมห้อง", date: "15/06/2026", customer: "คุณฟ้า" })],
    }));
    expect(j.subtitle).toContain("15/06/2026");
    expect(j.subtitle).toContain("คุณฟ้า");
  });

  it("pending → single confirm-move-in action", () => {
    const j = deriveJourney(mkRoom({ status: "pending", tenant: "คุณบี" }));
    expect(j.stage).toBe("pending");
    expect(j.actions.map((a) => a.id)).toEqual(["confirmMoveIn"]);
    expect(j.subtitle).toContain("คุณบี");
  });

  it("occupied → notice-moveout action", () => {
    const j = deriveJourney(mkRoom({ status: "occupied" }));
    expect(j.actions.map((a) => a.id)).toEqual(["noticeMoveout"]);
  });
});

describe("deriveJourney — turnover pipeline (moveout → ready)", () => {
  it("moveout with no tasks → start: create clean-before", () => {
    const j = deriveJourney(mkRoom({ status: "moveout" }));
    expect(j.stage).toBe("moveout-start");
    expect(j.step).toEqual([1, 5]);
    expect(j.actions.map((a) => a.id)).toEqual(["createCleanBefore"]);
  });

  it("clean-before open → waiting on cleaner (no actions)", () => {
    const j = deriveJourney(mkRoom({ status: "moveout", todayTasks: [cleanBefore("")] }));
    expect(j.stage).toBe("cleaning-before");
    expect(j.actions).toEqual([]);
  });

  it("clean-before done → offer create-inspect", () => {
    const j = deriveJourney(mkRoom({ status: "moveout", pastTasks: [cleanBefore("เสร็จ")] }));
    expect(j.stage).toBe("await-inspect");
    expect(j.step).toEqual([2, 5]);
    expect(j.actions.map((a) => a.id)).toEqual(["createInspect"]);
  });

  it("inspect open → waiting on inspector (deposit-refund stage)", () => {
    const j = deriveJourney(mkRoom({
      status: "moveout",
      pastTasks: [cleanBefore("เสร็จ")],
      todayTasks: [inspect("")],
    }));
    expect(j.stage).toBe("inspecting");
    expect(j.title).toContain("คืนเงินประกัน");
  });

  it("inspect done → fork: create repair OR skip to QC", () => {
    const j = deriveJourney(mkRoom({
      status: "moveout",
      pastTasks: [cleanBefore("เสร็จ"), inspect("เสร็จ")],
    }));
    expect(j.stage).toBe("inspect-done");
    expect(j.actions.map((a) => a.id)).toEqual(["createRepair", "skipRepair"]);
  });

  it("repair open → repairing, no actions", () => {
    const j = deriveJourney(mkRoom({
      status: "moveout",
      pastTasks: [cleanBefore("เสร็จ"), inspect("เสร็จ")],
      todayTasks: [repair("กำลังทำ")],
    }));
    expect(j.stage).toBe("repairing");
    expect(j.step).toEqual([3, 5]);
  });

  it("repair done → offer clean-after", () => {
    const j = deriveJourney(mkRoom({
      status: "moveout",
      pastTasks: [cleanBefore("เสร็จ"), inspect("เสร็จ"), repair("เสร็จ")],
    }));
    expect(j.stage).toBe("cleaning-after");
    expect(j.actions.map((a) => a.id)).toEqual(["createCleanAfter"]);
  });

  it("clean-after done → offer QC checklist", () => {
    const j = deriveJourney(mkRoom({
      status: "moveout",
      pastTasks: [cleanBefore("เสร็จ"), inspect("เสร็จ"), repair("เสร็จ"), cleanAfter("เสร็จ")],
    }));
    expect(j.stage).toBe("qc-checklist");
    expect(j.actions.map((a) => a.id)).toEqual(["createQcChecklist"]);
  });

  it("qc open → checklist in progress, no actions", () => {
    const j = deriveJourney(mkRoom({
      status: "moveout",
      pastTasks: [cleanBefore("เสร็จ"), inspect("เสร็จ")],
      todayTasks: [qc("")],
    }));
    expect(j.stage).toBe("qc-checklist");
    expect(j.actions).toEqual([]);
  });

  it("qc done → release-ready with the single release action", () => {
    const j = deriveJourney(mkRoom({
      status: "moveout",
      pastTasks: [cleanBefore("เสร็จ"), inspect("เสร็จ"), qc("เสร็จ")],
    }));
    expect(j.stage).toBe("release-ready");
    expect(j.step).toEqual([5, 5]);
    expect(j.actions.map((a) => a.id)).toEqual(["releaseRoom"]);
  });

  it("works the same when the sheet status drifted to qc/repair mid-pipeline", () => {
    const j = deriveJourney(mkRoom({
      status: "repair",
      pastTasks: [cleanBefore("เสร็จ"), inspect("เสร็จ")],
      todayTasks: [repair("กำลังทำ")],
    }));
    expect(j.stage).toBe("repairing");
  });

  it("cancelled task counts as not-started (offers to recreate)", () => {
    const j = deriveJourney(mkRoom({
      status: "moveout",
      pastTasks: [cleanBefore("ยกเลิก")],
    }));
    expect(j.stage).toBe("moveout-start");
    expect(j.actions.map((a) => a.id)).toEqual(["createCleanBefore"]);
  });

  it("note suffix edits don't break marker matching (startsWith key)", () => {
    const edited = mkTask({
      type: "ทำสะอาด",
      note: "ทำสะอาดหลังย้ายออก — เพิ่มเติม: ขัดคราบหนัก",
      status: "เสร็จ",
    });
    const j = deriveJourney(mkRoom({ status: "moveout", pastTasks: [edited] }));
    expect(j.stage).toBe("await-inspect");
  });

  it("the two clean kinds don't cross-match (before vs after-repair)", () => {
    // Only after-repair clean exists+done; clean-before never happened →
    // pipeline must NOT think step 1 is done.
    const j = deriveJourney(mkRoom({ status: "moveout", pastTasks: [cleanAfter("เสร็จ")] }));
    // cleanAfter.done && no qc → straight-to-QC branch fires (legitimate:
    // someone fast-tracked) — the important part is it didn't read as
    // "await-inspect" via the wrong marker.
    expect(j.stage).not.toBe("await-inspect");
  });
});

describe("deriveJourney — non-turnover statuses", () => {
  it("plain repair room without turnover markers → other (panel hidden)", () => {
    const j = deriveJourney(mkRoom({ status: "repair" }));
    expect(j.stage).toBe("other");
    expect(j.actions).toEqual([]);
  });

  it("inactive → other", () => {
    const j = deriveJourney(mkRoom({ status: "inactive" }));
    expect(j.stage).toBe("other");
  });
});
