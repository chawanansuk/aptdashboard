import { describe, expect, it } from "vitest";
import { pushRecent, togglePinned, roomBookmarkKey, MAX_RECENT } from "./useRoomBookmarks";

describe("roomBookmarkKey", () => {
  it("joins building + room with a pipe", () => {
    expect(roomBookmarkKey("มีทอง", "301")).toBe("มีทอง|301");
  });
});

describe("pushRecent", () => {
  it("prepends a new key, most-recent-first", () => {
    expect(pushRecent(["a", "b"], "c")).toEqual(["c", "a", "b"]);
  });

  it("dedupes — re-visiting moves the key to the front", () => {
    expect(pushRecent(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
  });

  it("caps at MAX_RECENT, dropping the oldest", () => {
    const five = ["a", "b", "c", "d", "e"];
    const out = pushRecent(five, "f");
    expect(out).toHaveLength(MAX_RECENT);
    expect(out[0]).toBe("f");
    expect(out).not.toContain("e"); // oldest evicted
  });

  it("does not grow when re-visiting an already-present key", () => {
    const five = ["a", "b", "c", "d", "e"];
    expect(pushRecent(five, "a")).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("togglePinned", () => {
  it("adds a key when absent (front)", () => {
    expect(togglePinned(["a"], "b")).toEqual(["b", "a"]);
  });

  it("removes a key when already present", () => {
    expect(togglePinned(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("round-trips to the original membership", () => {
    const once = togglePinned([], "x");
    expect(once).toEqual(["x"]);
    expect(togglePinned(once, "x")).toEqual([]);
  });
});
