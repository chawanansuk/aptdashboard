import type { Role } from "@/auth";
import type { RoomView } from "@/types";
import { canAccess, canPerform, type Route } from "@/lib/permissions";
import { STATUS_LABEL } from "@/lib/constants";
import { roomKey } from "@/lib/taskKey";

/** Minimal vehicle shape used for plate/model search in the palette. */
export interface VehicleHit {
  building: string;
  room: string;
  plate: string;
  model: string;
  color: string;
}

/**
 * Command palette search — pure functions, no React.
 *
 * The palette has three result groups:
 *   - room    : open RoomModal for a specific room
 *   - view    : navigate to a sidebar view
 *   - command : execute an arbitrary action (add task, toggle theme, ...)
 *
 * Results are ranked: exact > prefix > substring. Permissions are
 * applied here so the UI never has to think about role gating — every
 * result returned is something the user can actually act on.
 */

export type ActionType = "room" | "view" | "command";

export interface PaletteAction {
  type: ActionType;
  /** Stable id for React keying + selected state. */
  id: string;
  label: string;
  /** Secondary line under label (e.g. "ตึก Kl · ผู้เช่า สมชาย"). */
  hint?: string;
  /** Sort group prefix (rooms first, then views, then commands). */
  groupOrder: number;
  /** Computed rank against the query — lower = better. */
  rank: number;
}

function norm(s: string): string {
  return (s || "").toLowerCase().trim();
}

/** Return rank: 0 = exact, 1 = prefix, 2 = substring, -1 = no match. */
export function matchRank(haystack: string, needle: string): number {
  if (!needle) return 0; // empty query matches everything (lowest rank)
  const h = norm(haystack);
  const n = norm(needle);
  if (!h) return -1;
  if (h === n) return 0;
  if (h.startsWith(n)) return 1;
  if (h.includes(n)) return 2;
  return -1;
}

/** Pick best rank across multiple haystack fields. -1 if none match. */
function bestRank(fields: string[], needle: string): number {
  let best = -1;
  for (const f of fields) {
    const r = matchRank(f, needle);
    if (r === -1) continue;
    if (best === -1 || r < best) best = r;
  }
  return best;
}

/* ====================================================================
 * Room search
 * ==================================================================== */

/**
 * Search result with optional vehicle hit — when the room matched
 * via a vehicle plate/model, the matching vehicle is returned so
 * the UI can surface "🏍 ทะเบียน 1กข-1234" as a hint suffix.
 */
export interface RoomSearchResult {
  room: RoomView;
  rank: number;
  /** The vehicle that drove the match (only set when match came from a vehicle field). */
  matchedVehicle?: VehicleHit;
}

export function searchRooms(
  rooms: RoomView[],
  query: string,
  limit = 8,
  vehicles: VehicleHit[] = [],
): RoomSearchResult[] {
  // Index vehicles by building|room — multiple per room ok
  const vehiclesByRoom = new Map<string, VehicleHit[]>();
  for (const v of vehicles) {
    const k = roomKey(v.building, v.room);
    if (!vehiclesByRoom.has(k)) vehiclesByRoom.set(k, []);
    vehiclesByRoom.get(k)!.push(v);
  }

  const out: RoomSearchResult[] = [];
  // Phone-aware: strip non-digits from query so "081-234-5678"
  // and "0812345678" both match. Activated only when query has
  // at least 4 digits — short numeric queries (e.g. room "101")
  // shouldn't accidentally match phone substrings.
  const digitsOnlyQuery = query.replace(/\D+/g, "");

  for (const r of rooms) {
    // Standard room fields
    let baseRank = bestRank(
      [r.room, r.building, r.tenant, r.phone],
      query,
    );
    // Phone-aware fallback: when the query is mostly digits and
    // didn't match the raw phone, try the normalized form.
    if (baseRank === -1 && digitsOnlyQuery.length >= 4 && r.phone) {
      const phoneDigits = r.phone.replace(/\D+/g, "");
      if (phoneDigits) {
        if (phoneDigits === digitsOnlyQuery) baseRank = 0;
        else if (phoneDigits.startsWith(digitsOnlyQuery)) baseRank = 1;
        else if (phoneDigits.includes(digitsOnlyQuery)) baseRank = 2;
      }
    }

    // Then check vehicles for this room; capture best matching vehicle
    let bestVehicleRank = -1;
    let bestVehicle: VehicleHit | undefined;
    const vs = vehiclesByRoom.get(roomKey(r.building, r.room)) || [];
    for (const v of vs) {
      const rk = bestRank([v.plate, v.model, v.color], query);
      if (rk !== -1 && (bestVehicleRank === -1 || rk < bestVehicleRank)) {
        bestVehicleRank = rk;
        bestVehicle = v;
      }
    }

    // Pick the best rank between room fields and vehicle fields.
    // If a vehicle drove the better match, surface that as the hint.
    if (baseRank === -1 && bestVehicleRank === -1) continue;
    const useVehicle =
      baseRank === -1 ||
      (bestVehicleRank !== -1 && bestVehicleRank < baseRank);
    const finalRank = useVehicle ? bestVehicleRank : baseRank;
    out.push({
      room: r,
      rank: finalRank,
      matchedVehicle: useVehicle ? bestVehicle : undefined,
    });
  }
  out.sort((a, b) => a.rank - b.rank || a.room.building.localeCompare(b.room.building) || a.room.room.localeCompare(b.room.room, undefined, { numeric: true }));
  return out.slice(0, limit);
}

/* ====================================================================
 * View navigation
 * ==================================================================== */

interface ViewDef {
  route: Route;
  label: string;
  hint?: string;
}

const VIEW_CATALOG: ViewDef[] = [
  { route: "overview",    label: "ภาพรวม",        hint: "หน้าหลัก / Dashboard" },
  { route: "today",       label: "งานวันนี้",      hint: "งานที่นัดวันนี้" },
  { route: "calendar",    label: "ปฏิทิน",         hint: "ตารางงานรายเดือน" },
  { route: "ready",       label: "ห้องว่าง",        hint: STATUS_LABEL.ready },
  { route: "pending",     label: "ห้องรอสัญญา",    hint: STATUS_LABEL.pending },
  { route: "occupied",    label: "ห้องมีผู้เช่า",    hint: STATUS_LABEL.occupied },
  { route: "moveout",     label: "แจ้งย้ายออก",    hint: STATUS_LABEL.moveout },
  { route: "qc",          label: "งานทำสะอาด/QC",  hint: STATUS_LABEL.qc },
  { route: "repair",      label: "งานซ่อม",        hint: STATUS_LABEL.repair },
  { route: "inactive",    label: "ห้องไม่ใช้งาน",   hint: STATUS_LABEL.inactive },
  { route: "tenants",     label: "ผู้เช่า",         hint: "รายการผู้เช่า + สัญญาหมด" },
  { route: "maintenance", label: "ซ่อมบำรุง",       hint: "🔔 ถึงรอบ / ส่วนกลาง / อุปกรณ์ในห้อง / งานประจำ" },
  { route: "facilities",  label: "ซ่อมบำรุง · ส่วนกลาง", hint: "ล้างแอร์ / ปั๊มน้ำ / ส่วนกลาง" },
  { route: "recurring",   label: "ซ่อมบำรุง · งานประจำ", hint: "งานสร้างอัตโนมัติตามรอบ" },
  { route: "income",      label: "รายได้",         hint: "สรุปรายได้รายเดือน" },
];

export function searchViews(
  roles: Role[] | undefined,
  query: string
): Array<{ def: ViewDef; rank: number }> {
  const out: Array<{ def: ViewDef; rank: number }> = [];
  for (const def of VIEW_CATALOG) {
    if (!canAccess(roles, def.route)) continue;
    const rank = bestRank([def.label, def.route, def.hint || ""], query);
    if (rank !== -1) out.push({ def, rank });
  }
  out.sort((a, b) => a.rank - b.rank || a.def.label.localeCompare(b.def.label));
  return out;
}

/* ====================================================================
 * Commands (actions that aren't navigation)
 * ==================================================================== */

export interface CommandDef {
  id: string;
  label: string;
  hint?: string;
  /** Optional permission gate — if set, command hidden unless user can. */
  requires?: { route?: Route; action?: import("@/lib/permissions").Action };
  run: () => void;
}

export function searchCommands(
  roles: Role[] | undefined,
  commands: CommandDef[],
  query: string
): Array<{ cmd: CommandDef; rank: number }> {
  const out: Array<{ cmd: CommandDef; rank: number }> = [];
  for (const cmd of commands) {
    if (cmd.requires?.route && !canAccess(roles, cmd.requires.route)) continue;
    if (cmd.requires?.action && !canPerform(roles, cmd.requires.action)) continue;
    const rank = bestRank([cmd.label, cmd.id, cmd.hint || ""], query);
    if (rank !== -1) out.push({ cmd, rank });
  }
  out.sort((a, b) => a.rank - b.rank || a.cmd.label.localeCompare(b.cmd.label));
  return out;
}

/* ====================================================================
 * Build final flat action list for the palette UI.
 * groupOrder: 0 = rooms, 1 = views, 2 = commands
 * ==================================================================== */

export function buildActions(params: {
  rooms: RoomView[];
  roles: Role[] | undefined;
  commands: CommandDef[];
  query: string;
  /** Optional vehicle list — when present, plate/model are searchable
   *  alongside room fields. The UI fetches this lazily on palette open. */
  vehicles?: VehicleHit[];
}): PaletteAction[] {
  const { rooms, roles, commands, query, vehicles = [] } = params;

  const roomHits = searchRooms(rooms, query, 8, vehicles);
  const viewHits = searchViews(roles, query);
  const cmdHits  = searchCommands(roles, commands, query);

  const actions: PaletteAction[] = [];

  for (const { room: r, rank, matchedVehicle } of roomHits) {
    // When the match came from a vehicle plate/model, lead the hint
    // with that so the user immediately sees why their query landed
    // on this room. Otherwise use the standard status/tenant hint.
    const hint = matchedVehicle
      ? [
          `🏍 ${matchedVehicle.plate}`,
          matchedVehicle.model || null,
          STATUS_LABEL[r.status],
          r.tenant && `ผู้เช่า ${r.tenant}`,
        ].filter(Boolean).join(" · ")
      : [
          STATUS_LABEL[r.status],
          r.tenant && `ผู้เช่า ${r.tenant}`,
          r.phone && r.phone,
        ].filter(Boolean).join(" · ");

    actions.push({
      type: "room",
      id: `room:${r.building}:${r.room}`,
      // Detailed label: "ห้อง 201 · มั่งมี · ชั้น 2" so the user can
      // distinguish room 201 across all 5 buildings at a glance instead
      // of seeing "มั่งมี 201" / "มายทรี48 201" rows that look similar.
      label: `ห้อง ${r.room} · ${r.building}${r.floor ? ` · ชั้น ${r.floor}` : ""}`,
      hint,
      groupOrder: 0,
      rank,
    });
  }

  for (const { def, rank } of viewHits) {
    actions.push({
      type: "view",
      id: `view:${def.route}`,
      label: def.label,
      hint: def.hint,
      groupOrder: 1,
      rank,
    });
  }

  for (const { cmd, rank } of cmdHits) {
    actions.push({
      type: "command",
      id: `cmd:${cmd.id}`,
      label: cmd.label,
      hint: cmd.hint,
      groupOrder: 2,
      rank,
    });
  }

  // Stable: group order, then rank within group, then alpha
  actions.sort((a, b) =>
    a.groupOrder - b.groupOrder ||
    a.rank - b.rank ||
    a.label.localeCompare(b.label)
  );

  // Return a flat list — UI separates groups by groupOrder.
  // Runners are attached by the caller, looking up by action id.
  return actions;
}
