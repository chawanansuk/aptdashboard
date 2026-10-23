"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Role } from "@/auth";
import type { RoomView } from "@/types";
import { Icon } from "@/lib/icons";
import { toast } from "@/lib/toast";
import { canPerform } from "@/lib/permissions";
import { THAI_MONTHS, bangkokTodayYmd } from "@/lib/dateUtils";
import { parsePriceOr0 } from "@/lib/money";
import { apartmentNameFor, bankFor } from "@/lib/bookingConfig";
import {
  billMessage, computeBill, currentMonthKey, dueDateOf, monthLabel, parseReading, rateFor,
  shiftMonth, summarize,
  type BillInput, type BillResult, type BillingRate, type MeterRow,
} from "@/lib/billing";
import PageHeader from "./PageHeader";
import ErrorBanner from "./ErrorBanner";
import LoadingState from "./LoadingState";
import EmptyState from "./EmptyState";

/**
 * 🧾 บิลค่าเช่า — meter readings → monthly bill → who has paid.
 *
 * Three tabs:
 *   จดมิเตอร์      every billing role. Type this month's numbers, see the
 *                  units at once; one save for the whole round.
 *   บิล & การจ่าย  managers. Totals, copy a room's bill for LINE, mark paid.
 *   อัตรา          managers. Per-building ฿/unit, water minimum, due day.
 *
 * The amounts on screen are a preview — /api/billing recomputes them from
 * the rates in the sheet on save (lib/billing is shared by both). Readers
 * without finance.view get no baht from the API at all.
 */

interface Props {
  rooms: RoomView[];
  roles: Role[];
  activeBuilding: string;
}

interface BillingData {
  finance: boolean;
  month: string;
  rows: MeterRow[];
  prevRows: Pick<MeterRow, "building" | "room" | "elecCur" | "waterCur">[];
  rates: BillingRate[];
}

type Tab = "read" | "bills" | "rates";
type ReadingField = "elecPrev" | "elecCur" | "waterPrev" | "waterCur";
type Draft = Partial<Record<ReadingField, string>>;
type BillFilter = "all" | "unpaid" | "paid" | "incomplete";

/** One billable room this month: someone lives there, or the sheet
 *  already has a row for it. */
interface Line {
  key: string;
  building: string;
  room: string;
  view?: RoomView;
  row?: MeterRow;
  /** Last month's closing reading — this month's start when the row has none. */
  prevElec: number | null;
  prevWater: number | null;
  rate: BillingRate | null;
  /** The room's listed price — rent when the row has none. */
  listPrice: number | null;
}

interface BillState {
  input: BillInput;
  bill: BillResult;
  /** What the room owes: the sheet's figure, else the computed one. */
  total: number | null;
  /** Computable now but not in the sheet yet (e.g. rates set after the readings). */
  needsSave: boolean;
  paidDate: string;
  status: "paid" | "overdue" | "unpaid" | "incomplete";
}

const ALL = "ทั้งหมด";
const lineKey = (b: string, r: string) => `${b.trim()}|${r.trim()}`;
const baht = (n: number) => `${n.toLocaleString("th-TH")} ฿`;
const reading = (n: number | null) => (n === null ? "—" : n.toLocaleString("th-TH", { maximumFractionDigits: 2 }));
const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function shortDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${+m[3]} ${THAI_MONTHS[+m[2] - 1]}` : ymd;
}

const byRoom = (a: Line, b: Line) =>
  a.building.localeCompare(b.building, "th") || a.room.localeCompare(b.room, "th", { numeric: true });

async function postBilling(body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch("/api/billing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.ok) throw new Error(j?.error || `บันทึกไม่สำเร็จ (${res.status})`);
  return j;
}

/** Readings shown for a room: the draft when typed, else what the sheet has. */
function readingsOf(l: Line, d: Draft | undefined) {
  const v = (f: ReadingField, base: number | null) => (d?.[f] !== undefined ? parseReading(d[f]) : base);
  return {
    elecPrev: v("elecPrev", l.row?.elecPrev ?? l.prevElec),
    elecCur: v("elecCur", l.row?.elecCur ?? null),
    waterPrev: v("waterPrev", l.row?.waterPrev ?? l.prevWater),
    waterCur: v("waterCur", l.row?.waterCur ?? null),
  };
}

const FIELDS: ReadingField[] = ["elecPrev", "elecCur", "waterPrev", "waterCur"];

/** Typed something that isn't a number ("12a", "-5"). */
function invalidFields(d: Draft | undefined): ReadingField[] {
  if (!d) return [];
  return FIELDS.filter((f) => (d[f] ?? "").trim() !== "" && parseReading(d[f]) === null);
}

/** Fields the user actually changed (a draft equal to the sheet is not a
 *  change). A typo counts — it must block the save, not vanish. */
function changedFields(l: Line, d: Draft | undefined): ReadingField[] {
  if (!d) return [];
  const base = readingsOf(l, undefined);
  const bad = invalidFields(d);
  return FIELDS.filter((f) => d[f] !== undefined && (bad.includes(f) || parseReading(d[f]) !== base[f]));
}

function billStateOf(l: Line, monthDue: Date | null, today: string): BillState {
  const r = l.row;
  const input: BillInput = {
    elecPrev: r?.elecPrev ?? l.prevElec,
    elecCur: r?.elecCur ?? null,
    waterPrev: r?.waterPrev ?? l.prevWater,
    waterCur: r?.waterCur ?? null,
    rent: r?.rent ?? l.listPrice,
    keyFee: r?.keyFee ?? null,
    parking: r?.parking ?? null,
    other: r?.other ?? null,
  };
  const computed = computeBill(input, l.rate);
  // The sheet's own figures win — it may hold formulas or hand edits the
  // owner trusts; the computed bill only fills what is missing.
  const bill: BillResult = {
    ...computed,
    elecUnits: r?.elecUnits ?? computed.elecUnits,
    elecCost: r?.elecCost ?? computed.elecCost,
    waterUnits: r?.waterUnits ?? computed.waterUnits,
    waterCost: r?.waterCost ?? computed.waterCost,
  };
  const total = r?.total ?? computed.total;
  bill.total = total;
  const paidDate = r?.paidDate ?? "";
  const due = monthDue ? ymdOf(monthDue) : "";
  const status: BillState["status"] = paidDate ? "paid"
    : total === null ? "incomplete"
    : due && today > due ? "overdue"
    : "unpaid";
  return { input, bill, total, needsSave: (r?.total ?? null) === null && computed.total !== null, paidDate, status };
}

export default function BillingView({ rooms, roles, activeBuilding }: Props) {
  // The building comes from the header's switcher, like every other page.
  const building = activeBuilding || ALL;
  const finance = canPerform(roles, "finance.view");
  const [month, setMonth] = useState(() => currentMonthKey());
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("read");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [editingPrev, setEditingPrev] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<BillFilter>("all");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [openExtras, setOpenExtras] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async (m: string) => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/billing?month=${m}`, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || `โหลดไม่สำเร็จ (${res.status})`);
      if (id === reqId.current) setData(j as BillingData);
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(month); }, [month, load]);

  const buildings = useMemo(() => {
    const s = new Set(rooms.map((r) => r.building).filter(Boolean));
    for (const r of data?.rows ?? []) s.add(r.building);
    return [...s].sort((a, b) => a.localeCompare(b, "th"));
  }, [rooms, data]);

  const thisMonth = currentMonthKey();
  const allLines = useMemo<Line[]>(() => {
    if (!data || data.month !== month) return [];
    const rowsBy = new Map(data.rows.map((r) => [lineKey(r.building, r.room), r]));
    const prevBy = new Map(data.prevRows.map((r) => [lineKey(r.building, r.room), r]));
    const out = new Map<string, Line>();
    const add = (b: string, room: string, view?: RoomView) => {
      const k = lineKey(b, room);
      if (out.has(k)) return;
      const p = view ? parsePriceOr0(view.price) : 0;
      out.set(k, {
        key: k, building: b.trim(), room: room.trim(), view,
        row: rowsBy.get(k),
        prevElec: prevBy.get(k)?.elecCur ?? null,
        prevWater: prevBy.get(k)?.waterCur ?? null,
        rate: rateFor(data.rates, b),
        listPrice: p > 0 ? p : null,
      });
    };
    // Today's occupancy only says who to bill for this month (or later);
    // a past month is exactly what the sheet holds.
    const current = month >= thisMonth;
    for (const v of rooms) {
      const k = lineKey(v.building, v.room);
      if (rowsBy.has(k) || (current && (v.status === "occupied" || v.status === "moveout"))) add(v.building, v.room, v);
    }
    for (const r of data.rows) add(r.building, r.room);
    return [...out.values()].sort(byRoom);
  }, [data, rooms, month, thisMonth]);

  const lines = useMemo(
    () => (building === ALL ? allLines : allLines.filter((l) => l.building === building)),
    [allLines, building],
  );

  const dirty = useMemo(
    () => allLines.filter((l) => changedFields(l, drafts[l.key]).length > 0),
    [allLines, drafts],
  );

  // Don't lose a round of readings to a closed tab.
  useEffect(() => {
    if (dirty.length === 0) return;
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty.length]);

  const changeMonth = (delta: number) => {
    if (dirty.length > 0 && !window.confirm(`ยังไม่ได้บันทึกเลขมิเตอร์ ${dirty.length} ห้อง — เปลี่ยนเดือนแล้วตัวเลขที่จดไว้จะหาย`)) return;
    setDrafts({});
    setEditingPrev({});
    setOpenExtras(null);
    setMonth((m) => shiftMonth(m, delta));
  };

  const setDraft = (k: string, f: ReadingField, v: string) =>
    setDrafts((d) => ({ ...d, [k]: { ...d[k], [f]: v } }));

  /* ------------------------------------------------------------ save readings */

  const saveReadings = async () => {
    const bad = dirty.filter((l) => invalidFields(drafts[l.key]).length > 0);
    if (bad.length > 0) {
      toast.error(`ตัวเลขไม่ถูกต้อง: ห้อง ${bad.map((l) => l.room).join(", ")}`, { description: "ใส่เฉพาะตัวเลข เช่น 1234 หรือ 1234.5" });
      return;
    }
    setSaving(true);
    try {
      const items = dirty.map((l) => {
        const d = drafts[l.key]!;
        const it: Record<string, unknown> = { building: l.building, room: l.room, roomPrice: l.listPrice };
        for (const f of changedFields(l, d)) it[f] = parseReading(d[f]);
        return it;
      });
      const j = await postBilling({ action: "saveReadings", month, items });
      const results = (j.results as { room: string; problems: string[] }[] | undefined) ?? [];
      const backwards = results.filter((r) => r.problems.some((p) => p.includes("น้อยกว่าเดิม")));
      setDrafts({});
      setEditingPrev({});
      toast.success(`บันทึกมิเตอร์ ${items.length} ห้องแล้ว`);
      if (backwards.length > 0) {
        toast.warning(`เลขใหม่น้อยกว่าเลขเดิม: ห้อง ${backwards.map((r) => r.room).join(", ")}`, {
          description: "บันทึกเลขไว้แล้วแต่ยังไม่คิดหน่วย — ตรวจตัวเลข หรือถ้าเปลี่ยนมิเตอร์ให้แก้ \"เลขเดิม\"",
        });
      }
      await load(month);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------------------------------------ bills */

  const rateOfScope = building === ALL ? null : rateFor(data?.rates ?? [], building);
  const today = bangkokTodayYmd();
  const bills = useMemo(
    () => lines.map((l) => ({ line: l, st: billStateOf(l, l.rate ? dueDateOf(month, l.rate.dueDay) : null, today) })),
    [lines, month, today],
  );
  const summary = useMemo(() => summarize(bills.map((b) => ({ total: b.st.total, paidDate: b.st.paidDate }))), [bills]);
  const counts = useMemo(() => ({
    all: bills.length,
    unpaid: bills.filter((b) => b.st.status === "unpaid" || b.st.status === "overdue").length,
    paid: bills.filter((b) => b.st.status === "paid").length,
    incomplete: bills.filter((b) => b.st.status === "incomplete").length,
  }), [bills]);
  const overdue = bills.filter((b) => b.st.status === "overdue").length;
  const needsSave = bills.filter((b) => b.st.needsSave);
  const shownBills = bills.filter((b) =>
    filter === "all" ? true
    : filter === "unpaid" ? b.st.status === "unpaid" || b.st.status === "overdue"
    : b.st.status === filter);

  const copyBill = async (l: Line, st: BillState) => {
    if (!l.rate || st.total === null) return;
    const text = billMessage({
      month, room: l.room, apartmentName: apartmentNameFor(l.building),
      input: st.input, bill: st.bill, rate: l.rate, bank: bankFor(l.building),
    });
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`คัดลอกบิลห้อง ${l.room} แล้ว`, { description: "วางในแชท LINE ของผู้เช่าได้เลย" });
    } catch {
      toast.error("คัดลอกไม่ได้ — เบราว์เซอร์ไม่อนุญาต");
    }
  };

  const setPaid = async (l: Line, paidDate: string) => {
    setBusyKey(l.key);
    try {
      await postBilling({ action: "setPaid", month, building: l.building, room: l.room, paidDate });
      // The sheet is the truth, but a reload per tap is slow on a phone —
      // patch the row; the next load brings the sheet's version anyway.
      setData((d) => d && {
        ...d,
        rows: d.rows.map((r) => (lineKey(r.building, r.room) === l.key ? { ...r, paidDate } : r)),
      });
      toast.success(paidDate ? `ห้อง ${l.room} จ่ายแล้ว` : `ยกเลิกรับเงินห้อง ${l.room}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusyKey(null);
    }
  };

  const saveTotals = async () => {
    setSaving(true);
    try {
      await postBilling({
        action: "saveReadings", month,
        items: needsSave.map(({ line: l }) => ({ building: l.building, room: l.room, roomPrice: l.listPrice })),
      });
      toast.success(`บันทึกยอด ${needsSave.length} ห้องลงชีตแล้ว`);
      await load(month);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------------------------------------ render */

  const tabs: { key: Tab; label: string; icon: "light" | "receipt" | "settings" }[] = finance
    ? [
        { key: "read", label: "จดมิเตอร์", icon: "light" },
        { key: "bills", label: "บิล & การจ่าย", icon: "receipt" },
        { key: "rates", label: "อัตรา", icon: "settings" },
      ]
    : [];
  const recorded = lines.filter((l) => l.row?.elecCur != null || l.row?.waterCur != null).length;

  return (
    <div className="ac-billing">
      <PageHeader
        title={`บิลค่าเช่า${building !== ALL ? ` · ${building}` : ""}`}
        icon="receipt"
        subtitle={finance
          ? "จดมิเตอร์ → ระบบคิดบิลตามอัตราของตึก → คัดลอกส่ง LINE → ติ๊กว่าจ่ายแล้ว (เก็บในชีต \"มิเตอร์\")"
          : "จดเลขมิเตอร์ไฟ/น้ำของแต่ละห้อง แล้วกดบันทึกครั้งเดียว"}
      />

      <div className="ac-billing-bar">
        <div className="ac-billing-month" role="group" aria-label="เลือกเดือน">
          <button type="button" className="ac-btn ac-btn-ghost" onClick={() => changeMonth(-1)} aria-label="เดือนก่อน">‹</button>
          <strong aria-live="polite">{monthLabel(month)}</strong>
          <button type="button" className="ac-btn ac-btn-ghost" onClick={() => changeMonth(1)} aria-label="เดือนถัดไป">›</button>
        </div>
      </div>

      {tabs.length > 0 && (
        <div className="ac-chips ac-billing-tabs" role="tablist" aria-label="ส่วนของบิล">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
              className={`ac-chip ${tab === t.key ? "is-active" : ""}`}
              onClick={() => setTab(t.key)}>
              <Icon name={t.icon} /> {t.label}
              {t.key === "bills" && overdue > 0 && <span className="ac-chip-count">{overdue}</span>}
            </button>
          ))}
        </div>
      )}

      <ErrorBanner message={error} onRetry={() => void load(month)} />
      {loading && !data && <LoadingState label="กำลังโหลดชีตมิเตอร์…" />}
      {data && rateOfScope === null && building !== ALL && finance && tab !== "rates" && (
        <p className="ac-billing-notice">
          <Icon name="alert" />
          ตึก {building} ยังไม่ได้ตั้งอัตราค่าไฟ/น้ำ — จดมิเตอร์ได้ตามปกติ แต่ระบบจะยังไม่คิดเงินจนกว่าจะตั้งที่แท็บ <strong>อัตรา</strong>
        </p>
      )}

      {data && tab === "read" && (
        <ReadingTab
          lines={lines}
          drafts={drafts}
          finance={finance}
          editingPrev={editingPrev}
          recorded={recorded}
          showBuildings={building === ALL && new Set(lines.map((l) => l.building)).size > 1}
          onDraft={setDraft}
          onEditPrev={(k) => setEditingPrev((s) => ({ ...s, [k]: true }))}
        />
      )}

      {data && finance && tab === "bills" && (
        <section className="ac-billing-bills">
          <div className="ac-overview-cards ac-billing-summary">
            <div className="ac-overview-card">
              <div className="ac-overview-card-label">เรียกเก็บ</div>
              <div className="ac-overview-card-value">{baht(summary.billed)}</div>
              <div className="ac-overview-card-sub">{summary.rooms} ห้อง</div>
            </div>
            <div className="ac-overview-card">
              <div className="ac-overview-card-label">รับแล้ว</div>
              <div className="ac-overview-card-value">{baht(summary.collected)}</div>
              <div className="ac-overview-card-sub">{summary.paidRooms} ห้อง</div>
            </div>
            <div className={`ac-overview-card ${summary.outstanding > 0 ? "ac-overview-card-danger" : ""}`}>
              <div className="ac-overview-card-label">ยังค้าง</div>
              <div className="ac-overview-card-value">{baht(summary.outstanding)}</div>
              <div className="ac-overview-card-sub">{summary.rooms - summary.paidRooms} ห้อง{overdue > 0 ? ` · เลยกำหนด ${overdue}` : ""}</div>
            </div>
            <div className="ac-overview-card">
              <div className="ac-overview-card-label">ยังคิดบิลไม่ได้</div>
              <div className="ac-overview-card-value">{counts.incomplete}</div>
              <div className="ac-overview-card-sub">ห้อง · ขาดเลขมิเตอร์/อัตรา</div>
            </div>
          </div>

          {needsSave.length > 0 && (
            <div className="ac-billing-notice">
              <Icon name="alert" />
              <span>มี {needsSave.length} ห้องที่คิดยอดได้แล้วแต่ยังไม่ได้ลงชีต (เช่น ตั้งอัตราหลังจดมิเตอร์)</span>
              <button type="button" className="ac-btn ac-btn-primary" disabled={saving} onClick={() => void saveTotals()}>
                {saving ? "กำลังบันทึก…" : "บันทึกยอดลงชีต"}
              </button>
            </div>
          )}

          <div className="ac-chips" role="group" aria-label="กรองบิล">
            {([
              ["all", "ทั้งหมด"], ["unpaid", "ค้างจ่าย"], ["paid", "จ่ายแล้ว"], ["incomplete", "ยังไม่ครบ"],
            ] as [BillFilter, string][]).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={filter === k}
                className={`ac-chip ${filter === k ? "is-active" : ""}`}
                onClick={() => setFilter(k)}>
                {label} <span className="ac-chip-count">{counts[k]}</span>
              </button>
            ))}
          </div>

          {shownBills.length === 0 ? (
            <EmptyState compact icon="rooms" title="ไม่มีห้องในรายการนี้" />
          ) : (
            <ul className="ac-billing-list">
              {shownBills.map(({ line: l, st }) => (
                <BillRow
                  key={l.key}
                  line={l}
                  st={st}
                  month={month}
                  showBuilding={building === ALL}
                  busy={busyKey === l.key}
                  open={openExtras === l.key}
                  onToggle={() => setOpenExtras((k) => (k === l.key ? null : l.key))}
                  onCopy={() => void copyBill(l, st)}
                  onPaid={(d) => void setPaid(l, d)}
                  onSaved={() => { setOpenExtras(null); void load(month); }}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {data && finance && tab === "rates" && (
        <RatesTab
          buildings={building === ALL ? buildings : [building]}
          rates={data.rates}
          onSaved={() => void load(month)}
        />
      )}

      {tab === "read" && dirty.length > 0 && (
        <div className="ac-billing-savebar" role="region" aria-label="บันทึกมิเตอร์">
          <span>ยังไม่บันทึก <strong>{dirty.length}</strong> ห้อง</span>
          <button type="button" className="ac-btn ac-btn-ghost" disabled={saving}
            onClick={() => { setDrafts({}); setEditingPrev({}); }}>ล้าง</button>
          <button type="button" className="ac-btn ac-btn-primary" disabled={saving} onClick={() => void saveReadings()}>
            {saving ? "กำลังบันทึก…" : `บันทึก ${dirty.length} ห้อง`}
          </button>
        </div>
      )}

    </div>
  );
}

/* ================================================================ จดมิเตอร์ */

function ReadingTab({
  lines, drafts, finance, editingPrev, recorded, showBuildings, onDraft, onEditPrev,
}: {
  lines: Line[];
  drafts: Record<string, Draft>;
  finance: boolean;
  editingPrev: Record<string, boolean>;
  recorded: number;
  showBuildings: boolean;
  onDraft: (k: string, f: ReadingField, v: string) => void;
  onEditPrev: (k: string) => void;
}) {
  if (lines.length === 0) {
    return (
      <EmptyState
        icon="rooms"
        title="ไม่มีห้องที่ต้องจดในเดือนนี้"
        description="ระบบแสดงห้องที่มีผู้เช่า/แจ้งย้ายออก และห้องที่มีแถวในชีตมิเตอร์ของเดือนนี้แล้ว"
      />
    );
  }

  // Enter = next box, so a whole floor can be typed without touching the screen.
  const nextOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const all = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-meter]"));
    all[all.indexOf(e.currentTarget) + 1]?.focus();
  };

  let lastBuilding = "";
  return (
    <section className="ac-billing-read">
      <p className="ac-billing-progress">
        จดแล้ว <strong>{recorded}</strong> / {lines.length} ห้อง
        <span className="ac-billing-progress-bar" role="img" aria-label={`จดแล้ว ${recorded} จาก ${lines.length} ห้อง`}>
          <span style={{ width: `${lines.length ? (recorded / lines.length) * 100 : 0}%` }} />
        </span>
      </p>
      <ul className="ac-billing-rooms">
        {lines.map((l) => {
          const d = drafts[l.key];
          const vals = readingsOf(l, d);
          const preview = computeBill({
            ...vals,
            rent: l.row?.rent ?? l.listPrice,
            keyFee: l.row?.keyFee ?? null, parking: l.row?.parking ?? null, other: l.row?.other ?? null,
          }, l.rate);
          const changed = changedFields(l, d).length > 0;
          const invalid = invalidFields(d);
          const done = vals.elecCur !== null || vals.waterCur !== null;
          const backwards = preview.problems.filter((p) => p.includes("น้อยกว่าเดิม"));
          const header = showBuildings && l.building !== lastBuilding ? l.building : null;
          lastBuilding = l.building;
          const meter = (kind: "elec" | "water") => {
            const prevF: ReadingField = kind === "elec" ? "elecPrev" : "waterPrev";
            const curF: ReadingField = kind === "elec" ? "elecCur" : "waterCur";
            const prev = vals[prevF];
            const units = kind === "elec" ? preview.elecUnits : preview.waterUnits;
            const label = kind === "elec" ? "ไฟ" : "น้ำ";
            const showPrevInput = prev === null || editingPrev[l.key] || d?.[prevF] !== undefined;
            return (
              <div className="ac-billing-meter">
                <span className="ac-billing-meter-label"><Icon name={kind === "elec" ? "light" : "water"} /> {label}</span>
                {showPrevInput ? (
                  <input
                    data-meter
                    className={`ac-billing-input is-prev ${invalid.includes(prevF) ? "is-invalid" : ""}`}
                    inputMode="decimal" enterKeyHint="next" autoComplete="off"
                    placeholder="เลขเดิม"
                    aria-label={`ห้อง ${l.room} มิเตอร์${label}เดิม`}
                    value={d?.[prevF] ?? (prev === null ? "" : String(prev))}
                    onChange={(e) => onDraft(l.key, prevF, e.target.value)}
                    onKeyDown={nextOnEnter}
                  />
                ) : (
                  <button type="button" className="ac-billing-prev" onClick={() => onEditPrev(l.key)}
                    title="แตะเพื่อแก้เลขเดิม (เช่น เปลี่ยนมิเตอร์ใหม่)"
                    aria-label={`ห้อง ${l.room} มิเตอร์${label}เดิม ${reading(prev)} — แตะเพื่อแก้`}>
                    {reading(prev)}
                  </button>
                )}
                <span className="ac-billing-arrow" aria-hidden>→</span>
                <input
                  data-meter
                  className={`ac-billing-input ${invalid.includes(curF) ? "is-invalid" : ""}`}
                  inputMode="decimal" enterKeyHint="next" autoComplete="off"
                  placeholder="เลขใหม่"
                  aria-label={`ห้อง ${l.room} มิเตอร์${label}ใหม่`}
                  value={d?.[curF] ?? (l.row?.[curF] == null ? "" : String(l.row[curF]))}
                  onChange={(e) => onDraft(l.key, curF, e.target.value)}
                  onKeyDown={nextOnEnter}
                />
                <span className="ac-billing-units">{units === null ? "" : `${reading(units)} หน่วย`}</span>
              </div>
            );
          };
          return (
            <Fragment key={l.key}>
            {header && <li className="ac-billing-building"><h3>{header}</h3></li>}
            <li className={`ac-billing-room ${changed ? "is-changed" : ""} ${done ? "is-done" : ""}`}>
              <div className="ac-billing-room-head">
                <strong>ห้อง {l.room}</strong>
                {l.view?.status === "moveout" && <span className="ac-billing-tag">แจ้งย้ายออก</span>}
                {changed ? <span className="ac-billing-tag is-changed">ยังไม่บันทึก</span>
                  : done ? <span className="ac-billing-tag is-done"><Icon name="check" /> จดแล้ว</span> : null}
                {finance && preview.total !== null && (
                  <span className="ac-billing-room-total" title="ค่าเช่า + ไฟ + น้ำ + อื่นๆ">≈ {baht(preview.total)}</span>
                )}
              </div>
              {meter("elec")}
              {meter("water")}
              {backwards.map((p) => <p key={p} className="ac-billing-problem"><Icon name="warning" /> {p}</p>)}
            </li>
            </Fragment>
          );
        })}
      </ul>
    </section>
  );
}

/* ================================================================ บิล */

const STATUS_LABEL: Record<BillState["status"], string> = {
  paid: "จ่ายแล้ว", overdue: "เลยกำหนด", unpaid: "ค้างจ่าย", incomplete: "ยังไม่ครบ",
};

function BillRow({
  line: l, st, month, showBuilding, busy, open, onToggle, onCopy, onPaid, onSaved,
}: {
  line: Line;
  st: BillState;
  month: string;
  showBuilding: boolean;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  onCopy: () => void;
  onPaid: (paidDate: string) => void;
  onSaved: () => void;
}) {
  return (
    <li className={`ac-billing-bill is-${st.status}`}>
      <div className="ac-billing-bill-main">
        <div className="ac-billing-bill-who">
          <strong>{showBuilding ? `${l.building} · ` : ""}ห้อง {l.room}</strong>
          {l.view?.tenant && <span className="ac-billing-bill-tenant">{l.view.tenant}</span>}
        </div>
        <div className="ac-billing-bill-amount">{st.total === null ? "—" : baht(st.total)}</div>
        <span className={`ac-billing-pill is-${st.status}`}>
          {STATUS_LABEL[st.status]}{st.status === "paid" && st.paidDate ? ` ${shortDate(st.paidDate)}` : ""}
        </span>
      </div>
      {st.status === "incomplete" && st.bill.problems.length > 0 && (
        <p className="ac-billing-bill-missing">{st.bill.problems.join(" · ")}</p>
      )}
      <div className="ac-billing-bill-actions">
        {/* An incomplete bill can't be sent or paid — show only what fixes it. */}
        {st.total !== null && l.rate && (
          <button type="button" className="ac-btn ac-btn-ghost" onClick={onCopy}>
            <Icon name="clipboard" /> คัดลอกบิล
          </button>
        )}
        {st.status === "incomplete" ? null : st.paidDate ? (
          <button type="button" className="ac-btn ac-btn-ghost" disabled={busy} onClick={() => onPaid("")}>
            <Icon name="undo" /> ยกเลิกรับเงิน
          </button>
        ) : (
          <button type="button" className="ac-btn ac-btn-primary" disabled={busy || !l.row || st.total === null}
            title={!l.row ? "จดมิเตอร์ก่อน — ชีตยังไม่มีแถวของห้องนี้" : undefined}
            onClick={() => onPaid(bangkokTodayYmd())}>
            <Icon name="check" /> รับเงินแล้ว
          </button>
        )}
        <button type="button" className="ac-btn ac-btn-ghost ac-billing-edit" aria-expanded={open} onClick={onToggle}
          aria-label={`แก้ค่าเช่า/รายการห้อง ${l.room}`} title="ค่าเช่า · จอดรถ · กุญแจ · อื่นๆ · หมายเหตุ">
          <Icon name="edit" /> <span>รายการ</span>
        </button>
      </div>
      {open && <ExtrasForm line={l} month={month} onSaved={onSaved} />}
    </li>
  );
}

function ExtrasForm({ line: l, month, onSaved }: { line: Line; month: string; onSaved: () => void }) {
  const r = l.row;
  const init = (v: number | null | undefined) => (v == null ? "" : String(v));
  const [f, setF] = useState({
    rent: init(r?.rent ?? l.listPrice), keyFee: init(r?.keyFee), parking: init(r?.parking), other: init(r?.other),
    note: r?.note ?? "",
  });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const money = { rent: f.rent, keyFee: f.keyFee, parking: f.parking, other: f.other };
    const parsed: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(money)) {
      const n = parseReading(v);
      if (v.trim() !== "" && n === null) { toast.error("ใส่เฉพาะตัวเลข"); return; }
      parsed[k] = n;
    }
    setSaving(true);
    try {
      await postBilling({
        action: "saveReadings", month,
        items: [{ building: l.building, room: l.room, roomPrice: l.listPrice, ...parsed, note: f.note.trim() }],
      });
      toast.success(`บันทึกรายการห้อง ${l.room} แล้ว`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };
  const field = (k: "rent" | "keyFee" | "parking" | "other", label: string) => (
    <label className="ac-field">
      <span>{label}</span>
      <input inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );
  return (
    <div className="ac-billing-extras">
      <div className="ac-billing-extras-grid">
        {field("rent", "ค่าเช่า")}
        {field("parking", "ค่าจอดรถ")}
        {field("keyFee", "กุญแจสำรอง")}
        {field("other", "อื่นๆ")}
      </div>
      <label className="ac-field">
        <span>หมายเหตุ</span>
        <input value={f.note} maxLength={300} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </label>
      <div className="ac-billing-extras-foot">
        <span className="ac-billing-hint">ยอดรวมคิดใหม่ให้เองตอนบันทึก</span>
        <button type="button" className="ac-btn ac-btn-primary" disabled={saving} onClick={() => void save()}>
          {saving ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </div>
    </div>
  );
}

/* ================================================================ อัตรา */

function RatesTab({ buildings, rates, onSaved }: { buildings: string[]; rates: BillingRate[]; onSaved: () => void }) {
  return (
    <section className="ac-billing-rates">
      <p className="ac-billing-hint">
        ค่าน้ำแบบเหมาจ่าย: ใส่ &quot;ค่าน้ำ/หน่วย&quot; = 0 แล้วใส่ยอดเหมาในช่อง &quot;ขั้นต่ำ&quot; ·
        ไม่เก็บค่าไฟแยก: ใส่ค่าไฟ/หน่วย = 0 · เปลี่ยนอัตราแล้วมีผลกับการบันทึกครั้งถัดไป (บิลที่ลงชีตแล้วไม่เปลี่ยนเอง)
      </p>
      <div className="ac-billing-rate-list">
        {buildings.map((b) => <RateForm key={b} building={b} rate={rateFor(rates, b)} onSaved={onSaved} />)}
      </div>
    </section>
  );
}

function RateForm({ building, rate, onSaved }: { building: string; rate: BillingRate | null; onSaved: () => void }) {
  const [f, setF] = useState({
    elecRate: rate ? String(rate.elecRate) : "",
    waterRate: rate ? String(rate.waterRate) : "",
    waterMin: rate ? String(rate.waterMin) : "0",
    dueDay: rate ? String(rate.dueDay) : "5",
  });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const elecRate = parseReading(f.elecRate), waterRate = parseReading(f.waterRate);
    const waterMin = parseReading(f.waterMin || "0"), dueDay = Number(f.dueDay);
    if (elecRate === null || waterRate === null || waterMin === null) { toast.error("ใส่อัตราเป็นตัวเลข (0 ได้)"); return; }
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) { toast.error("วันครบกำหนดต้องเป็น 1–31"); return; }
    setSaving(true);
    try {
      await postBilling({ action: "setRate", building, elecRate, waterRate, waterMin, dueDay });
      toast.success(`บันทึกอัตราตึก ${building} แล้ว`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };
  const field = (k: keyof typeof f, label: string, suffix: string) => (
    <label className="ac-field">
      <span>{label}</span>
      <span className="ac-billing-suffix">
        <input inputMode={k === "dueDay" ? "numeric" : "decimal"} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        <em>{suffix}</em>
      </span>
    </label>
  );
  return (
    <div className="ac-billing-rate">
      <h3>
        {building}
        {!rate && <span className="ac-billing-tag is-changed">ยังไม่ได้ตั้ง</span>}
      </h3>
      <div className="ac-billing-extras-grid">
        {field("elecRate", "ค่าไฟ/หน่วย", "฿")}
        {field("waterRate", "ค่าน้ำ/หน่วย", "฿")}
        {field("waterMin", "ค่าน้ำขั้นต่ำ/เหมา", "฿")}
        {field("dueDay", "ชำระภายในวันที่", "ของเดือนถัดไป")}
      </div>
      <div className="ac-billing-extras-foot">
        <button type="button" className="ac-btn ac-btn-primary" disabled={saving} onClick={() => void save()}>
          {saving ? "กำลังบันทึก…" : "บันทึกอัตรา"}
        </button>
      </div>
    </div>
  );
}
