"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  PART_CATEGORIES,
  isLowStock,
  type Part,
  type PartCategory,
} from "@/types";
import { canAddEngTask } from "@/lib/permissions";
import { Icon } from "@/lib/icons";
import AddPartModal from "./AddPartModal";
import EmptyState from "./EmptyState";
import LoadingState from "./LoadingState";

/**
 * Parts / Inventory view — Task 37.
 *
 * Single flat list (no building scope — parts inventory is shared
 * across the property). Inline +1 / −1 buttons for the common case
 * of "engineer used a part" or "we restocked one"; full edit modal
 * for anything else.
 *
 * Low-stock badge fires when stock ≤ threshold (and threshold > 0).
 * Top-of-page banner summarises how many parts are low so the user
 * doesn't need to scroll through the table to find them.
 */

type CategoryFilter = "all" | PartCategory;

export default function PartsView() {
  const { data: session } = useSession();
  const canWrite = canAddEngTask(session?.user?.roles);

  const [rows, setRows] = useState<Part[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<CategoryFilter>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Part | null>(null);
  /** Track per-row busy state so inline +/- buttons disable individually. */
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/parts", { cache: "no-store", signal });
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

  async function adjust(p: Part, delta: number) {
    // Optimistic update — local stock changes immediately so a
    // mistaken click can be "undone" visually before the server
    // round-trip. Re-load on success/failure to settle on the
    // server-authoritative value.
    if (p.stock + delta < 0) return;
    setBusyIds((s) => new Set(s).add(p.id));
    setRows((prev) =>
      (prev || []).map((r) => (r.id === p.id ? { ...r, stock: r.stock + delta } : r)),
    );
    try {
      const res = await fetch("/api/parts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "adjust", id: p.id, delta }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "invalid JSON" }));
      if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      // Server is the truth — re-pull
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ปรับสต๊อกไม่สำเร็จ");
      // Roll back the optimistic update
      setRows((prev) =>
        (prev || []).map((r) => (r.id === p.id ? { ...r, stock: r.stock - delta } : r)),
      );
    } finally {
      setBusyIds((s) => {
        const next = new Set(s);
        next.delete(p.id);
        return next;
      });
    }
  }

  const filtered = useMemo(() => {
    const list = rows || [];
    const q = search.trim().toLowerCase();
    return list.filter((p) => {
      if (catFilter !== "all" && p.category !== catFilter) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.note.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [rows, search, catFilter]);

  const lowCount = useMemo(
    () => (rows || []).filter(isLowStock).length,
    [rows],
  );

  return (
    <section className="ac-parts" aria-label="คลังอะไหล่">
      <header className="ac-parts-head">
        <div>
          <h1 className="ac-parts-title">
            <Icon name="inventory" size={22} />
            <span>คลังอะไหล่</span>
          </h1>
          {lowCount > 0 && (
            <div className="ac-parts-low-banner" role="status">
              ⚠ {lowCount} รายการ ใกล้หมด/ต้องสั่งซื้อ
            </div>
          )}
        </div>
        {canWrite && (
          <button
            type="button"
            className="ac-btn ac-btn-primary"
            onClick={() => setAddOpen(true)}
          >
            <Icon name="add" size={16} /> เพิ่มอะไหล่
          </button>
        )}
      </header>

      <div className="ac-parts-toolbar">
        <input
          type="search"
          className="ac-parts-search"
          placeholder="ค้นหาชื่อ / หมายเหตุ"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="ค้นหาอะไหล่"
        />
        <nav className="ac-parts-cat-chips" role="radiogroup" aria-label="กรองตามหมวด">
          {(["all", ...PART_CATEGORIES] as CategoryFilter[]).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={catFilter === c}
              className={`ac-chip ${catFilter === c ? "is-active" : ""}`}
              onClick={() => setCatFilter(c)}
            >
              {c === "all" ? "ทั้งหมด" : c}
            </button>
          ))}
        </nav>
      </div>

      {err && (
        <div className="ac-banner ac-banner-warn" role="alert">
          <strong>⚠ </strong>{err}{" "}
          <button className="ac-btn ac-btn-ghost ac-btn-sm" onClick={() => setErr(null)}>ปิด</button>
        </div>
      )}

      {loading && !rows ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="equipment"
          title={rows && rows.length === 0 ? "ยังไม่มีอะไหล่ในระบบ" : "ไม่พบรายการตามที่ค้นหา"}
          description={
            rows && rows.length === 0
              ? "เพิ่มอะไหล่ชิ้นแรกเพื่อเริ่มติดตามสต๊อก"
              : "ลองเปลี่ยนคำค้นหรือหมวดที่เลือก"
          }
          action={
            canWrite && rows && rows.length === 0
              ? { label: "+ เพิ่มอะไหล่ชิ้นแรก", onClick: () => setAddOpen(true) }
              : undefined
          }
        />
      ) : (
        <div className="ac-parts-table-wrap">
          <table className="ac-parts-table">
            <thead>
              <tr>
                <th scope="col">ชื่อ</th>
                <th scope="col">หมวด</th>
                <th scope="col" className="ac-parts-num">คงเหลือ</th>
                <th scope="col" className="ac-parts-num">จุดสั่งซื้อ</th>
                <th scope="col">อัปเดต</th>
                {canWrite && <th scope="col">จัดการ</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const low = isLowStock(p);
                const busy = busyIds.has(p.id);
                return (
                  <tr key={p.id} className={low ? "is-low" : ""}>
                    <td>
                      <div className="ac-parts-name">{p.name}</div>
                      {p.note && <div className="ac-parts-note">{p.note}</div>}
                    </td>
                    <td><span className="ac-parts-cat">{p.category}</span></td>
                    <td className="ac-parts-num">
                      <div className="ac-parts-stock">
                        {canWrite && (
                          <button
                            type="button"
                            className="ac-parts-stock-btn"
                            onClick={() => adjust(p, -1)}
                            disabled={busy || p.stock <= 0}
                            aria-label={`ลด ${p.name} ลง 1`}
                          >−</button>
                        )}
                        <span className={`ac-parts-stock-num ${low ? "is-low" : ""}`}>
                          {p.stock} <span className="ac-parts-unit">{p.unit}</span>
                        </span>
                        {canWrite && (
                          <button
                            type="button"
                            className="ac-parts-stock-btn"
                            onClick={() => adjust(p, +1)}
                            disabled={busy}
                            aria-label={`เพิ่ม ${p.name} ขึ้น 1`}
                          >+</button>
                        )}
                      </div>
                    </td>
                    <td className="ac-parts-num">{p.threshold || "—"}</td>
                    <td>
                      <span className="ac-parts-time" title={p.updatedAt || p.createdAt}>
                        {(p.updatedAt || p.createdAt || "—").split(" ")[0]}
                      </span>
                    </td>
                    {canWrite && (
                      <td>
                        <button
                          type="button"
                          className="ac-btn ac-btn-ghost ac-btn-sm"
                          onClick={() => setEditTarget(p)}
                        >แก้ไข</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AddPartModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => load()}
      />
      <AddPartModal
        open={!!editTarget}
        initial={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => load()}
      />
    </section>
  );
}
