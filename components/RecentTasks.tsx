"use client";

import { memo, useMemo } from "react";
import type { SheetRow, RoomView } from "@/types";
import { relativeTimeShort, formatFullTimestamp } from "@/lib/relativeTime";
import { parseTaskLocation } from "@/lib/taskLocation";

/**
 * Recent Tasks widget — Overview page.
 *
 * Read-only list of the 5 most-recently-created tasks. Helps the
 * user see "what just happened" without scrolling /tasks. Sorted by
 * `createdAt` desc (server timestamp) — when that's missing, falls
 * back to the task date so old data doesn't disappear from the list.
 *
 * Filtered by activeBuilding for consistency with the rest of
 * Overview.
 *
 * Click → opens the room modal for that task's room (when room
 * exists). Common-area tasks render with the 🏢 icon and no room
 * link (no concrete room to open).
 */

interface Props {
  tasks: SheetRow[];
  rooms: RoomView[];
  activeBuilding: string;
  onSelectRoom?: (r: RoomView) => void;
}

const TYPE_ICON: Record<string, string> = {
  "ทำสะอาด": "🧹",
  "ซ่อม":    "🔧",
  "ย้ายเข้า": "📥",
  "ย้ายออก": "📤",
  "ชมห้อง":  "👀",
  "อื่นๆ":    "•",
};

function shortenCreator(email: string | undefined): string {
  if (!email) return "—";
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

/** Sort key — use createdAt when present, fall back to task date. */
function sortKey(t: SheetRow): number {
  const c = t.createdAt;
  if (c) {
    const ms = Date.parse(c.includes("T") ? c : c.replace(" ", "T"));
    if (Number.isFinite(ms)) return ms;
  }
  // Fall back to task date "dd/MM/yyyy"
  const parts = (t.date || "").split("/");
  if (parts.length === 3) {
    const [d, m, y] = parts.map((p) => parseInt(p, 10));
    if (d && m && y) return new Date(y, m - 1, d).getTime();
  }
  return 0;
}

function RecentTasks({ tasks, rooms, activeBuilding, onSelectRoom }: Props) {
  const recent = useMemo(() => {
    const scoped = activeBuilding === "ทั้งหมด"
      ? tasks
      : tasks.filter((t) => t.building === activeBuilding);
    return [...scoped]
      .sort((a, b) => sortKey(b) - sortKey(a))
      .slice(0, 5);
  }, [tasks, activeBuilding]);

  if (recent.length === 0) {
    return null; // hide entirely on empty — Overview already has KPIs/empty hints
  }

  return (
    <section className="ac-recent-tasks" aria-label="งานล่าสุด">
      <header className="ac-recent-tasks-head">
        <h3>งานล่าสุด</h3>
        <span className="ac-recent-tasks-sub">5 รายการล่าสุด</span>
      </header>
      <ul className="ac-recent-tasks-list">
        {recent.map((t) => {
          const loc = parseTaskLocation(t);
          const icon = TYPE_ICON[t.type] || "•";
          // Compact time for the tight meta row (#12) — full timestamp
          // in the title tooltip. Falls back to the task date when there's
          // no createdAt to compute from.
          const timeShort = relativeTimeShort(t.createdAt) || t.date;
          const timeFull = formatFullTimestamp(t.createdAt) || t.date;
          const room = loc.kind === "room"
            ? rooms.find((r) => r.building === t.building && r.room === t.room)
            : undefined;
          const clickable = !!room && !!onSelectRoom;
          const Tag = clickable ? "button" : "div";
          return (
            <li key={`${t.date}|${t.building}|${t.room}|${t.type}|${t.createdAt || ""}`}>
              <Tag
                type={clickable ? "button" : undefined}
                className={`ac-recent-task-row ${clickable ? "is-clickable" : ""}`}
                onClick={clickable ? () => onSelectRoom!(room!) : undefined}
              >
                <span className="ac-recent-task-icon" aria-hidden>
                  {loc.kind === "common" ? "🏢" : icon}
                </span>
                <span className="ac-recent-task-body">
                  <span className="ac-recent-task-title">
                    {t.type}
                    {" · "}
                    {loc.kind === "common" ? loc.label : `ห้อง ${t.room}`}
                    <span className="ac-recent-task-bldg"> · {t.building}</span>
                  </span>
                  <span className="ac-recent-task-meta">
                    {shortenCreator(t.creator)} · <time title={timeFull}>{timeShort}</time>
                  </span>
                </span>
                {t.status && (
                  <span className="ac-recent-task-status" data-status={t.status}>
                    {t.status}
                  </span>
                )}
              </Tag>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default memo(RecentTasks);
