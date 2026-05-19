import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { parseRoomsCSV } from "@/lib/parseSheet";
import {
  endRoomsRevalidation,
  getRoomsCacheState,
  setRoomsCache,
  tryBeginRoomsRevalidation,
} from "@/lib/dashboardCache";
import type { RoomRow } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/rooms — slice endpoint for room data.
 *
 * Phase 2 split: the legacy /api/dashboard waited for BOTH rooms (fast,
 * CSV ~500ms) AND tasks (slow, Apps Script 2-15s) before responding.
 * This endpoint serves rooms independently so the client can render the
 * room grid as soon as CSV finishes, without waiting on Apps Script.
 *
 * SWR semantics inherited from lib/dashboardCache (independent rooms slot).
 */

async function fetchRooms(): Promise<RoomRow[]> {
  const url = process.env.NEXT_PUBLIC_SHEET_ROOMS_CSV_URL;
  if (!url) throw new Error("ยังไม่ได้ตั้งค่า NEXT_PUBLIC_SHEET_ROOMS_CSV_URL");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const csv = await res.text();
  return parseRoomsCSV(csv);
}

function scheduleRevalidate(): void {
  if (!tryBeginRoomsRevalidation()) return;
  (async () => {
    const start = Date.now();
    try {
      const rooms = await fetchRooms();
      setRoomsCache(rooms);
      console.info("[dashboard/rooms] revalidate ok", { ms: Date.now() - start });
    } catch (e) {
      console.warn("[dashboard/rooms] revalidate failed (keeping prev cache)", e);
    } finally {
      endRoomsRevalidation();
    }
  })();
}

function timing(name: string, ms: number, desc?: string): string {
  const d = desc ? `;desc="${desc.replace(/"/g, "'")}"` : "";
  return `${name}${d};dur=${ms.toFixed(0)}`;
}

export async function GET() {
  const handlerStart = Date.now();
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const authMs = Date.now() - handlerStart;

  const c = getRoomsCacheState();

  if (c.state === "fresh" && c.data) {
    const totalMs = Date.now() - handlerStart;
    console.info("[dashboard/rooms] fresh", { ageMs: c.ageMs, totalMs });
    return NextResponse.json(
      { rooms: c.data, cached: true, cacheState: "fresh", ageMs: c.ageMs },
      {
        headers: {
          "Server-Timing": [
            timing("auth", authMs),
            timing("cache", 0, "fresh hit"),
            timing("total", totalMs),
          ].join(", "),
        },
      },
    );
  }

  if (c.state === "stale" && c.data) {
    scheduleRevalidate();
    const totalMs = Date.now() - handlerStart;
    console.info("[dashboard/rooms] stale + bg revalidate", { ageMs: c.ageMs, totalMs });
    return NextResponse.json(
      { rooms: c.data, cached: true, cacheState: "stale", ageMs: c.ageMs },
      {
        headers: {
          "Server-Timing": [
            timing("auth", authMs),
            timing("cache", 0, "stale hit"),
            timing("total", totalMs),
          ].join(", "),
        },
      },
    );
  }

  // Missing — block on upstream
  const fetchStart = Date.now();
  try {
    const rooms = await fetchRooms();
    setRoomsCache(rooms);
    const fetchMs = Date.now() - fetchStart;
    const totalMs = Date.now() - handlerStart;
    console.info("[dashboard/rooms] miss → fetched", { fetchMs, totalMs });
    return NextResponse.json(
      { rooms, cached: false, cacheState: "missing" },
      {
        headers: {
          "Server-Timing": [
            timing("auth", authMs),
            timing("rooms", fetchMs),
            timing("total", totalMs),
          ].join(", "),
        },
      },
    );
  } catch (e) {
    const error = e instanceof Error ? e.message : "unknown";
    const totalMs = Date.now() - handlerStart;
    console.error("[dashboard/rooms] miss fetch failed", { error, totalMs });
    return NextResponse.json(
      { rooms: [], cached: false, cacheState: "missing", error },
      {
        status: 502,
        headers: {
          "Server-Timing": [
            timing("auth", authMs),
            timing("rooms", Date.now() - fetchStart, `error: ${error}`),
            timing("total", totalMs),
          ].join(", "),
        },
      },
    );
  }
}
