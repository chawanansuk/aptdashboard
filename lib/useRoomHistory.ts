"use client";

import { useEffect, useMemo, useState } from "react";
import type { RoomView, SheetRow } from "@/types";
import { isClosedStatus } from "@/lib/constants";
import { parseThaiDate } from "@/lib/dateUtils";

/**
 * Full per-room task history (v3.22).
 *
 * The dashboard feed is windowed server-side (open + last 120 days), so
 * `room.pastTasks` no longer reaches all the way back. This hook lazily
 * fetches the room's COMPLETE history from /api/room-tasks when the
 * RoomModal opens and returns it bucketed like the feed's pastTasks
 * (closed any age, or dated before today; newest first).
 *
 * Fallbacks, in order:
 *   - request in flight / failed / old backend → null (caller keeps
 *     using room.pastTasks — same view as before this feature)
 */
export function useRoomHistory(building: string, room: string): SheetRow[] | null {
  const [rows, setRows] = useState<SheetRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    const qs = new URLSearchParams({ building, room });
    fetch(`/api/room-tasks?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { ok?: boolean; rows?: SheetRow[] }) => {
        if (cancelled) return;
        if (data?.ok && Array.isArray(data.rows)) setRows(data.rows);
      })
      .catch(() => {
        /* keep null — caller falls back to the windowed feed */
      });
    return () => {
      cancelled = true;
    };
  }, [building, room]);

  return useMemo(() => {
    if (!rows) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const t0 = today.getTime();
    return rows
      .filter((t) => {
        if (isClosedStatus(t.status)) return true;
        const d = parseThaiDate(t.date);
        return d ? d.setHours(0, 0, 0, 0) < t0 : false;
      })
      .sort((a, b) => {
        const da = parseThaiDate(a.date)?.getTime() ?? 0;
        const db = parseThaiDate(b.date)?.getTime() ?? 0;
        return db - da;
      });
  }, [rows]);
}

/** The RoomModal's display list: full server history when available,
 *  otherwise the (possibly windowed) feed buckets. */
export function fullPastTasks(room: RoomView, serverHistory: SheetRow[] | null): SheetRow[] {
  if (serverHistory && serverHistory.length >= room.pastTasks.length) return serverHistory;
  return room.pastTasks;
}
