"use client";

const KEY = "filterPresets";

export interface FilterPreset {
  id: string;
  name: string;
  view: string;
  building: string;
  dateRange: string;
  customStart: string;
  customEnd: string;
  search: string;
}

export function loadPresets(): FilterPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePresets(list: FilterPreset[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function addPreset(p: Omit<FilterPreset, "id">): FilterPreset {
  const list = loadPresets();
  const created: FilterPreset = { ...p, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
  list.push(created);
  savePresets(list);
  return created;
}

export function removePreset(id: string): void {
  savePresets(loadPresets().filter((p) => p.id !== id));
}
