"use client";

import type { RoomView } from "@/types";
import { Icon } from "@/lib/icons";
import { STATUS_LABEL } from "@/lib/constants";
import { parseThaiDate } from "@/lib/dateUtils";
import { formatBaht } from "@/lib/money";
import { formatDateShort } from "@/lib/salesData";
import { isBooked, nextAppointment } from "@/lib/moveIns";

interface Props {
  r: RoomView;
  /** Tenant / booker names — only for roles that may see them. */
  showNames: boolean;
  /** Building in the second line (overview card, mixed buildings) or the
   *  floor (room list already grouped by building). */
  showBuilding?: boolean;
  onSelect: (r: RoomView) => void;
  /** Booked room with no move-in date → a "นัดวันเข้า" button beside the
   *  row. Omitted for roles that can't add sales tasks (label instead). */
  onScheduleMoveIn?: (r: RoomView) => void;
  /** The ⋯ quick-actions popover, anchored to the row. */
  onOpenQuick?: (e: React.MouseEvent, r: RoomView) => void;
  /** Vehicle / equipment counts — the same badges the grid tile shows. */
  veh?: number;
  eq?: number;
}

function daysFromToday(d: Date): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((d.getTime() - today.getTime()) / 86_400_000);
}

/** Nearest open ชมห้อง today or later. */
function nextViewing(r: RoomView): Date | null {
  let best: Date | null = null;
  for (const t of r.upcomingTasks || []) {
    if (t.type !== "ชมห้อง") continue;
    const d = parseThaiDate(t.date);
    if (d && (!best || d < best)) best = d;
  }
  return best;
}

/**
 * One room as a list row: number · who/where · what's next. Shared by
 * the overview "พร้อมให้เช่า" card and the phone-sized room list
 * (RoomsView, single-status views), so both say the same thing about a
 * room. The tint lives on the <li>: a booked room with no move-in date
 * gets a SECOND button beside the row, and a button can't be nested
 * inside the row's own button.
 */
export default function RoomListRow({ r, showNames, showBuilding = true, onSelect, onScheduleMoveIn, onOpenQuick, veh = 0, eq = 0 }: Props) {
  const where = showBuilding ? r.building : (r.floor ? `ชั้น ${r.floor}` : "");
  const outAt = r.status === "moveout" ? nextAppointment(r, "ย้ายออก") : null;
  const inAt = r.status === "pending" ? nextAppointment(r, "ย้ายเข้า") : null;
  // A ว่าง room with only a viewing shows as "pending" too — say when.
  const viewAt = r.status === "pending" && !inAt ? nextViewing(r) : null;
  // Contract end: shown only to roles that see tenants (the grid's rule),
  // coloured when it's within 30 days.
  const contractAt = r.status === "occupied" && showNames && r.contractEnd ? parseThaiDate(r.contractEnd) : null;
  const contractDays = contractAt ? daysFromToday(contractAt) : null;
  const contractTone = contractDays === null || contractDays > 30 ? ""
    : contractDays < 0 ? "is-expired" : contractDays <= 7 ? "is-soon" : "is-warn";
  const repair = r.status === "repair"
    ? [...(r.todayTasks || []), ...(r.upcomingTasks || []), ...(r.pastTasks || [])].find((t) => t.type === "ซ่อม")
    : undefined;

  // What the team wrote on the room wins over the generic line — for a
  // booked room that is usually "who, and when they move in".
  const fallback =
    r.status === "ready" ? (r.needsCleaning ? "ต้องทำสะอาดก่อนเข้าอยู่" : "ว่าง พร้อมเข้าอยู่")
    : r.status === "moveout" ? "แจ้งย้ายออกแล้ว"
    : r.status === "repair" ? (repair ? (repair.note || "").trim() || "งานซ่อม" : "ยังไม่มีใบงานซ่อม — สร้างงานซ่อมให้ช่างรู้ว่าต้องทำอะไร")
    : r.status === "qc" && r.needsCleaning ? "ต้องทำสะอาด"
    : "";
  const note = (r.note || "").trim() || fallback;

  // A name line for rooms that have (or await) a person. Booked rooms
  // without a name still say so; a viewing-only "pending" room is not a
  // booking and gets no name line.
  const who =
    r.status === "pending" && isBooked(r) ? (showNames ? r.tenant?.trim() || "ยังไม่ได้ใส่ชื่อผู้จอง" : "จองแล้ว")
    : (r.status === "occupied" || r.status === "moveout") && showNames ? r.tenant?.trim() || null
    : null;

  // null = booked with nothing scheduled → the schedule button / label.
  const end: string | null =
    r.status === "ready" ? formatBaht(r.price)
    : r.status === "moveout" ? (outAt ? `ย้ายออก ${formatDateShort(outAt)}` : "")
    : r.status === "occupied" ? (contractAt ? `สัญญาถึง ${formatDateShort(contractAt)}` : "")
    : r.status === "pending" ? (inAt ? `เข้า ${formatDateShort(inAt)}` : isBooked(r) ? null : viewAt ? `นัดชม ${formatDateShort(viewAt)}` : "")
    : "";

  return (
    <li className={`ac-ready-item ac-ready-item-${r.status}`}>
      <button
        type="button"
        className="ac-ready-row"
        onClick={() => onSelect(r)}
        title={`ห้อง ${r.room} อาคาร ${r.building} · ${STATUS_LABEL[r.status]}`}
      >
        <span className="ac-ready-num">
          {r.room}
          {r.today && <span className="ac-ready-today" title="มีงานวันนี้" />}
        </span>
        {/* Visible text is the accessible name; the status rides along for
            screen readers (it is the row's colour for everyone else). */}
        <span className="ac-sr-only">{STATUS_LABEL[r.status]}{r.today ? " มีงานวันนี้" : ""}</span>
        <span className="ac-ready-main">
          <span className="ac-ready-where">
            {who
              ? <>{who}{where && <span className="ac-ready-where-sub"> · {where}</span>}</>
              : <>{where}{showBuilding && r.floor ? ` · ชั้น ${r.floor}` : ""}</>}
          </span>
          {note && <span className={`ac-ready-note${r.status === "repair" && !repair ? " is-missing" : ""}`} title={note}>{note}</span>}
          {(veh > 0 || eq > 0) && (
            <span className="ac-ready-badges">
              {veh > 0 && <span title={`ยานพาหนะ ${veh} คัน`}><Icon name="vehicle" size={12} /> {veh}</span>}
              {eq > 0 && <span title={`อุปกรณ์ ${eq} ชิ้น`}><Icon name="maintenance" size={12} /> {eq}</span>}
            </span>
          )}
        </span>
        {end === null
          ? !onScheduleMoveIn && <span className="ac-ready-end is-missing">ยังไม่นัดวันเข้า</span>
          : end && <span className={`ac-ready-end${r.status === "occupied" && contractTone ? ` ac-ready-contract ${contractTone}` : ""}`}>{end}</span>}
      </button>
      {end === null && onScheduleMoveIn && (
        <button
          type="button"
          className="ac-ready-schedule"
          onClick={() => onScheduleMoveIn(r)}
          title="ยังไม่มีนัดย้ายเข้า — กดเพื่อนัดวันเข้า"
          aria-label={`ห้อง ${r.room} ยังไม่นัดวันเข้า — นัดวันย้ายเข้า`}
        >
          <Icon name="calendar" size={14} /> นัดวันเข้า
        </button>
      )}
      {onOpenQuick && (
        <button
          type="button"
          className="ac-ready-more"
          onClick={(e) => onOpenQuick(e, r)}
          title="ตัวเลือกเพิ่มเติม"
          aria-label={`ห้อง ${r.room} — ตัวเลือกเพิ่มเติม`}
        >
          <Icon name="more" size={16} />
        </button>
      )}
    </li>
  );
}
