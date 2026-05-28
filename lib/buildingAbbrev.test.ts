import { describe, expect, it } from "vitest";
import { abbreviateBuilding } from "./buildingAbbrev";

describe("abbreviateBuilding", () => {
  it("returns the curated abbrev for the 5 known buildings", () => {
    expect(abbreviateBuilding("Kl")).toBe("KL");
    expect(abbreviateBuilding("มั่งมี")).toBe("มม");
    expect(abbreviateBuilding("มายทรี48")).toBe("มย");
    expect(abbreviateBuilding("มีทรัพย์")).toBe("มร");
    expect(abbreviateBuilding("มีทอง")).toBe("มท");
  });

  it("disambiguates names that would otherwise collide", () => {
    // Naive first-two-chars would map both มีทอง and มีทรัพย์ to "มี".
    expect(abbreviateBuilding("มีทอง")).not.toBe(abbreviateBuilding("มีทรัพย์"));
    // Same with มายทรี vs มั่งมี.
    expect(abbreviateBuilding("มายทรี")).not.toBe(abbreviateBuilding("มั่งมี"));
  });

  it("falls back to the first two characters for unknown names", () => {
    expect(abbreviateBuilding("ปทุมรัตน์")).toBe("ปท");
  });

  it("handles empty + whitespace input without crashing", () => {
    expect(abbreviateBuilding("")).toBe("");
    expect(abbreviateBuilding("   ")).toBe("");
  });
});
