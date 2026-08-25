import { describe, expect, it } from "vitest";
import { buildSearch, pageTitle, parseUrlState, roomKey, splitRoomKey, VIEW_TITLES } from "./urlState";
import { VALID_VIEWS } from "./useViewRouting";

describe("parseUrlState / buildSearch", () => {
  it("round-trips view + building + room (Thai values)", () => {
    const search = buildSearch({ view: "tenants", building: "มีทอง", room: "มีทอง:101" });
    expect(parseUrlState(search)).toEqual({ view: "tenants", building: "มีทอง", room: "มีทอง:101" });
  });

  it("omits defaults: building ทั้งหมด and closed room", () => {
    expect(buildSearch({ view: "overview", building: "ทั้งหมด", room: null })).toBe("?view=overview");
  });

  it("parses an empty / foreign query gracefully", () => {
    expect(parseUrlState("")).toEqual({});
    expect(parseUrlState("?utm_source=line")).toEqual({});
  });

  it("rejects a room param without the ':' separator", () => {
    expect(parseUrlState("?room=101").room).toBeUndefined();
  });
});

describe("roomKey / splitRoomKey", () => {
  it("round-trips and survives a room name containing ':' after the first", () => {
    expect(splitRoomKey(roomKey("มีทอง", "101"))).toEqual({ building: "มีทอง", room: "101" });
    expect(splitRoomKey("A:1:2")).toEqual({ building: "A", room: "1:2" });
  });
  it("returns null for malformed keys", () => {
    expect(splitRoomKey("no-colon")).toBeNull();
    expect(splitRoomKey(":101")).toBeNull();
    expect(splitRoomKey("มีทอง:")).toBeNull();
  });
});

describe("pageTitle + VIEW_TITLES", () => {
  it("every routable view has a Thai title (new views must add one)", () => {
    for (const v of VALID_VIEWS) {
      expect(VIEW_TITLES[v], `missing title for view "${v}"`).toBeTruthy();
    }
  });
  it("formats title with and without a building filter", () => {
    expect(pageTitle("tenants")).toBe("ผู้เช่า · APARTCLOUD");
    expect(pageTitle("tenants", "มีทอง")).toBe("ผู้เช่า · มีทอง · APARTCLOUD");
    expect(pageTitle("tenants", "ทั้งหมด")).toBe("ผู้เช่า · APARTCLOUD");
    expect(pageTitle("unknown-view")).toBe("APARTCLOUD");
  });
});
