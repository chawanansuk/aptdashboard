"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { LEAD_STAGES, type Lead, type LeadStage, groupLeadsByStage } from "@/types";
import { canPerform } from "@/lib/permissions";
import { Icon } from "@/lib/icons";
import { exportCsv } from "@/lib/csvExport";
import { relativeTimeLabel } from "@/lib/relativeTime";
import AddLeadModal from "./AddLeadModal";
import EmptyState from "./EmptyState";
import LoadingState from "./LoadingState";
import ErrorBanner from "./ErrorBanner";

/**
 * Lead CRM view (Task 26) — Kanban-style pipeline with 6 stage columns.
 *
 * Mobile: stacks columns vertically. Desktop: horizontal scroll. Each
 * card click opens the edit modal; stage change persists immediately.
 *
 * Permission gated to sales + management (`lead.edit`).
 */

interface Props {
  /** "+ เพิ่ม Lead" callback from header — when provided, opens with
   *  no initialStage (defaults to "ใหม่"). */
  onAddNew?: () => void;
}

const STAGE_TONE: Record<LeadStage, string> = {
  "ใหม่":      "is-new",
  "นัดดูแล้ว": "is-scheduled",
  "กำลังคุย":  "is-talking",
  "ทำสัญญา":  "is-contract",
  "ปิดดีล":   "is-won",
  "ปิดเลิก":  "is-lost",
};

export default function LeadsView({ onAddNew }: Props) {
  void onAddNew;
  const { data: session } = useSession();
  const canWrite = canPerform(session?.user?.roles, "lead.edit");

  const [rows, setRows] = useState<Lead[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<"all" | LeadStage>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [addStage, setAddStage] = useState<LeadStage | undefined>(undefined);
  const [editTarget, setEditTarget] = useState<Lead | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch("/api/leads", { cache: "no-store", signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setRows(data.rows || []);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal);
    return () => ac.abort();
  }, [load]);

  async function moveStage(lead: Lead, newStage: LeadStage) {
    if (!canWrite) return;
    if (lead.stage === newStage) return;
    setBusyIds((s) => new Set(s).add(lead.id));
    // Optimistic
    setRows((prev) => (prev || []).map((l) => (l.id === lead.id ? { ...l, stage: newStage } : l)));
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: lead.id, stage: newStage }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    } catch (e) {
      // Rollback
      setRows((prev) => (prev || []).map((l) => (l.id === lead.id ? { ...l, stage: lead.stage } : l)));
      setErr(e instanceof Error ? e.message : "อัปเดต stage ไม่สำเร็จ");
    } finally {
      setBusyIds((s) => { const n = new Set(s); n.delete(lead.id); return n; });
    }
  }

  async function remove(lead: Lead) {
    if (!confirm(`ลบ Lead "${lead.name}"?\n\nการลบนี้ไม่สามารถย้อนกลับได้`)) return;
    setBusyIds((s) => new Set(s).add(lead.id));
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: lead.id }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRows((prev) => (prev || []).filter((l) => l.id !== lead.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setBusyIds((s) => { const n = new Set(s); n.delete(lead.id); return n; });
    }
  }

  const filtered = useMemo(() => {
    const list = rows || [];
    const q = search.trim().toLowerCase();
    return list.filter((l) => {
      if (stageFilter !== "all" && l.stage !== stageFilter) return false;
      if (q) {
        const hay = `${l.name} ${l.phone} ${l.interest} ${l.note} ${l.source}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, stageFilter]);

  const grouped = useMemo(() => groupLeadsByStage(filtered), [filtered]);

  function handleExport() {
    if (filtered.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    exportCsv(
      `lead_${today}.csv`,
      filtered,
      [
        { header: "ชื่อ",        value: (l: Lead) => l.name },
        { header: "เบอร์โทร",    value: (l: Lead) => l.phone },
        { header: "ช่องทาง",    value: (l: Lead) => l.source },
        { header: "สนใจ",        value: (l: Lead) => l.interest },
        { header: "Stage",       value: (l: Lead) => l.stage },
        { header: "หมายเหตุ",    value: (l: Lead) => l.note },
        { header: "ผู้บันทึก",    value: (l: Lead) => l.creator },
        { header: "วันที่บันทึก",  value: (l: Lead) => l.createdAt },
        { header: "วันที่ปรับปรุง", value: (l: Lead) => l.updatedAt },
      ],
    );
  }

  return (
    <section className="ac-leads" aria-label="Lead CRM">
      <header className="ac-leads-head">
        <div>
          <h1 className="ac-leads-title">
            <Icon name="tenants" size={22} />
            <span>Lead CRM</span>
            {rows && <span className="ac-leads-count">({rows.length})</span>}
          </h1>
        </div>
        <div className="ac-leads-actions">
          <button
            type="button"
            className="ac-btn ac-btn-ghost"
            onClick={handleExport}
            disabled={!rows || filtered.length === 0}
          >⬇ CSV</button>
          {canWrite && (
            <button
              type="button"
              className="ac-btn ac-btn-primary"
              onClick={() => { setAddStage(undefined); setAddOpen(true); }}
            >+ เพิ่ม Lead</button>
          )}
        </div>
      </header>

      <div className="ac-leads-toolbar">
        <input
          type="search"
          className="ac-leads-search"
          placeholder="ค้นหา ชื่อ / เบอร์ / สนใจ / หมายเหตุ"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <nav className="ac-leads-stage-chips" role="radiogroup" aria-label="กรองตาม stage">
          <button
            type="button"
            role="radio"
            aria-checked={stageFilter === "all"}
            className={`ac-chip ${stageFilter === "all" ? "is-active" : ""}`}
            onClick={() => setStageFilter("all")}
          >ทั้งหมด</button>
          {LEAD_STAGES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={stageFilter === s}
              className={`ac-chip ${stageFilter === s ? "is-active" : ""}`}
              onClick={() => setStageFilter(s)}
            >{s}</button>
          ))}
        </nav>
      </div>

      <ErrorBanner message={err} onRetry={() => load()} onDismiss={() => setErr(null)} />

      {loading && !rows ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="tenants"
          title={rows && rows.length === 0 ? "ยังไม่มี Lead ในระบบ" : "ไม่พบ Lead ตามที่ค้นหา"}
          description={rows && rows.length === 0 ? "เพิ่ม Lead แรกเพื่อเริ่ม track pipeline" : "ลองเปลี่ยนคำค้นหรือ stage"}
          action={canWrite && rows && rows.length === 0
            ? { label: "+ เพิ่ม Lead แรก", onClick: () => { setAddStage(undefined); setAddOpen(true); } }
            : undefined
          }
        />
      ) : (
        <div className="ac-leads-board">
          {LEAD_STAGES.map((stage) => {
            const items = grouped.get(stage) || [];
            return (
              <div key={stage} className={`ac-lead-col ${STAGE_TONE[stage]}`}>
                <header className="ac-lead-col-head">
                  <span className="ac-lead-col-title">{stage}</span>
                  <span className="ac-lead-col-count">{items.length}</span>
                  {canWrite && (
                    <button
                      type="button"
                      className="ac-lead-col-add"
                      onClick={() => { setAddStage(stage); setAddOpen(true); }}
                      title={`เพิ่ม Lead ใหม่ใน "${stage}"`}
                      aria-label={`เพิ่ม Lead ใน ${stage}`}
                    >+</button>
                  )}
                </header>
                <ul className="ac-lead-col-list">
                  {items.map((lead) => {
                    const busy = busyIds.has(lead.id);
                    return (
                      <li key={lead.id} className={`ac-lead-card ${busy ? "is-busy" : ""}`}>
                        <button
                          type="button"
                          className="ac-lead-card-main"
                          onClick={() => setEditTarget(lead)}
                        >
                          <div className="ac-lead-card-name">{lead.name}</div>
                          {lead.phone && (
                            <div className="ac-lead-card-phone">📞 {lead.phone}</div>
                          )}
                          {lead.interest && (
                            <div className="ac-lead-card-interest">{lead.interest}</div>
                          )}
                          <div className="ac-lead-card-meta">
                            {lead.source && <span className="ac-lead-card-src">{lead.source}</span>}
                            {(lead.updatedAt || lead.createdAt) && (
                              <span className="ac-lead-card-time">{relativeTimeLabel(lead.updatedAt || lead.createdAt)}</span>
                            )}
                          </div>
                        </button>
                        {canWrite && (
                          <div className="ac-lead-card-actions">
                            <select
                              className="ac-lead-card-stage-select"
                              value={lead.stage}
                              disabled={busy}
                              onChange={(e) => moveStage(lead, e.target.value as LeadStage)}
                              aria-label={`เปลี่ยน stage ของ ${lead.name}`}
                            >
                              {LEAD_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <button
                              type="button"
                              className="ac-lead-card-del"
                              onClick={() => remove(lead)}
                              disabled={busy}
                              title="ลบ"
                              aria-label="ลบ Lead"
                            >🗑</button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <AddLeadModal
        open={addOpen}
        initialStage={addStage}
        onClose={() => setAddOpen(false)}
        onSaved={() => load()}
      />
      <AddLeadModal
        open={!!editTarget}
        initial={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => load()}
      />
    </section>
  );
}
