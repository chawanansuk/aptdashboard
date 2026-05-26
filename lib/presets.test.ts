import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  loadPresets,
  savePresets,
  addPreset,
  removePreset,
  type FilterPreset,
} from "./presets";

const KEY = "filterPresets"; // mirrors the private constant

const draft = (over: Partial<Omit<FilterPreset, "id">> = {}): Omit<FilterPreset, "id"> => ({
  name: "สัปดาห์นี้ ตึก A", view: "tasks", building: "A",
  dateRange: "week", customStart: "", customEnd: "", search: "", ...over,
});

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("presets", () => {
  it("returns [] when nothing is stored", () => {
    expect(loadPresets()).toEqual([]);
  });

  it("addPreset persists and returns the created preset with a generated id", () => {
    const created = addPreset(draft());
    expect(created.id).toBeTruthy();
    expect(created.name).toBe("สัปดาห์นี้ ตึก A");
    const stored = loadPresets();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toEqual(created);
  });

  it("addPreset appends (keeps existing) and gives unique ids", () => {
    const a = addPreset(draft({ name: "A" }));
    const b = addPreset(draft({ name: "B" }));
    expect(a.id).not.toBe(b.id);
    expect(loadPresets().map((p) => p.name)).toEqual(["A", "B"]);
  });

  it("removePreset deletes only the matching id", () => {
    const a = addPreset(draft({ name: "A" }));
    const b = addPreset(draft({ name: "B" }));
    removePreset(a.id);
    const left = loadPresets();
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe(b.id);
  });

  it("removePreset is a no-op for an unknown id", () => {
    addPreset(draft());
    removePreset("does-not-exist");
    expect(loadPresets()).toHaveLength(1);
  });

  it("loadPresets tolerates malformed / non-array storage → []", () => {
    localStorage.setItem(KEY, "{not json");
    expect(loadPresets()).toEqual([]);
    localStorage.setItem(KEY, JSON.stringify({ not: "an array" }));
    expect(loadPresets()).toEqual([]);
  });

  it("savePresets round-trips an explicit list", () => {
    const list: FilterPreset[] = [{ ...draft(), id: "x1" }];
    savePresets(list);
    expect(loadPresets()).toEqual(list);
  });
});
