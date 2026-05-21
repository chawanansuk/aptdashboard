"use client";

import { useMemo } from "react";
import type { RoomView, SheetRow } from "@/types";
import { STATUS_DOT } from "@/lib/constants";
import { Icon } from "@/lib/icons";
import { parseThaiDate } from "@/lib/dateUtils";
import { isDoneStatus, isCancelledStatus } from "@/lib/constants";

interface Props {
  rooms: RoomView[];
  tasks: SheetRow[];
  activeBuilding: string;
  onSelectRoom: (r: RoomView) => void;
  onQuickAddLead: () => void;
}

/**
 * Sales Pipeline — Sales role's home view. Replaces the bland tenants list
 * with the three things a sales person actually works with daily:
 *
 *   🏠 ห้องว่างพร้อมขาย      — supply
 *   📅 นัดหมายข้างหน้า        — pipeline (viewings + move-ins, future-dated)
 *   🚪 รอย้ายออก             — re-sell pipeline (rooms with notice given)
 *
 * Why not "สัญญาใกล้หมด": at this property contracts auto-renew until
 * the tenant gives notice, so contractEnd is left blank in the source
 * sheet. The actionable signal is the moveout status — those rooms
 * become available stock soon and sales should pre-list them.
 *
 * Top KPI strip summarises the three counts so the user can scan in 1s.
 */

// All sales-relevant task types — ชมห้อง (viewing), ย้ายเข้า (move-in),
// ย้ายออก (move-out date confirmed). Previously excluded ย้ายออก so the
// "นัดสัปดาห์นี้" KPI didn't count actual move-out dates that sales
// needs on the calendar (Task 23). Exported for unit testing.
export const SALES_TASK_TYPES = new Set(["ชมห้อง", "ย้ายเข้า", "ย้ายออก"]);

/**
 * Count items in `items` whose `.date` falls within [from, from+days+1) —
 * inclusive of the last day. Pure for testability.
 */
export function countAppointmentsWithinDays(
  items: { date: Date }[],
  days: number,
  from: Date = new Date(),
): number {
  const startOfFrom = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const cutoff = new Date(startOfFrom.getFullYear(), startOfFrom.getMonth(), startOfFrom.getDate() + days + 1);
  return items.filter(
    (a) => a.date.getTime() >= startOfFrom.getTime() && a.date.getTime() < cutoff.getTime(),
  ).length;
}

/**
 * Preferred building order for grouped views (matches the sales team's
 * mental model). Buildings not in this list fall to the end alphabetically
 * so newly-added buildings don't disappear from the UI.
 */
const BUILDING_ORDER = ["Kl", "มั่งมี", "มายทรี48", "มีทรัพย์", "มีทอง"];

/**
 * Visual identity color per building. Maps to a `data-bcolor` attribute on
 * the section header so CSS can swap the gradient bar + count-pill tint
 * without inline styles. Unknown buildings fall to "slate" (neutral).
 */
type BuildingColor = "orange" | "purple" | "green" | "blue" | "amber" | "slate";
function buildingColor(name: string): BuildingColor {
  switch (name) {
    case "Kl":         return "orange";
    case "มั่งมี":      return "purple";
    case "มายทรี48":    return "green";
    case "มีทรัพย์":    return "blue";
    case "มีทอง":       return "amber";
    default:            return "slate";
  }
}

function buildingSortIndex(name: string): number {
  const i = BUILDING_ORDER.indexOf(name);
  return i === -1 ? BUILDING_ORDER.length : i;
}

/** Floor sort: numeric first ("1","2","10"), strings to end. */
function floorSortKey(s: string): [number, string] {
  const n = parseInt(s, 10);
  if (Number.isFinite(n)) return [n, ""];
  return [Number.MAX_SAFE_INTEGER, s];
}

interface Appointment {
  task: SheetRow;
  date: Date;
}

export default function SalesPipelineView({
  rooms, tasks, activeBuilding, onSelectRoom, onQuickAddLead,
}: Props) {
  // Scope by active building once — every section uses the same scope.
  const scopedRooms = useMemo(
    () => activeBuilding === "ทั้งหมด"
      ? rooms
      : rooms.filter((r) => r.building === activeBuilding),
    [rooms, activeBuilding],
  );

  // Vacant ("ready") rooms — sort by building then room for stable display
  const vacantRooms = useMemo(
    () => scopedRooms
      .filter((r) => r.status === "ready")
      .sort((a, b) => a.building.localeCompare(b.building) || a.room.localeCompare(b.room)),
    [scopedRooms],
  );

  // Group vacant rooms by building → floor → rooms, ordered per business
  // preference. Buildings/floors with no vacant rooms are dropped so the
  // sales view stays scannable.
  const vacantGrouped = useMemo(() => {
    interface FloorGroup { floor: string; rooms: RoomView[]; }
    interface BuildingGroup { building: string; total: number; floors: FloorGroup[]; }

    const byBuilding = new Map<string, Map<string, RoomView[]>>();
    for (const r of vacantRooms) {
      const b = r.building || "(ไม่ระบุตึก)";
      const f = r.floor || "—";
      if (!byBuilding.has(b)) byBuilding.set(b, new Map());
      const byFloor = byBuilding.get(b)!;
      if (!byFloor.has(f)) byFloor.set(f, []);
      byFloor.get(f)!.push(r);
    }

    const out: BuildingGroup[] = [];
    for (const [building, floorMap] of byBuilding) {
      const floors: FloorGroup[] = [];
      let total = 0;
      const floorEntries = Array.from(floorMap.entries());
      // Sort floors numerically (1, 2, 10), strings last
      floorEntries.sort((a, b) => {
        const [na, sa] = floorSortKey(a[0]);
        const [nb, sb] = floorSortKey(b[0]);
        if (na !== nb) return na - nb;
        return sa.localeCompare(sb);
      });
      for (const [floor, rooms] of floorEntries) {
        // Within a floor, sort rooms by number
        const sorted = [...rooms].sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }));
        floors.push({ floor, rooms: sorted });
        total += rooms.length;
      }
      out.push({ building, total, floors });
    }
    // Sort buildings per preferred order; unknowns to end alphabetically
    out.sort((a, b) => {
      const ia = buildingSortIndex(a.building);
      const ib = buildingSortIndex(b.building);
      if (ia !== ib) return ia - ib;
      return a.building.localeCompare(b.building);
    });
    return out;
  }, [vacantRooms]);

  // Upcoming appointments: future-dated sales-side tasks, not done/cancelled.
  // We compare from start-of-today so today's open appointments still show.
  const upcomingAppointments = useMemo<Appointment[]>(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return (tasks || [])
      .filter((t) => {
        if (activeBuilding !== "ทั้งหมด" && t.building !== activeBuilding) return false;
        if (!SALES_TASK_TYPES.has(t.type)) return false;
        if (isDoneStatus(t.status) || isCancelledStatus(t.status)) return false;
        const d = parseThaiDate(t.date);
        if (!d) return false;
        if (d.getTime() < startOfToday.getTime()) return false;
        return true;
      })
      .map((t) => ({ task: t, date: parseThaiDate(t.date)! }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [tasks, activeBuilding]);

  // Rooms with moveout notice — actionable: sales should pre-list these
  // for upcoming viewings. We surface the most recent "ย้ายออก" task
  // date (if any) as a proxy for "noticed on", since the sheet has no
  // dedicated notice-date column. Falls back to "ไม่ระบุ" when unknown.
  const moveoutRooms = useMemo(() => {
    type Row = { room: RoomView; noticedDate: Date | null };
    const out: Row[] = [];
    for (const r of scopedRooms) {
      if (r.status !== "moveout") continue;
      const allTasks = [...(r.pastTasks || []), ...(r.upcomingTasks || []), ...(r.todayTasks || [])];
      let latest: Date | null = null;
      for (const t of allTasks) {
        if (t.type !== "ย้ายออก") continue;
        const d = parseThaiDate(t.date);
        if (!d) continue;
        if (!latest || d.getTime() > latest.getTime()) latest = d;
      }
      out.push({ room: r, noticedDate: latest });
    }
    // Sort: most recently noticed first (null/unknown to end)
    return out.sort((a, b) => {
      const ta = a.noticedDate?.getTime() ?? -Infinity;
      const tb = b.noticedDate?.getTime() ?? -Infinity;
      return tb - ta;
    });
  }, [scopedRooms]);

  // KPI: count upcoming appointments in the next 7 days for the chip.
  // Inclusive of the 7th day — previously a task exactly today+7 fell
  // off due to strict `<` boundary (Task 23).
  const appointmentsThisWeek = useMemo(
    () => countAppointmentsWithinDays(upcomingAppointments, 7),
    [upcomingAppointments],
  );

  return (
    <section className="ac-sales-pipeline" aria-label="ภาพรวมขาย">
      {/* KPI strip */}
      <div className="ac-sales-kpi">
        <KpiCard label="ห้องว่าง" value={vacantRooms.length} accent="green" />
        <KpiCard label="นัดสัปดาห์นี้" value={appointmentsThisWeek} accent="sky" />
        <KpiCard label="รอย้ายออก" value={moveoutRooms.length} accent="orange" />
      </div>

      {/* Section 1 — ห้องว่างพร้อมขาย (จัดกลุ่มตาม ตึก > ชั้น) */}
      <div className="ac-sales-section ac-sales-section-vacant">
        <div className="ac-sales-section-head ac-sales-section-head-hero">
          <h3 className="ac-sales-section-title-hero">🏠 ห้องว่างพร้อมขาย</h3>
          <span className="ac-sales-section-count-pill">{vacantRooms.length} ห้อง</span>
        </div>
        {vacantRooms.length === 0 ? (
          <div className="ac-sales-vacant-empty">
            <Icon name="facilities" size={40} />
            <span>{activeBuilding === "ทั้งหมด"
              ? "ไม่มีห้องว่างในขณะนี้"
              : `ไม่มีห้องว่างในตึก ${activeBuilding}`}</span>
          </div>
        ) : (
          <div className="ac-sales-vacant-groups">
            {vacantGrouped.map((bg) => (
              <div
                key={bg.building}
                className="ac-sales-vacant-building"
                data-bcolor={buildingColor(bg.building)}
              >
                <div className="ac-sales-vacant-building-head">
                  <span className="ac-sales-vacant-building-icon" aria-hidden>
                    <Icon name="facilities" size={20} />
                  </span>
                  <span className="ac-sales-vacant-building-name">{bg.building}</span>
                  <span className="ac-sales-vacant-building-count">{bg.total} ห้องว่าง</span>
                </div>
                {bg.floors.map((fg) => (
                  <div key={fg.floor} className="ac-sales-vacant-floor">
                    <div className="ac-sales-vacant-floor-head">
                      <span className="ac-sales-vacant-floor-label">
                        {fg.floor === "—" ? "ไม่ระบุชั้น" : `ชั้น ${fg.floor}`}
                      </span>
                      <span className="ac-sales-vacant-floor-rooms-summary">
                        ห้อง {fg.rooms.map((r) => r.room).join(", ")}
                      </span>
                    </div>
                    <div className="ac-sales-vacant-grid">
                      {fg.rooms.map((r) => (
                        <button
                          key={`${r.building}|${r.room}`}
                          className="ac-sales-vacant-card"
                          onClick={() => onSelectRoom(r)}
                          title={`ห้อง ${r.room} · ${r.building}${r.floor ? ` · ชั้น ${r.floor}` : ""}`}
                        >
                          <span className="ac-sales-vacant-card-room">ห้อง {r.room}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2 — นัดหมายข้างหน้า */}
      <div className="ac-sales-section">
        <div className="ac-sales-section-head">
          <h3 className="ac-sales-section-title">📅 นัดหมายข้างหน้า</h3>
          <span className="ac-sales-section-count">{upcomingAppointments.length} นัด</span>
        </div>
        {upcomingAppointments.length === 0 ? (
          <div className="ac-sales-empty">
            <span>ยังไม่มีนัดหมายข้างหน้า</span>
            <button
              type="button"
              className="ac-btn ac-btn-primary ac-btn-sm"
              onClick={onQuickAddLead}
              style={{ marginTop: 8 }}
            >+ บันทึกนัดชม</button>
          </div>
        ) : (
          <div className="ac-sales-list">
            {upcomingAppointments.map((a, idx) => (
              <div key={`${a.task.date}|${a.task.building}|${a.task.room}|${idx}`} className="ac-sales-row ac-sales-row-static">
                <span className={`ac-sales-tag ac-sales-tag-${
                  a.task.type === "ชมห้อง" ? "view"
                  : a.task.type === "ย้ายออก" ? "moveout"
                  : "movein"
                }`}>
                  {a.task.type}
                </span>
                <span className="ac-sales-row-main">
                  <span className="ac-sales-row-title">
                    {formatDateShort(a.date)} · ห้อง {a.task.room}
                  </span>
                  <span className="ac-sales-row-sub">
                    {a.task.building}
                    {a.task.customer ? ` · ${a.task.customer}` : ""}
                    {a.task.phone ? ` · ${a.task.phone}` : ""}
                  </span>
                </span>
                <span className="ac-sales-row-meta">{relativeDays(a.date)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 3 — รอย้ายออก (re-sell pipeline) */}
      <div className="ac-sales-section">
        <div className="ac-sales-section-head">
          <h3 className="ac-sales-section-title">🚪 รอย้ายออก</h3>
          <span className="ac-sales-section-count">{moveoutRooms.length} ห้อง</span>
        </div>
        {moveoutRooms.length === 0 ? (
          <div className="ac-sales-empty">ไม่มีห้องที่แจ้งย้ายออก</div>
        ) : (
          <div className="ac-sales-list">
            {moveoutRooms.map(({ room, noticedDate }) => (
              <button
                key={`${room.building}|${room.room}`}
                className="ac-sales-row"
                onClick={() => onSelectRoom(room)}
              >
                <span className="ac-sales-row-dot" style={{ background: STATUS_DOT.moveout }} aria-hidden />
                <span className="ac-sales-row-main">
                  <span className="ac-sales-row-title">ห้อง {room.room}</span>
                  <span className="ac-sales-row-sub">
                    {room.building}
                    {room.tenant ? ` · ${room.tenant}` : ""}
                    {room.phone ? ` · ${room.phone}` : ""}
                  </span>
                </span>
                <span className="ac-sales-row-meta">
                  {noticedDate ? `แจ้ง ${formatDateShort(noticedDate)}` : "—"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* FAB removed in Phase 1A — single CTA "+ นัดลูกค้า" lives in the
          header now to avoid duplication. `onQuickAddLead` is still on the
          props interface for potential reuse (Sales empty-state CTA etc.)
          but no quick-add button is rendered here. */}
    </section>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: number; accent: "green" | "sky" | "orange" }) {
  return (
    <div className={`ac-sales-kpi-card ac-sales-kpi-${accent}`}>
      <div className="ac-sales-kpi-value">{value}</div>
      <div className="ac-sales-kpi-label">{label}</div>
    </div>
  );
}

/* ====================================================================
 * Pure helpers — top-level so they're testable
 * ==================================================================== */

export function formatBaht(s: string | undefined | null): string {
  if (!s) return "";
  const n = parseInt(String(s).replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("th-TH");
}

export function formatDateShort(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

export function relativeDays(d: Date, now: Date = new Date()): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "วันนี้";
  if (diff === 1) return "พรุ่งนี้";
  if (diff > 1 && diff <= 7) return `ใน ${diff} วัน`;
  if (diff > 7) return `ใน ${diff} วัน`;
  return "";
}
