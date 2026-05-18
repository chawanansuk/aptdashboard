"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { RoomHistoryEntry, RoomHistoryType } from "@/types";
import { HISTORY_TYPES, HISTORY_TYPE_COLOR } from "@/lib/constants";
import { canAddTask } from "@/lib/permissions";
import { loadHistoryCache, saveHistoryCache, invalidateHistoryCache } from "@/lib/historyCache";
import AddHistoryModal from "./AddHistoryModal";

interface Props {
  building: string;
  room: string;
}

type FilterKey = "all" | RoomHistoryType;

function formatDateLabel(s: string): string {
  if (!s) return "—";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatCost(c: string): string {
  if (!c) return "";
  const n = parseInt(String(c).replace(/[^0-9]/g, ""), 10);
  if (!n) return c;
  return n.toLocaleString("th-TH") + " ฿";
}

export default function RoomHistoryTab({ building, room }: Props) {
  const { data: session } = useSession();
  const canAdd = canAddTask(session?.user?.role);

  const [rows, setRows] = useState<RoomHistoryEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    setErr(null);
    // Cache hit unless forced
    if (!opts?.force) {
      const cached = loadHistoryCache(building, room);
      if (cached) {
        setRows(cached);
        return;
      }
    }
    setLoading(true);
    try {
      const url = `/api/room-history?building=${encodeURIComponent(building)}&room=${encodeURIComponent(room)}`;
      const res = await fetch(url, { cache: "no-store" });
      const j = await res.json().catch(() => ({ error: "invalid JSON" }));
      if (!res.ok) {
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const list: RoomHistoryEntry[] = Array.isArray(j.rows) ? j.rows : [];
      setRows(list);
      saveHistoryCache(building, room, list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [building, room]);

  // Initial load on mount + when building/room changes
  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (filter === "all") return rows;
    return rows.filter((r) => r.type === filter);
  }, [rows, filter]);

  const totalCost = useMemo(() => {
    if (!rows) return 0;
    return rows.reduce((sum, r) => sum + (parseInt(String(r.cost || "").replace(/[^0-9]/g, ""), 10) || 0), 0);
  }, [rows]);

  async function handleAdd(entry: {
    date: string; type: RoomHistoryType; description: string; cost: string; photoUrl: string;
  }) {
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/room-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ building, room, ...entry }),
      });
      const j = await res.json().catch(() => ({ ok: false, error: "invalid JSON" }));
      if (!res.ok || !j.ok) {
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setAddOpen(false);
      invalidateHistoryCache(building, room);
      await load({ force: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ac-history-tab">
      <div className="ac-history-toolbar">
        <div className="ac-chips ac-history-chips">
          <button
            className={`ac-chip ${filter === "all" ? "is-active" : ""}`}
            onClick={() => setFilter("all")}
          >ทั้งหมด {rows ? `(${rows.length})` : ""}</button>
          {HISTORY_TYPES.map((t) => {
            const count = rows ? rows.filter((r) => r.type === t).length : 0;
            if (count === 0 && filter !== t) return null;
            return (
              <button
                key={t}
                className={`ac-chip ${filter === t ? "is-active" : ""}`}
                onClick={() => setFilter(t)}
              >{t} ({count})</button>
            );
          })}
        </div>
        {canAdd && (
          <button className="ac-btn ac-btn-primary ac-btn-sm" onClick={() => setAddOpen(true)}>
            + บันทึก
          </button>
        )}
      </div>

      {totalCost > 0 && (
        <div className="ac-history-summary">
          รวมค่าใช้จ่ายทั้งหมด <strong>{totalCost.toLocaleString("th-TH")} ฿</strong>
        </div>
      )}

      {err && <div className="ac-banner ac-banner-warn">{err}</div>}

      {loading && !rows && (
        <div className="ac-empty" style={{ padding: 24, color: "#94A3B8" }}>กำลังโหลดประวัติ...</div>
      )}

      {!loading && rows && filtered.length === 0 && (
        <div className="ac-empty" style={{ padding: 24, color: "#94A3B8" }}>
          {filter === "all" ? "ยังไม่มีประวัติของห้องนี้" : `ไม่มีประวัติประเภท "${filter}"`}
        </div>
      )}

      <ul className="ac-history-entries">
        {filtered.map((r) => (
          <li key={r.id || `${r.date}-${r.type}-${r.description}`} className="ac-history-entry">
            <div
              className="ac-history-entry-dot"
              style={{ background: HISTORY_TYPE_COLOR[r.type] || "#94A3B8" }}
              aria-hidden="true"
            />
            <div className="ac-history-entry-main">
              <div className="ac-history-entry-line1">
                <span className="ac-history-entry-date">{formatDateLabel(r.date)}</span>
                <span
                  className="ac-history-entry-type"
                  style={{
                    background: (HISTORY_TYPE_COLOR[r.type] || "#94A3B8") + "22",
                    color: HISTORY_TYPE_COLOR[r.type] || "#475569",
                  }}
                >{r.type}</span>
                {r.cost && <span className="ac-history-entry-cost">{formatCost(r.cost)}</span>}
              </div>
              {r.description && (
                <div className="ac-history-entry-desc">{r.description}</div>
              )}
              <div className="ac-history-entry-meta">
                {r.creator && <span>โดย {r.creator}</span>}
                {r.photoUrl && (
                  <>
                    <span> · </span>
                    <a href={r.photoUrl} target="_blank" rel="noreferrer" className="ac-history-entry-photo">
                      🖼 ดูรูป
                    </a>
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <AddHistoryModal
        open={addOpen}
        building={building}
        room={room}
        submitting={submitting}
        onClose={() => setAddOpen(false)}
        onSubmit={handleAdd}
      />
    </div>
  );
}
