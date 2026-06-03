import { describe, expect, it } from "vitest";
import { BUILDINGS, makeTaskSchema } from "@/lib/taskSchema";
import { BUILDINGS as BUILDINGS_FROM_TYPES } from "@/types";

describe("BUILDINGS canonical list (Task 12)", () => {
  it("includes all 5 production buildings", () => {
    expect(BUILDINGS).toContain("Kl");
    expect(BUILDINGS).toContain("มั่งมี");
    expect(BUILDINGS).toContain("มายทรี48");
    expect(BUILDINGS).toContain("มีทรัพย์");
    expect(BUILDINGS).toContain("มีทอง");
  });

  it("does NOT contain stale 'G48' (removed — not in current property roster)", () => {
    expect(BUILDINGS).not.toContain("G48");
  });

  it("@/types re-export points to the same canonical list", () => {
    // Was duplicate before — drift caused CleaningChart to render wrong set.
    expect(BUILDINGS_FROM_TYPES).toEqual(BUILDINGS);
    expect(BUILDINGS_FROM_TYPES).toBe(BUILDINGS);
  });
});

describe("task schema building validation (sheet is source of truth)", () => {
  const validInput = {
    date: "2026-05-29", type: "ชมห้อง", room: "301",
    customer: "", phone: "", note: "", cost: "",
  };

  it("accepts a building whose spelling differs from BUILDINGS as long as the room exists in the sheet (the KL bug)", () => {
    // Sheet stores "KL" (uppercase); the old z.enum(BUILDINGS) had "Kl"
    // and rejected this outright. Now the room-exists refine against the
    // live sheet is the gate.
    const schema = makeTaskSchema([{ building: "KL", room: "301" }]);
    const r = schema.safeParse({ ...validInput, building: "KL" });
    expect(r.success).toBe(true);
  });

  it("rejects a (building, room) pair that isn't in the sheet", () => {
    const schema = makeTaskSchema([{ building: "KL", room: "301" }]);
    const r = schema.safeParse({ ...validInput, building: "KL", room: "999" });
    expect(r.success).toBe(false);
  });

  it("still requires a non-empty building", () => {
    const schema = makeTaskSchema([{ building: "KL", room: "301" }]);
    const r = schema.safeParse({ ...validInput, building: "", room: "301" });
    expect(r.success).toBe(false);
  });
});
