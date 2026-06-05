import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { appsScriptCall, AppsScriptError } from "@/lib/appsScriptFetch";
import { SwrSlot, serveCachedRows } from "@/lib/serverSwr";
import type { Vehicle } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-side SWR slot for the cross-room vehicle list. Invalidated on
// every add / update / delete write.
const vehicleSlot = new SwrSlot<Vehicle[]>();

async function fetchVehicles(): Promise<Vehicle[]> {
  const json = await appsScriptCall<{ rows?: Vehicle[] }>(
    "getVehicles", {}, { idempotent: true },
  );
  if (!json.ok) throw new Error(json.error || "backend error");
  return (json.result?.rows || []) as Vehicle[];
}

/**
 * Per-room vehicle tracking (v3.13.0).
 *
 * GET  /api/vehicles → { rows: Vehicle[] }
 * POST /api/vehicles { action: "add" | "update" | "delete", ...fields }
 *
 * Permissions: any authenticated user can view + write. Vehicle data
 * is room-scoped operational info, not tenant PII — sales, engineer,
 * and management all need it for day-to-day visibility (who parked
 * the bike vs. unknown plate, etc.). If a future privacy requirement
 * narrows this, gate via `canPerform` here.
 *
 * Server stamps `creator` from session.user.email on writes.
 */

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  return serveCachedRows(vehicleSlot, fetchVehicles, "ดึงข้อมูลยานพาหนะไม่สำเร็จ", { req, etagTag: "vehicles" });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("invalid JSON");
  }

  const action = String(body.action || "").trim();
  if (action !== "add" && action !== "update" && action !== "delete") {
    return bad("action ต้องเป็น 'add', 'update' หรือ 'delete'");
  }

  let upstreamAction: string;
  if (action === "add") {
    const building = String(body.building || "").trim();
    const room = String(body.room || "").trim();
    const plate = String(body.plate || "").trim();
    if (!building) return bad("building required");
    if (!room) return bad("room required");
    if (!plate) return bad("plate required");
    body.building = building;
    body.room = room;
    body.plate = plate;
    upstreamAction = "addVehicle";
  } else if (action === "update") {
    const id = String(body.id || "").trim();
    if (!id) return bad("id required for update");
    body.id = id;
    upstreamAction = "updateVehicle";
  } else {
    const id = String(body.id || "").trim();
    if (!id) return bad("id required for delete");
    body.id = id;
    upstreamAction = "deleteVehicle";
  }

  body.creator = session.user.email;

  try {
    const json = await appsScriptCall(upstreamAction, body);
    vehicleSlot.invalidate(); // next GET refetches the just-written data
    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = e instanceof AppsScriptError ? e.status : 502;
    return bad(`บันทึกยานพาหนะไม่สำเร็จ: ${msg}`, status);
  }
}
