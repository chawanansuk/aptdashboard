"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuditEntry } from "@/types";
import { relativeTimeLabel } from "@/lib/relativeTime";
import ErrorBanner from "./ErrorBanner";
import LoadingState from "./LoadingState";

/**
 * AuditViewer — client-side filterable table of audit_log rows.
 * Fetches /api/audit once on mount, allows filter + search without
 * re-fetching. Limit is 200 rows by default (configurable via API).
 */

const ENTITY_LABEL: Record<string, string> = {
  all: "ทั้งหมด",
  room: "ห้อง",
  task: "งาน",
  part: "อะไหล่",
  recurring: "งานประจำ",
  equipment: "อุปกรณ์",
};

const ACTION_LABEL: Record<string, string> = {
  updateRoomStatus: "เปลี่ยนสถานะห้อง",
  deleteTask: "ลบงาน",
  addRequisition: "เบิกอะไหล่",
  add: "เพิ่ม",
  delete: "ลบ",
  run: "รันงานประจำ",
  updateEquipment: "อัปเดตอุปกรณ์",
};

export default function AuditViewer() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState<string>("all");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/audit?limit=500", { cache: "no-store", signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setRows(data.rows || []);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setErr(e instanceof Error ? e.message : "โหลด audit log ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal);
    return () => ac.abort();
  }, [load]);

  const entities = useMemo(() => {
    if (!rows) return ["all"];
    const set = new Set<string>(["all"]);
    for (const r of rows) if (r.entity) set.add(r.entity);
    return Array.from(set);
  }, [rows]);

  const filtered = useMemo(() => {
    const list = rows || [];
    const q = search.trim().toLowerCase();
    return list.filter((r) => {
      if (entityFilter !== "all" && r.entity !== entityFilter) return false;
      if (q) {
        const hay = `${r.user} ${r.action} ${r.entity} ${r.entityId} ${r.details}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, entityFilter]);

  return (
    <section className="ac-audit">
      <div className="ac-audit-toolbar">
        <input
          type="search"
          className="ac-audit-search"
          placeholder="ค้นหา user / action / entity / details"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <nav className="ac-audit-chips" role="radiogroup" aria-label="กรองตาม entity">
          {entities.map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={entityFilter === e}
              className={`ac-chip ${entityFilter === e ? "is-active" : ""}`}
              onClick={() => setEntityFilter(e)}
            >{ENTITY_LABEL[e] || e}</button>
          ))}
        </nav>
        <button
          type="button"
          className="ac-btn ac-btn-ghost ac-btn-sm"
          onClick={() => load()}
          disabled={loading}
        >{loading ? "กำลังโหลด…" : "↻ รีเฟรช"}</button>
      </div>

      <ErrorBanner message={err} onRetry={() => load()} onDismiss={() => setErr(null)} />

      {loading && !rows ? (
        <LoadingState />
      ) : !rows || filtered.length === 0 ? (
        <div className="ac-audit-empty">ไม่พบรายการ</div>
      ) : (
        <div className="ac-audit-table-wrap">
          <table className="ac-audit-table">
            <thead>
              <tr>
                <th>เวลา</th>
                <th>ผู้ใช้</th>
                <th>การกระทำ</th>
                <th>ประเภท</th>
                <th>รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td title={r.timestamp}>
                    <div className="ac-audit-time-main">{r.timestamp.split(" ")[1] || r.timestamp}</div>
                    <div className="ac-audit-time-sub">{relativeTimeLabel(r.timestamp) || r.timestamp.split(" ")[0]}</div>
                  </td>
                  <td className="ac-audit-user">{r.user.split("@")[0] || "—"}</td>
                  <td><span className="ac-audit-action">{ACTION_LABEL[r.action] || r.action}</span></td>
                  <td>
                    <div className="ac-audit-entity">{ENTITY_LABEL[r.entity] || r.entity}</div>
                    {r.entityId && (
                      <div className="ac-audit-entity-id" title={r.entityId}>{r.entityId}</div>
                    )}
                  </td>
                  <td className="ac-audit-details">{r.details || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
