import { describe, expect, it } from "vitest";
import type { Role } from "@/auth";
import {
  formatTurnoverToast,
  isTurnoverEventRelevant,
} from "./turnoverNotifications";
import type { BusEvent } from "./realtimeBus";

const stepDone = (step: BusEvent extends infer E
  ? E extends { kind: "turnover-step-done"; step: infer S } ? S : never
  : never): BusEvent => ({
  kind: "turnover-step-done",
  building: "Kl", room: "101", step, ts: 0,
});

const started: BusEvent = {
  kind: "turnover-started", building: "Kl", room: "202", ts: 0,
};

describe("formatTurnoverToast", () => {
  it("non-final steps render as in-progress info toasts", () => {
    const t = formatTurnoverToast(stepDone("inspect"));
    expect(t).not.toBeNull();
    expect(t!.tone).toBe("info");
    expect(t!.title).toContain("Kl-101");
    expect(t!.title).toContain("ตรวจห้อง");
  });

  it("QC closing renders as a success handoff toast with next-action body", () => {
    const t = formatTurnoverToast(stepDone("qc"));
    expect(t!.tone).toBe("success");
    expect(t!.title).toContain("พร้อมปล่อยขาย");
    expect(t!.body).toContain("ว่าง");
  });

  it("turnover-started tells the engineer side what was filed", () => {
    const t = formatTurnoverToast(started);
    expect(t!.tone).toBe("info");
    expect(t!.title).toContain("Kl-202");
    expect(t!.body).toContain("ตรวจห้อง");
    expect(t!.body).toContain("ทำสะอาด");
  });

  it("returns null for unrelated events so the subscriber can no-op", () => {
    expect(formatTurnoverToast({ kind: "session-changed", ts: 0 })).toBeNull();
    expect(formatTurnoverToast({
      kind: "data-changed", source: "task", ts: 0,
    })).toBeNull();
  });
});

describe("isTurnoverEventRelevant", () => {
  const sales: Role[] = ["sales"];
  const engineer: Role[] = ["engineer"];
  const mgmt: Role[] = ["management"];

  it("engineer→sales handoff: sales + management see it, engineer doesn't", () => {
    const e = stepDone("inspect");
    expect(isTurnoverEventRelevant(e, sales)).toBe(true);
    expect(isTurnoverEventRelevant(e, mgmt)).toBe(true);
    expect(isTurnoverEventRelevant(e, engineer)).toBe(false);
  });

  it("sales→engineer handoff: engineer + management see it, sales doesn't", () => {
    // Sales triggered it locally and already saw the autoCreateMoveoutPrep
    // toast — second one would be noise.
    expect(isTurnoverEventRelevant(started, engineer)).toBe(true);
    expect(isTurnoverEventRelevant(started, mgmt)).toBe(true);
    expect(isTurnoverEventRelevant(started, sales)).toBe(false);
  });

  it("multi-role user sees anything either role would see", () => {
    const both: Role[] = ["sales", "engineer"];
    expect(isTurnoverEventRelevant(stepDone("qc"), both)).toBe(true);
    expect(isTurnoverEventRelevant(started, both)).toBe(true);
  });

  it("returns false for unrelated events", () => {
    expect(isTurnoverEventRelevant({ kind: "session-changed", ts: 0 }, sales)).toBe(false);
  });
});
