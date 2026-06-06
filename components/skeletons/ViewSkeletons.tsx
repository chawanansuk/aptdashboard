"use client";

import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import salesStyles from "@/components/sales/sales.module.css";

/**
 * Per-view skeleton screens — used as Suspense fallbacks while the
 * lazy-loaded view chunks download, and also (in some cases) while
 * the view itself is waiting on data.
 *
 * Each skeleton is tuned to roughly match the final layout so the page
 * doesn't visually shift on first paint. We don't try to be pixel-perfect;
 * we just want the user to feel that "something is loading here" rather
 * than facing a blank screen.
 */

/* ====================================================================
 * Sales Pipeline v2 — deep-navy KPI row + split(board + rail).
 *
 * Reuses sales.module.css so the loading state shares the same canvas
 * (background, border-radius, padding, gap) as the live view. No CLS
 * when the lazy chunk swaps in. Inner content is just shimmer rects
 * inside the real layout containers — no need to repaint a different
 * theme just for the fallback.
 * ==================================================================== */
export function SalesPipelineSkeleton() {
  return (
    <section
      className={salesStyles.root}
      aria-busy="true"
      aria-label="กำลังโหลดภาพรวมขาย"
    >
      {/* Header — title + (legend-ish) row */}
      <header className={salesStyles.head}>
        <div className={salesStyles.titleWrap}>
          <Skeleton shape="text" width={160} height={22} ariaLabel="" />
          <Skeleton shape="text" width={240} ariaLabel="" style={{ display: "block", marginTop: 6 }} />
        </div>
        <div className={salesStyles.legend}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} shape="text" width={68} height={14} ariaLabel="" />
          ))}
        </div>
      </header>

      {/* KPI row — 4 cards */}
      <div className={salesStyles.kpiRow}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={salesStyles.kpiCard}>
            <div className={salesStyles.kpiTop}>
              <Skeleton shape="card" width={38} height={38} ariaLabel="" />
              <Skeleton shape="text" width={42} height={16} ariaLabel="" />
            </div>
            <Skeleton shape="text" width={64} height={28} ariaLabel="" style={{ display: "block" }} />
            <Skeleton shape="text" width="70%" ariaLabel="" style={{ display: "block" }} />
          </div>
        ))}
      </div>

      {/* Split — board (left) + rail (right) */}
      <div className={salesStyles.split}>
        {/* Board */}
        <div className={salesStyles.board}>
          <div className={salesStyles.boardHead}>
            <div className={salesStyles.boardTitleWrap}>
              <Skeleton shape="text" width={140} height={16} ariaLabel="" />
              <Skeleton shape="text" width={180} ariaLabel="" style={{ display: "block", marginTop: 4 }} />
            </div>
            <Skeleton shape="card" width={160} height={32} ariaLabel="" />
          </div>
          <div className={salesStyles.filters}>
            {[80, 88, 96].map((w, i) => (
              <Skeleton key={`s${i}`} shape="card" width={w} height={26} ariaLabel="" />
            ))}
            {[40, 40, 40, 40].map((w, i) => (
              <Skeleton key={`f${i}`} shape="card" width={w} height={26} ariaLabel="" />
            ))}
            <Skeleton shape="card" width={200} height={32} ariaLabel="" style={{ marginLeft: "auto" }} />
          </div>
          {/* Card-view shimmer: 2 buildings × 2 floors × cards */}
          <div className={salesStyles.cardScroll}>
            {[0, 1].map((b) => (
              <div key={b} className={salesStyles.cvBuilding}>
                <Skeleton shape="text" width={120} height={14} ariaLabel="" />
                {[0, 1].map((f) => (
                  <div key={f} className={salesStyles.cvFloor}>
                    <Skeleton shape="text" width={60} ariaLabel="" />
                    <div className={salesStyles.cvGrid}>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} shape="card" height={70} ariaLabel="" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Rail */}
        <div className={salesStyles.rail}>
          <div className={salesStyles.railHead}>
            <Skeleton shape="text" width={140} height={15} ariaLabel="" />
            <Skeleton shape="text" width={48} ariaLabel="" />
          </div>
          {[0, 1].map((d) => (
            <div key={d} className={salesStyles.railDay}>
              <Skeleton shape="text" width={90} height={13} ariaLabel="" />
              {[0, 1, 2].map((r) => (
                <div key={r} className={salesStyles.appt}>
                  <div className={salesStyles.apptMain}>
                    <Skeleton shape="text" width="55%" ariaLabel="" style={{ display: "block", marginBottom: 6 }} />
                    <Skeleton shape="text" width="40%" ariaLabel="" style={{ display: "block" }} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ====================================================================
 * Engineer Kanban — KPI strip + 4 columns
 * ==================================================================== */
export function EngineerKanbanSkeleton() {
  return (
    <section className="ac-kanban" aria-busy="true" aria-label="กำลังโหลดกระดานงานช่าง">
      <div className="ac-kanban-strip">
        {[0, 1, 2].map((i) => (
          <div key={i} className="ac-kanban-kpi ac-kanban-kpi-teal">
            <Skeleton width={32} height={22} ariaLabel="" />
            <Skeleton shape="text" width="80%" ariaLabel="" style={{ marginTop: 4 }} />
          </div>
        ))}
      </div>
      <div className="ac-kanban-board">
        {[0, 1, 2, 3].map((c) => (
          <div key={c} className="ac-kanban-col">
            <div className="ac-kanban-col-head" style={{ borderTopColor: "transparent" }}>
              <Skeleton shape="text" width={100} height={14} ariaLabel="" />
              <Skeleton shape="text" width={22} ariaLabel="" />
            </div>
            <div className="ac-kanban-col-body">
              {[0, 1, 2].map((card) => (
                <div key={card} className="ac-kanban-card">
                  <Skeleton shape="text" width="70%" ariaLabel="" style={{ display: "block", marginBottom: 6 }} />
                  <Skeleton shape="text" width="90%" ariaLabel="" style={{ display: "block", marginBottom: 6 }} />
                  <Skeleton shape="text" width="40%" ariaLabel="" style={{ display: "block" }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ====================================================================
 * Tenants — table of 10 rows
 * ==================================================================== */
export function TenantsSkeleton() {
  return (
    <section className="ac-skel-tenants" aria-busy="true" aria-label="กำลังโหลดผู้เช่า">
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
        <div key={i} className="ac-skel-tenant-row">
          <Skeleton shape="circle" width={40} height={40} ariaLabel="" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skeleton shape="text" width="40%" height={14} ariaLabel="" style={{ display: "block", marginBottom: 6 }} />
            <Skeleton shape="text" width="65%" ariaLabel="" style={{ display: "block" }} />
          </div>
          <Skeleton shape="text" width={70} ariaLabel="" />
        </div>
      ))}
    </section>
  );
}

/* ====================================================================
 * Calendar — month header + 6-row × 7-col grid
 * ==================================================================== */
export function CalendarSkeleton() {
  return (
    <section className="ac-skel-calendar" aria-busy="true" aria-label="กำลังโหลดปฏิทิน">
      <div className="ac-skel-calendar-head">
        <Skeleton shape="text" width={140} height={20} ariaLabel="" />
        <div style={{ display: "flex", gap: 8 }}>
          <Skeleton width={32} height={32} ariaLabel="" />
          <Skeleton width={32} height={32} ariaLabel="" />
        </div>
      </div>
      <div className="ac-skel-calendar-grid">
        {Array.from({ length: 42 }).map((_, i) => (
          <Skeleton key={i} shape="card" height={64} ariaLabel="" />
        ))}
      </div>
    </section>
  );
}

/* ====================================================================
 * Maintenance — list of 6 task cards
 * ==================================================================== */
export function MaintenanceSkeleton() {
  return (
    <section className="ac-skel-list" aria-busy="true" aria-label="กำลังโหลดรายการบำรุงรักษา">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="ac-skel-list-row">
          <Skeleton shape="circle" width={36} height={36} ariaLabel="" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skeleton shape="text" width="55%" height={14} ariaLabel="" style={{ display: "block", marginBottom: 6 }} />
            <Skeleton shape="text" width="80%" ariaLabel="" style={{ display: "block" }} />
          </div>
          <Skeleton shape="text" width={80} ariaLabel="" />
        </div>
      ))}
    </section>
  );
}

/* ====================================================================
 * Facilities — grid of 6 facility tiles
 * ==================================================================== */
export function FacilitiesSkeleton() {
  return (
    <section className="ac-skel-grid" aria-busy="true" aria-label="กำลังโหลดสาธารณูปโภค">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="ac-skel-grid-card">
          <div className="ac-skel-grid-card-head">
            <Skeleton shape="circle" width={32} height={32} ariaLabel="" />
            <Skeleton shape="text" width="50%" ariaLabel="" />
          </div>
          <SkeletonText lines={2} />
        </div>
      ))}
    </section>
  );
}

/* ====================================================================
 * Income — KPI row + chart placeholder
 * ==================================================================== */
export function IncomeSkeleton() {
  return (
    <section className="ac-skel-income" aria-busy="true" aria-label="กำลังโหลดรายได้">
      <div className="ac-skel-income-kpi">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="ac-skel-income-card">
            <Skeleton shape="text" width="50%" ariaLabel="" />
            <Skeleton shape="text" width="70%" height={26} ariaLabel="" style={{ marginTop: 8 }} />
          </div>
        ))}
      </div>
      <Skeleton shape="card" height={280} ariaLabel="" />
    </section>
  );
}

/* ====================================================================
 * Room equipment tab — used inside RoomModal Suspense fallback
 * ==================================================================== */
export function RoomEquipmentSkeleton() {
  return (
    <div className="ac-skel-equipment" aria-busy="true" aria-label="กำลังโหลดอุปกรณ์">
      {[0, 1, 2].map((i) => (
        <div key={i} className="ac-skel-equipment-row">
          <Skeleton shape="circle" width={28} height={28} ariaLabel="" />
          <div style={{ flex: 1 }}>
            <Skeleton shape="text" width="55%" ariaLabel="" style={{ display: "block", marginBottom: 6 }} />
            <Skeleton shape="text" width="40%" ariaLabel="" style={{ display: "block" }} />
          </div>
          <Skeleton shape="text" width={48} ariaLabel="" />
        </div>
      ))}
    </div>
  );
}

/* ====================================================================
 * HeatmapSkeleton — 297-room grid placeholder
 * Matches RoomsView .ac-rc layout (66×58 cards) to avoid CLS when real
 * data replaces it. Renders 5 floor sections × N cards/floor; tuned to
 * look like the real grid without trying to be exact (CLS-safe enough).
 * ==================================================================== */
export function HeatmapSkeleton({ floorCount = 4, perFloor = 14 }: { floorCount?: number; perFloor?: number } = {}) {
  return (
    <section className="ac-skel-heatmap" aria-busy="true" aria-label="กำลังโหลดผังห้อง">
      {Array.from({ length: floorCount }).map((_, floor) => (
        <div key={floor} className="ac-fs">
          <Skeleton shape="text" width={120} height={18} ariaLabel="" style={{ marginBottom: 12 }} />
          <div className="ac-rg">
            {Array.from({ length: perFloor }).map((_, i) => (
              <div
                key={i}
                className="ac-skel-rc"
                role="status"
                aria-busy="true"
                aria-label=""
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/* ====================================================================
 * KanbanCardSkeleton — single card (granular, used when one column
 * is loading or a card is mid-write). Matches `.ac-kanban-card` shape.
 * ==================================================================== */
export function KanbanCardSkeleton({ withActions = true }: { withActions?: boolean } = {}) {
  return (
    <article className="ac-kanban-card" aria-busy="true" aria-label="กำลังโหลดการ์ดงาน">
      {/* Title row: icon + room + age */}
      <header className="ac-kanban-card-head">
        <Skeleton shape="circle" width={14} height={14} ariaLabel="" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Skeleton shape="text" width="60%" height={14} ariaLabel="" />
        </div>
        <Skeleton shape="text" width={48} ariaLabel="" />
      </header>
      {/* Note */}
      <Skeleton shape="text" width="92%" ariaLabel="" style={{ display: "block", marginTop: 4 }} />
      <Skeleton shape="text" width="64%" ariaLabel="" style={{ display: "block" }} />
      {/* Customer meta */}
      <div className="ac-kanban-card-meta">
        <Skeleton shape="text" width={80} ariaLabel="" />
        <Skeleton shape="text" width={100} ariaLabel="" />
      </div>
      {/* Action buttons */}
      {withActions && (
        <footer className="ac-kanban-card-actions">
          <Skeleton width={64} height={26} ariaLabel="" />
          <Skeleton width={44} height={26} ariaLabel="" />
        </footer>
      )}
    </article>
  );
}
