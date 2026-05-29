"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Recent + pinned room bookmarks (Problem #17), persisted to
 * localStorage. A room is identified by its "Building|Room" key — the
 * same composite the rest of the app uses.
 *
 *   - recent: auto-tracked, most-recent-first, capped at MAX_RECENT.
 *     Pushed every time a room detail modal opens.
 *   - pinned: manual, toggled from the star in the room modal header.
 *
 * Pure helpers (pushRecent / togglePinned) are exported separately so
 * the list logic is unit-testable without React/localStorage.
 */

const STORAGE_KEY = "aptdash:roomBookmarks:v1";
export const MAX_RECENT = 5;

export interface RoomBookmarks {
  recent: string[];
  pinned: string[];
}

const EMPTY: RoomBookmarks = { recent: [], pinned: [] };

export function roomBookmarkKey(building: string, room: string): string {
  return `${building}|${room}`;
}

/** Prepend key, dedupe, cap. Most-recent-first. */
export function pushRecent(recent: string[], key: string, max = MAX_RECENT): string[] {
  return [key, ...recent.filter((k) => k !== key)].slice(0, max);
}

/** Add if absent, remove if present. */
export function togglePinned(pinned: string[], key: string): string[] {
  return pinned.includes(key) ? pinned.filter((k) => k !== key) : [key, ...pinned];
}

function load(): RoomBookmarks {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    return {
      recent: Array.isArray(parsed?.recent) ? parsed.recent.filter((x: unknown) => typeof x === "string") : [],
      pinned: Array.isArray(parsed?.pinned) ? parsed.pinned.filter((x: unknown) => typeof x === "string") : [],
    };
  } catch {
    return EMPTY;
  }
}

export function useRoomBookmarks() {
  const [bookmarks, setBookmarks] = useState<RoomBookmarks>(EMPTY);

  // Load after mount so SSR markup matches the empty initial state.
  useEffect(() => {
    setBookmarks(load());
  }, []);

  const persist = useCallback((next: RoomBookmarks) => {
    setBookmarks(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch { /* private mode — ignore */ }
  }, []);

  const recordVisit = useCallback((key: string) => {
    setBookmarks((prev) => {
      const next = { ...prev, recent: pushRecent(prev.recent, key) };
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const togglePin = useCallback((key: string) => {
    setBookmarks((prev) => {
      const next = { ...prev, pinned: togglePinned(prev.pinned, key) };
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const isPinned = useCallback((key: string) => bookmarks.pinned.includes(key), [bookmarks.pinned]);

  return {
    recent: bookmarks.recent,
    pinned: bookmarks.pinned,
    recordVisit,
    togglePin,
    isPinned,
    persist,
  };
}
