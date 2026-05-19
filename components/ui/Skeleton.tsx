"use client";

import type { CSSProperties } from "react";

/**
 * Skeleton — primitive placeholder for content that's still loading.
 *
 * Why a primitive: the codebase already had ad-hoc skeleton bits scattered
 * (SkeletonLoader, .ac-overview-card-skeleton, .ac-skel-* helpers). This
 * unifies them so every loading state across the app shares the same
 * shimmer animation, color, dark-mode treatment, and corner radii.
 *
 * Shapes:
 *   text   — short line, default for typography placeholders
 *   rect   — generic rectangle, control width/height freely
 *   circle — for avatars / status dots
 *   card   — rounded rectangle the size of a card, default 88px tall
 *
 * Animation reuses the existing `.ac-skel` class (gradient + 1.4s linear
 * shimmer) so we don't duplicate keyframes.
 */

export type SkeletonShape = "text" | "rect" | "circle" | "card";

interface Props {
  /** Visual shape (default: "rect"). */
  shape?: SkeletonShape;
  /** CSS width (number → px). */
  width?: number | string;
  /** CSS height (number → px). Defaults vary per shape. */
  height?: number | string;
  /** Extra class name. */
  className?: string;
  /** Inline style overrides — pass-through. */
  style?: CSSProperties;
  /** Accessible label (announced via aria-busy). Defaults to "กำลังโหลด". */
  ariaLabel?: string;
}

const DEFAULT_HEIGHT: Record<SkeletonShape, string | number> = {
  text: 12,
  rect: 16,
  circle: 40,
  card: 88,
};

const DEFAULT_RADIUS: Record<SkeletonShape, string> = {
  text: "4px",
  rect: "6px",
  circle: "50%",
  card: "12px",
};

export function Skeleton({
  shape = "rect",
  width,
  height,
  className,
  style,
  ariaLabel = "กำลังโหลด",
}: Props) {
  const h = height ?? DEFAULT_HEIGHT[shape];
  // Circles default to a square so width=height when neither given
  const w = width ?? (shape === "circle" ? h : "100%");
  const combinedClass = `ac-skel ac-skel-shape-${shape}${className ? " " + className : ""}`;
  return (
    <span
      className={combinedClass}
      role="status"
      aria-busy="true"
      aria-label={ariaLabel}
      style={{
        display: "inline-block",
        width: typeof w === "number" ? `${w}px` : w,
        height: typeof h === "number" ? `${h}px` : h,
        borderRadius: DEFAULT_RADIUS[shape],
        ...style,
      }}
    />
  );
}

/**
 * SkeletonText — convenience for rendering N text lines with optional
 * width variation (last line shorter feels natural). Defaults to 3 lines.
 */
export function SkeletonText({
  lines = 3,
  className,
  lastLineWidth = "60%",
}: {
  lines?: number;
  className?: string;
  lastLineWidth?: string | number;
}) {
  return (
    <div className={`ac-skel-text-block${className ? " " + className : ""}`} role="status" aria-busy="true">
      {Array.from({ length: lines }).map((_, i) => {
        const isLast = i === lines - 1;
        return (
          <Skeleton
            key={i}
            shape="text"
            width={isLast && lines > 1 ? lastLineWidth : "100%"}
            ariaLabel=""
            style={{ display: "block", marginBottom: i === lines - 1 ? 0 : 8 }}
          />
        );
      })}
    </div>
  );
}

/**
 * SkeletonCard — common "stat card" placeholder (icon + title + value + sub).
 * Used by the overview cards and similar hero-card layouts.
 */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={`ac-skel-card-block${className ? " " + className : ""}`}
      role="status"
      aria-busy="true"
      aria-label="กำลังโหลดข้อมูลการ์ด"
    >
      <Skeleton shape="circle" width={40} height={40} ariaLabel="" />
      <div style={{ flex: 1 }}>
        <Skeleton shape="text" width="60%" ariaLabel="" style={{ display: "block", marginBottom: 8 }} />
        <Skeleton shape="text" width="80%" height={20} ariaLabel="" style={{ display: "block", marginBottom: 6 }} />
        <Skeleton shape="text" width="40%" ariaLabel="" style={{ display: "block" }} />
      </div>
    </div>
  );
}

export default Skeleton;
