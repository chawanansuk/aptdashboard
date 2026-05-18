import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { parseRoomsCSV } from "@/lib/parseSheet";
import { getDashboardCache, setDashboardCache } from "@/lib/dashboardCache";
import { appsScriptCall } from "@/lib/appsScriptFetch";
import type { RoomRow, SheetRow } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fetchRooms(): Promise<RoomRow[]> {
  const url = process.env.NEXT_PUBLIC_SHEET_ROOMS_CSV_URL;
  if (!url) throw new Error("ยังไม่ได้ตั้งค่า NEXT_PUBLIC_SHEET_ROOMS_CSV_URL");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const csv = await res.text();
  return parseRoomsCSV(csv);
}

async function fetchTasks(): Promise<SheetRow[]> {
  const j = await appsScriptCall<{ rows?: SheetRow[] }>(
    "getTasks", {}, { idempotent: true }
  );
  if (!j.ok) throw new Error(j.error || "backend error");
  return (j.result?.rows || []) as SheetRow[];
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Cache hit — serve last known good
  const cached = getDashboardCache();
  if (cached) {
    return NextResponse.json({
      rooms: cached.rooms,
      tasks: cached.tasks,
      cached: true,
      ageMs: Date.now() - cached.savedAt,
    });
  }

  // Cache miss — fetch both upstream sources in parallel
  const [roomsResult, tasksResult] = await Promise.allSettled([
    fetchRooms(),
    fetchTasks(),
  ]);

  const errors: string[] = [];
  let rooms: RoomRow[] = [];
  let tasks: SheetRow[] = [];

  if (roomsResult.status === "fulfilled") {
    rooms = roomsResult.value;
  } else {
    const m = roomsResult.reason instanceof Error ? roomsResult.reason.message : "unknown";
    errors.push("rooms: " + m);
  }

  if (tasksResult.status === "fulfilled") {
    tasks = tasksResult.value;
  } else {
    const m = tasksResult.reason instanceof Error ? tasksResult.reason.message : "unknown";
    errors.push("tasks: " + m);
  }

  // Only cache when both upstream calls succeeded — partial data poisons the cache
  if (errors.length === 0) {
    setDashboardCache(rooms, tasks);
  }

  return NextResponse.json({
    rooms,
    tasks,
    cached: false,
    errors: errors.length ? errors : undefined,
  });
}
