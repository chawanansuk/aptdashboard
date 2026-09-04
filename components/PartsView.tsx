"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  PART_CATEGORIES,
  isLowStock,
  type Part,
  type PartCategory,
  type Purchase,
} from "@/types";
import { canAddEngTask } from "@/lib/permissions";
import { Icon } from "@/lib/icons";
import { exportCsv } from "@/lib/csvExport";
import { getCachedView, setCachedView, bustView } from "@/lib/viewCache";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import AddPartModal from "./AddPartModal";
import PurchaseModal from "./PurchaseModal";
import ReceiptScanModal from "./ReceiptScanModal";
import RequisitionModal from "./RequisitionModal";
import RequisitionHistoryModal from "./RequisitionHistoryModal";
import EmptyState from "./EmptyState";
import LoadingState from "./LoadingState";
import ErrorBanner from "./ErrorBanner";
import type { RoomView } from "@/types";

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

interface Props {
  /** Rooms data — drives the building dropdown in RequisitionModal.
   *  Optional: PartsView still renders without it, modal just shows
   *  a free-text building field instead. */
  rooms?: RoomView[];
}

const PARTS_CACHE_KEY = "parts";

export default function PartsView({ rooms = [] }: Props) {
  const [reqTarget, setReqTarget] = useState<Part | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Part | null>(null);
  // v3.28 — "เติม" เปิดโมดัลบันทึกซื้อ (จำนวน+ราคา+ร้าน) แทน adjust เงียบๆ
  const [purchaseTarget, setPurchaseTarget] = useState<Part | null>(null);
  // r28: สแกนใบเสร็จ → บันทึกซื้อหลายรายการทีเดียว
  const [scanOpen, setScanOpen] = useState(false);
  const [purchaseQty, setPurchaseQty] = useState("");
  // บันทึกซื้อทั้งหมด — ใช้คำนวณ ▲▼ ข้างราคา/หน่วย + ยอดซื้อเดือนนี้
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const loadPurchases = useCallback(async () => {
    try {
      const res = await fetch("/api/part-purchases", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setPurchases((data.rows || []) as Purchase[]);
    } catch { /* trend เฉยๆ — พังก็แค่ไม่โชว์ลูกศร */ }
  }, []);
  useEffect(() => { void loadPurchases(); }, [loadPurchases]);

  // ต่อ part: [ล่าสุด, ก่อนหน้า] ของราคาที่มีจริง → เปอร์เซ็นต์ขึ้น/ลง
  const trendByPart = useMemo(() => {
    const m = new Map<string, number>();
    if (!purchases) return m;
    const seen = new Map<string, number>(); // partId -> latest unitPrice
    for (const r of purchases) { // ใหม่สุดก่อน (server เรียงมาแล้ว)
      if (!(r.unitPrice > 0)) continue;
      const latest = seen.get(r.partId);
      if (latest === undefined) { seen.set(r.partId, r.unitPrice); continue; }
      if (!m.has(r.partId)) {
        m.set(r.partId, Math.round(((latest - r.unitPrice) / r.unitPrice) * 100));
      }
    }
    return m;
  }, [purchases]);

  const monthSpend = useMemo(() => {
    if (!purchases) return 0;
    const ym = new Date();
    const prefix = `${ym.getFullYear()}-${String(ym.getMonth() + 1).padStart(2, "0")}`;
    let sum = 0;
    for (const r of purchases) {
      if ((r.date || "").startsWith(prefix)) sum += r.totalPrice || 0;
    }
    return sum;
  }, [purchases]);
  const { data: session } = useSession();
  const canWrite = canAddEngTask(session?.user?.roles);

  const [rows, setRows] = useState<Part[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [catFilter, setCatFilter] = useState<CategoryFilter>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Part | null>(null);
  /** Track per-row busy state so inline +/- buttons disable individually. */
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  /** Per-row quick-adjust input value (positive integer as string).
   *  Empty / 0 / invalid → buttons disabled. */
  const [adjustValues, setAdjustValues] = useState<Record<string, string>>({});

  const load = useCallback(async (signal?: AbortSignal) => {
    // SWR — see lib/viewCache + VehiclesView.
    const cached = getCachedView<Part[]>(PARTS_CACHE_KEY);
    if (cached) { setRows(cached); setLoading(false); } else { setLoading(true); }
    setErr(null);
    try {
      const res = await fetch("/api/parts", { cache: "no-store", signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const list: Part[] = data.rows || [];
      setRows(list);
      setCachedView(PARTS_CACHE_KEY, list);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      if (!cached) setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
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
    // Clear any stale error from a prior failed adjust — otherwise a
    // successful retry still shows the old error banner until refresh.
    setErr(null);
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
      // Server is the truth — bust the SWR cache then re-pull so the
      // refetch doesn't momentarily seed the pre-adjust snapshot.
      bustView(PARTS_CACHE_KEY);
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
    const q = debouncedSearch.trim().toLowerCase();
    return list.filter((p) => {
      if (catFilter !== "all" && p.category !== catFilter) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.note.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [rows, debouncedSearch, catFilter]);

  const lowCount = useMemo(
    () => (rows || []).filter(isLowStock).length,
    [rows],
  );

  // v3.23 stock valuation — priced rows only; the banner shows coverage
  // so a partial number isn't mistaken for the whole inventory's value.
  const { stockValue, pricedCount } = useMemo(() => {
    let value = 0;
    let priced = 0;
    for (const p of rows || []) {
      if (p.price && p.price > 0) {
        priced++;
        value += p.price * p.stock;
      }
    }
    return { stockValue: value, pricedCount: priced };
  }, [rows]);

  function handleExport() {
    if (filtered.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const tag = catFilter === "all" ? "ทั้งหมด" : catFilter;
    exportCsv(
      `อะไหล่_${tag}_${today}.csv`,
      filtered,
      [
        { header: "ชื่อ",          value: (p: Part) => p.name },
        { header: "หมวด",         value: (p: Part) => p.category },
        { header: "คงเหลือ",      value: (p: Part) => p.stock },
        { header: "หน่วย",        value: (p: Part) => p.unit },
        { header: "จุดสั่งซื้อ",   value: (p: Part) => p.threshold || "" },
        { header: "ราคา/หน่วย",   value: (p: Part) => p.price || "" },
        { header: "มูลค่า",       value: (p: Part) => (p.price ? p.price * p.stock : "") },
        { header: "ใกล้หมด",      value: (p: Part) => (isLowStock(p) ? "ใช่" : "") },
        { header: "หมายเหตุ",     value: (p: Part) => p.note },
        { header: "ผู้บันทึก",     value: (p: Part) => p.creator },
        { header: "วันที่บันทึก",   value: (p: Part) => p.createdAt },
        { header: "วันที่ปรับปรุง",  value: (p: Part) => p.updatedAt },
      ],
    );
  }

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
          {monthSpend > 0 && (
            <div className="ac-parts-value-banner">
              🛒 ซื้อเข้าเดือนนี้ {monthSpend.toLocaleString("th-TH")} บาท
            </div>
          )}
          {stockValue > 0 && (
            <div className="ac-parts-value-banner">
              💰 มูลค่าสต๊อกรวม {stockValue.toLocaleString("th-TH")} บาท
              {pricedCount < (rows?.length ?? 0) &&
                ` (ตั้งราคาแล้ว ${pricedCount}/${rows?.length ?? 0} รายการ)`}
            </div>
          )}
        </div>
        <div className="ac-parts-head-actions">
          <button
            type="button"
            className="ac-btn ac-btn-ghost"
            onClick={handleExport}
            disabled={!rows || filtered.length === 0}
            title={filtered.length === 0 ? "ไม่มีข้อมูลให้ดาวน์โหลด" : `ดาวน์โหลด ${filtered.length} รายการ`}
          >⬇ ดาวน์โหลด CSV</button>
          {canWrite && (
            <button
              type="button"
              className="ac-btn ac-btn-secondary"
              onClick={() => setScanOpen(true)}
              title="ถ่ายรูปใบเสร็จแมคโคร/โฮมโปร ให้ระบบอ่านรายการ+ราคา แล้วบันทึกซื้อทีเดียว"
            >📷 สแกนใบเสร็จ</button>
          )}
          {canWrite && (
            <button
              type="button"
              className="ac-btn ac-btn-primary"
              onClick={() => setAddOpen(true)}
            >
              <Icon name="add" size={16} /> เพิ่มอะไหล่
            </button>
          )}
        </div>
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

      <ErrorBanner message={err} onRetry={() => load()} onDismiss={() => setErr(null)} />

      {loading && !rows ? (
        <LoadingState />
      ) : !rows ? (
        null /* โหลดพัง — ErrorBanner พูดแทน ไม่โชว์ "ไม่พบรายการ" ที่โกหก (audit r27) */
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
                <th scope="col" className="ac-parts-num">ราคา/หน่วย</th>
                <th scope="col" className="ac-parts-num">มูลค่า</th>
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
                      {canWrite && (() => {
                        const raw = adjustValues[p.id] ?? "";
                        const n = parseInt(raw, 10);
                        const valid = Number.isFinite(n) && n > 0;
                        const canUse = valid && n <= p.stock;
                        const setVal = (v: string) =>
                          setAdjustValues((s) => ({ ...s, [p.id]: v }));
                        return (
                          <div className="ac-parts-quick-adjust">
                            <input
                              type="number"
                              inputMode="numeric"
                              min="1"
                              placeholder="0"
                              value={raw}
                              onChange={(e) => setVal(e.target.value.replace(/[^\d]/g, ""))}
                              disabled={busy}
                              className="ac-parts-quick-input"
                              aria-label={`จำนวนสำหรับ ${p.name}`}
                            />
                            <button
                              type="button"
                              className="ac-parts-quick-btn ac-parts-quick-use"
                              disabled={busy || !canUse}
                              title={
                                !valid ? "กรอกจำนวน"
                                  : !canUse ? `มีในสต๊อกเพียง ${p.stock} ${p.unit}`
                                  : `ตัดสต๊อก ${n} ${p.unit}`
                              }
                              onClick={() => {
                                // Open requisition modal — captures who/where/why
                                // for the deduction (replaces silent adjust call).
                                // Modal pre-fills quantity from the inline input.
                                if (!valid || !canUse) return;
                                setReqTarget(p);
                              }}
                            >ใช้</button>
                            <button
                              type="button"
                              className="ac-parts-quick-btn ac-parts-quick-add"
                              disabled={busy}
                              title="บันทึกซื้อเข้า — จดจำนวน + ราคาที่จ่าย เห็นแนวโน้มต้นทุน"
                              onClick={() => {
                                // v3.28: เติม = ซื้อเข้า → เปิดโมดัลจดราคา
                                // (แก้สต๊อกเฉยๆ เพราะนับผิด ใช้ปุ่ม +/− ทีละชิ้น)
                                setPurchaseQty(valid ? String(n) : "");
                                setPurchaseTarget(p);
                                setVal("");
                              }}
                            >เติม</button>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="ac-parts-num">{p.threshold || "—"}</td>
                    <td className="ac-parts-num">
                      {p.price && p.price > 0 ? p.price.toLocaleString("th-TH") : "—"}
                      {(() => {
                        const pct = trendByPart.get(p.id);
                        if (!pct) return null;
                        return (
                          <span
                            className={pct > 0 ? "ac-buy-up" : "ac-buy-down"}
                            title={`เทียบการซื้อครั้งก่อน ${pct > 0 ? "แพงขึ้น" : "ถูกลง"} ${Math.abs(pct)}%`}
                          > {pct > 0 ? `▲${pct}%` : `▼${Math.abs(pct)}%`}</span>
                        );
                      })()}
                    </td>
                    <td className="ac-parts-num ac-parts-value">
                      {p.price && p.price > 0
                        ? (p.price * p.stock).toLocaleString("th-TH")
                        : "—"}
                    </td>
                    <td>
                      <span className="ac-parts-time" title={p.updatedAt || p.createdAt}>
                        {(p.updatedAt || p.createdAt || "—").split(" ")[0]}
                      </span>
                    </td>
                    {canWrite && (
                      <td>
                        <div className="ac-parts-row-actions">
                          <button
                            type="button"
                            className="ac-btn ac-btn-ghost ac-btn-sm"
                            onClick={() => setHistoryTarget(p)}
                            title="ดูประวัติการเบิก"
                          >ประวัติ</button>
                          <button
                            type="button"
                            className="ac-btn ac-btn-ghost ac-btn-sm"
                            onClick={() => setEditTarget(p)}
                          >แก้ไข</button>
                        </div>
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
        onSaved={() => { bustView(PARTS_CACHE_KEY); load(); }}
      />
      <AddPartModal
        open={!!editTarget}
        initial={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => { bustView(PARTS_CACHE_KEY); load(); }}
      />
      <RequisitionModal
        open={!!reqTarget}
        part={reqTarget}
        rooms={rooms}
        onClose={() => setReqTarget(null)}
        onSaved={() => { bustView(PARTS_CACHE_KEY); load(); }}
      />
      <RequisitionHistoryModal
        open={!!historyTarget}
        part={historyTarget}
        onClose={() => setHistoryTarget(null)}
      />
      <ReceiptScanModal
        open={scanOpen}
        parts={rows || []}
        onClose={() => setScanOpen(false)}
        onSaved={() => { bustView(PARTS_CACHE_KEY); void load(); void loadPurchases(); }}
      />
      <PurchaseModal
        open={!!purchaseTarget}
        part={purchaseTarget}
        initialQty={purchaseQty}
        onClose={() => setPurchaseTarget(null)}
        onSaved={() => { bustView(PARTS_CACHE_KEY); void load(); void loadPurchases(); }}
      />
    </section>
  );
}
