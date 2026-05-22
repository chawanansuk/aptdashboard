import { describe, expect, it } from "vitest";
import { BUILDINGS } from "@/lib/taskSchema";
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
