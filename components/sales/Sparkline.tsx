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

  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  // Area polygon: line + down to the baseline + back to start.
  const area = `${line} ${width},${height} 0,${height}`;

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
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradId})`} stroke="none" />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
