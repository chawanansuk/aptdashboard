import { describe, expect, it } from "vitest";
import { sameRowArray } from "./sameArray";

describe("sameRowArray", () => {
  it("returns true for the same reference (cheap path)", () => {
    const a = [{ x: 1 }];
    expect(sameRowArray(a, a)).toBe(true);
  });

  it("returns true for structurally identical rows", () => {
    expect(
      sameRowArray(
        [{ id: "a", name: "Kl 101" }, { id: "b", name: "Kl 102" }],
        [{ id: "a", name: "Kl 101" }, { id: "b", name: "Kl 102" }],
      ),
    ).toBe(true);
  });

  it("returns false when length differs", () => {
    expect(sameRowArray([{ x: 1 }], [{ x: 1 }, { x: 2 }])).toBe(false);
  });

  it("returns false when any field on any row differs", () => {
    expect(
      sameRowArray(
        [{ id: "a", status: "ready" }],
        [{ id: "a", status: "occupied" }],
      ),
    ).toBe(false);
  });

  it("returns false when a row has different keys (shape change)", () => {
    expect(
      sameRowArray(
        [{ id: "a", status: "ready" }],
        [{ id: "a", status: "ready", extra: 1 }],
      ),
    ).toBe(false);
  });

  it("handles empty arrays as equal", () => {
    expect(sameRowArray([], [])).toBe(true);
  });

  it("treats different array instances with same content as equal (the case this exists for)", () => {
    const a = [{ id: "a", status: "ready" }];
    const b = [{ id: "a", status: "ready" }]; // new array, new row obj, same shape
    expect(a).not.toBe(b); // sanity — different references
    expect(sameRowArray(a, b)).toBe(true);
  });
});
