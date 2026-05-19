"use client";

import { useCallback, useEffect, useState } from "react";

export type RoomDensity = "compact" | "comfy" | "large";

const STORAGE_KEY = "aptdash:roomDensity";
const VALID: RoomDensity[] = ["compact", "comfy", "large"];

function isValid(v: string | null): v is RoomDensity {
  return v != null && (VALID as string[]).includes(v);
}

/**
 * Persist user's preferred room-grid cell size. Default = "comfy"
 * (matches the pre-toggle visual). Loads from localStorage after
 * mount so SSR doesn't flash an unexpected layout.
 */
export function useRoomDensity(): {
  density: RoomDensity;
  setDensity: (v: RoomDensity) => void;
} {
  const [density, setDensityState] = useState<RoomDensity>("comfy");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (isValid(raw)) setDensityState(raw);
    } catch { /* private mode — ignore */ }
  }, []);

  const setDensity = useCallback((v: RoomDensity) => {
    setDensityState(v);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, v);
    } catch { /* ignore */ }
  }, []);

  return { density, setDensity };
}

export const ROOM_DENSITY_VALUES = VALID;
