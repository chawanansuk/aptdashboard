import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { appsScriptCall } from "@/lib/appsScriptFetch";
import {
  endTasksRevalidation,
  getTasksCacheState,
  setTasksCache,
  tryBeginTasksRevalidation,
} from "@/lib/dashboardCache";
import type { SheetRow } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/tasks — slice endpoint for task data.
 *
 * Phase 2 split: this is the slow upstream source (Apps Script).
 * Decoupling it from rooms means the client can render rooms first
 * and stream tasks in when ready, so LCP isn't gated by Apps Script.
 *
 * SWR semantics inherited from lib/dashboardCache (independent tasks slot).
 */

async function fetchTasks(): Promise<SheetRow[]> {
  const j = await appsScriptCall<{ rows?: SheetRow[] }>(
    "getTasks", {}, { idempotent: true }
  );
  if (!j.ok) throw new Error(j.error || "backend error");
  return (j.result?.rows || []) as SheetRow[];
}

function scheduleRevalidate(): void {
  if (!tryBeginTasksRevalidation()) return;
  (async () => {
    const start = Date.now();
    try {
      const tasks = await fetchTasks();
      setTasksCache(tasks);
      console.info("[dashboard/tasks] revalidate ok", { ms: Date.now() - start });
    } catch (e) {
      console.warn("[dashboard/tasks] revalidate failed (keeping prev cache)", e);
    } finally {
      endTasksRevalidation();
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

  const c = getTasksCacheState();

  if (c.state === "fresh" && c.data) {
    const totalMs = Date.now() - handlerStart;
    console.info("[dashboard/tasks] fresh", { ageMs: c.ageMs, totalMs });
    return NextResponse.json(
      { tasks: c.data, cached: true, cacheState: "fresh", ageMs: c.ageMs },
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
    console.info("[dashboard/tasks] stale + bg revalidate", { ageMs: c.ageMs, totalMs });
    return NextResponse.json(
      { tasks: c.data, cached: true, cacheState: "stale", ageMs: c.ageMs },
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
    const tasks = await fetchTasks();
    setTasksCache(tasks);
    const fetchMs = Date.now() - fetchStart;
    const totalMs = Date.now() - handlerStart;
    console.info("[dashboard/tasks] miss → fetched", { fetchMs, totalMs });
    return NextResponse.json(
      { tasks, cached: false, cacheState: "missing" },
      {
        headers: {
          "Server-Timing": [
            timing("auth", authMs),
            timing("tasks", fetchMs),
            timing("total", totalMs),
          ].join(", "),
        },
      },
    );
  } catch (e) {
    const error = e instanceof Error ? e.message : "unknown";
    const totalMs = Date.now() - handlerStart;
    console.error("[dashboard/tasks] miss fetch failed", { error, totalMs });
    return NextResponse.json(
      { tasks: [], cached: false, cacheState: "missing", error },
      {
        status: 502,
        headers: {
          "Server-Timing": [
            timing("auth", authMs),
            timing("tasks", Date.now() - fetchStart, `error: ${error}`),
            timing("total", totalMs),
          ].join(", "),
        },
      },
    );
  }
}
