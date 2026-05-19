"use client";

import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

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
 * Sales Pipeline — KPI strip + 3 sections
 * ==================================================================== */
export function SalesPipelineSkeleton() {
  return (
    <section className="ac-sales-pipeline" aria-busy="true" aria-label="กำลังโหลดภาพรวมขาย">
      {/* KPI cards */}
      <div className="ac-sales-kpi">
        {[0, 1, 2].map((i) => (
          <div key={i} className="ac-sales-kpi-card ac-sales-kpi-green">
            <Skeleton width={48} height={26} ariaLabel="" />
            <Skeleton shape="text" width="60%" ariaLabel="" style={{ marginTop: 6 }} />
          </div>
        ))}
      </div>
      {/* 3 sections of list */}
      {[0, 1, 2].map((s) => (
        <div key={s} className="ac-sales-section">
          <div className="ac-sales-section-head">
            <Skeleton shape="text" width={160} height={16} ariaLabel="" />
            <Skeleton shape="text" width={48} ariaLabel="" />
          </div>
          <div className="ac-sales-list">
            {[0, 1, 2, 3].map((r) => (
              <div key={r} className="ac-sales-row ac-sales-row-static">
                <Skeleton shape="circle" width={10} height={10} ariaLabel="" />
                <span className="ac-sales-row-main">
                  <Skeleton shape="text" width="50%" ariaLabel="" style={{ display: "block", marginBottom: 6 }} />
                  <Skeleton shape="text" width="70%" ariaLabel="" style={{ display: "block" }} />
                </span>
                <Skeleton shape="text" width={60} ariaLabel="" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/* ====================================================================
 * Engineer Kanban — KPI strip + 4 columns
 * ==================================================================== */
export function EngineerKanbanSkeleton() {
  return (
    <section className="ac-kanban" aria-busy="true" aria-label="กำลังโหลด Kanban งานช่าง">
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
