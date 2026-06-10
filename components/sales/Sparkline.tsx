"use client";

import { useId } from "react";

interface Props {
  /** Trend series, oldest → newest. Needs ≥ 2 points to draw a line. */
  data: number[];
  /** Stroke color (status base). */
  color: string;
  /** Drawing box; the SVG scales to its container width via viewBox. */
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Tiny inline trend line for the KPI cards. Pure SVG, no deps.
 *
 * Normalizes the series into a 0–1 band and maps to a 100×32 viewBox so
 * the same component renders crisply at any rendered size (the SVG is
 * width:100% of its slot). `vector-effect="non-scaling-stroke"` keeps the
 * stroke 2px regardless of scale. A faint gradient area under the line
 * adds depth without fighting the card.
 */
export default function Sparkline({ data, color, width = 100, height = 32, className }: Props) {
  const gradId = useId();
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1; // avoid /0 when the series is flat
  const stepX = width / (data.length - 1);
  // Leave 3px padding top/bottom so peaks/troughs aren't clipped.
  const pad = 3;
  const usableH = height - pad * 2;

  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = pad + (1 - (v - min) / span) * usableH;
    return [x, y] as const;
  });

  // Smooth bezier through the points (Catmull-Rom → cubic conversion).
  // Reads softer/premium vs the old hard polyline; passes through every
  // data point exactly so the trend is still honest.
  const d = smoothPath(points);
  // Area: the same curve closed down to the baseline.
  const area = `${d} L ${width},${height} L 0,${height} Z`;
  const [endX, endY] = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.26" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} stroke="none" />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* End-point marker — white ring makes "now" pop on the dark card. */}
      <circle
        cx={endX}
        cy={endY}
        r={3}
        fill={color}
        stroke="rgba(255,255,255,.85)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Catmull-Rom spline rendered as cubic beziers. Standard uniform
 * parameterization with tension 1/6 — smooth but never overshooting
 * enough to invert a trend visually.
 */
function smoothPath(pts: ReadonlyArray<readonly [number, number]>): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
