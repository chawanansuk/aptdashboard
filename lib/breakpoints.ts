/**
 * Canonical responsive breakpoints — the single source of truth shared
 * between JS (useMediaQuery, resize logic) and the documented CSS media
 * queries. Before this, the app carried three disjoint "mobile"
 * thresholds (bottom nav @768, a JS sidebar check @980, the sidebar
 * overlay @1280), which let the overlay sidebar get out of sync with the
 * CSS on resize.
 *
 * CSS @media rules can't read JS values, so globals.css documents these
 * same numbers next to its media queries; this file is what code imports.
 */

export const BP = {
  /** ≤ mobile: bottom nav shows, header compacts. */
  mobile: 768,
  /** Optional mid tier for two-column ↔ one-column reflows. */
  tablet: 1024,
  /**
   * Sidebar presentation boundary. ≤ railMax the sidebar is a hamburger
   * overlay; above it the sidebar is the always-visible desktop rail.
   * Matches `@media (max-width: 1280px)` in globals.css.
   */
  railMax: 1280,
} as const;

/** Ready-to-use matchMedia query strings (pair with useMediaQuery). */
export const MQ = {
  /** Phones / small tablets. */
  mobile: `(max-width: ${BP.mobile}px)`,
  /** Any viewport where the sidebar is an overlay (not the static rail). */
  sidebarOverlay: `(max-width: ${BP.railMax}px)`,
  /** Desktop rail mode — sidebar is always visible. */
  desktopRail: `(min-width: ${BP.railMax + 1}px)`,
} as const;
