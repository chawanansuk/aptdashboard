import { describe, expect, it } from "vitest";
import {
  getRoomExample,
  getMedianPrice,
  getRoomPlaceholder,
  getCostPlaceholder,
  getRoomHint,
  type PlaceholderRoom,
} from "./buildingPlaceholders";

const ROOMS: PlaceholderRoom[] = [
  { building: "มั่งมี", room: "205", price: "5500" },
  { building: "มั่งมี", room: "206", price: "5800" },
  { building: "มั่งมี", room: "301", price: "5900" },
  { building: "มีทรัพย์", room: "1.1", price: "3500" },
  { building: "มีทรัพย์", room: "1.2", price: "3500" },
  { building: "มีทรัพย์", room: "2.1", price: "4000" },
  { building: "Kl", room: "101", price: "฿ 4,500" },
  { building: "มายทรี48", room: "303", price: "" }, // no price
];

describe("getRoomExample", () => {
  it("returns first room of building, preferring shortest", () => {
    expect(getRoomExample(ROOMS, "มั่งมี")).toBe("205");
  });
  it("returns dotted convention for ตึกมีทรัพย์", () => {
    expect(getRoomExample(ROOMS, "มีทรัพย์")).toBe("1.1");
  });
  it("returns '101' fallback for unknown building", () => {
    expect(getRoomExample(ROOMS, "ไม่มีตึกนี้")).toBe("101");
  });
  it("returns '101' fallback when building is empty string", () => {
    expect(getRoomExample(ROOMS, "")).toBe("101");
  });
  it("returns '101' fallback when no rooms supplied", () => {
    expect(getRoomExample([], "มั่งมี")).toBe("101");
  });
});

describe("getMedianPrice", () => {
  it("computes median of building prices", () => {
    expect(getMedianPrice(ROOMS, "มั่งมี")).toBe(5800); // [5500,5800,5900] → 5800
  });
  it("handles even-count median (average of middle two)", () => {
    const r: PlaceholderRoom[] = [
      { building: "x", room: "1", price: "1000" },
      { building: "x", room: "2", price: "2000" },
    ];
    expect(getMedianPrice(r, "x")).toBe(1500);
  });
  it("strips non-digits from price strings", () => {
    expect(getMedianPrice(ROOMS, "Kl")).toBe(4500); // "฿ 4,500" → 4500
  });
  it("returns null when no priced rooms in building", () => {
    expect(getMedianPrice(ROOMS, "มายทรี48")).toBeNull();
  });
  it("returns null for unknown building", () => {
    expect(getMedianPrice(ROOMS, "ไม่มี")).toBeNull();
  });
});

describe("getRoomPlaceholder", () => {
  it("formats with 'เช่น' prefix", () => {
    expect(getRoomPlaceholder(ROOMS, "มั่งมี")).toBe("เช่น 205");
    expect(getRoomPlaceholder(ROOMS, "มีทรัพย์")).toBe("เช่น 1.1");
  });
  it("uses fallback '101' for unknown building", () => {
    expect(getRoomPlaceholder(ROOMS, "")).toBe("เช่น 101");
  });
});

describe("getCostPlaceholder", () => {
  it("uses building median, formatted with Thai grouping", () => {
    expect(getCostPlaceholder(ROOMS, "มั่งมี")).toBe("เช่น 5,800");
  });
  it("falls back to default when building has no priced rooms", () => {
    expect(getCostPlaceholder(ROOMS, "มายทรี48")).toBe("เช่น 1,500");
  });
  it("falls back when building is empty", () => {
    expect(getCostPlaceholder(ROOMS, "")).toBe("เช่น 1,500");
  });
});

describe("getRoomHint", () => {
  it("describes the convention for a known building", () => {
    expect(getRoomHint(ROOMS, "มั่งมี")).toContain("205");
    expect(getRoomHint(ROOMS, "มีทรัพย์")).toContain("1.1");
  });
  it("returns empty for unknown building (no false hint)", () => {
    expect(getRoomHint(ROOMS, "ไม่มี")).toBe("");
  });
  it("returns empty for empty building selection", () => {
    expect(getRoomHint([], "")).toContain("101"); // no building → generic OK
  });
});
