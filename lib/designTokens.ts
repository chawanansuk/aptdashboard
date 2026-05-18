/**
 * Design tokens — TypeScript mirror of the CSS variables defined in
 * `app/globals.css`. Used when a component needs a token value inline
 * (e.g. as a JS-computed style). For static CSS, prefer the
 * `var(--token-name)` form directly.
 *
 * Keep this file in sync with the `:root` block in globals.css.
 */

export const SPACE = {
  0: "var(--space-0)",
  1: "var(--space-1)",  // 4px
  2: "var(--space-2)",  // 8px
  3: "var(--space-3)",  // 12px
  4: "var(--space-4)",  // 16px
  5: "var(--space-5)",  // 20px
  6: "var(--space-6)",  // 24px
  8: "var(--space-8)",  // 32px
  10: "var(--space-10)",
  12: "var(--space-12)",
  16: "var(--space-16)",
} as const;

export const RADIUS = {
  xs: "var(--radius-xs)",
  sm: "var(--radius-sm)",
  md: "var(--radius-md)",
  lg: "var(--radius-lg)",
  xl: "var(--radius-xl)",
  full: "var(--radius-full)",
} as const;

export const SHADOW = {
  xs: "var(--shadow-xs)",
  sm: "var(--shadow-sm)",
  md: "var(--shadow-md)",
  lg: "var(--shadow-lg)",
  xl: "var(--shadow-xl)",
  focus: "var(--shadow-focus)",
} as const;

export const DURATION = {
  fast: "var(--duration-fast)",       // 120ms
  normal: "var(--duration-normal)",   // 200ms
  slow: "var(--duration-slow)",       // 320ms
} as const;

export const EASING = {
  out: "var(--ease-out)",
  inOut: "var(--ease-in-out)",
  spring: "var(--ease-spring)",
} as const;

export const TEXT = {
  xs: "var(--text-xs)",
  sm: "var(--text-sm)",
  base: "var(--text-base)",
  md: "var(--text-md)",
  lg: "var(--text-lg)",
  xl: "var(--text-xl)",
  "2xl": "var(--text-2xl)",
  "3xl": "var(--text-3xl)",
} as const;

export const LEADING = {
  tight: "var(--leading-tight)",
  snug: "var(--leading-snug)",
  normal: "var(--leading-normal)",
  relaxed: "var(--leading-relaxed)",
} as const;

export const WEIGHT = {
  normal: "var(--font-weight-normal)",
  medium: "var(--font-weight-medium)",
  semibold: "var(--font-weight-semibold)",
  bold: "var(--font-weight-bold)",
} as const;

export const SURFACE = {
  base: "var(--color-surface)",
  alt: "var(--color-surface-2)",
  hover: "var(--color-surface-3)",
  border: "var(--color-border)",
  borderStrong: "var(--color-border-strong)",
  text: "var(--color-text)",
  textMuted: "var(--color-text-muted)",
  textFaint: "var(--color-text-faint)",
  accent: "var(--color-accent)",
} as const;
