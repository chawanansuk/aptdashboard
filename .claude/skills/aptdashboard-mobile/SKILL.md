---
name: aptdashboard-mobile
description: Mobile/responsive conventions for the aptdashboard UI — shared breakpoints, 44px touch targets, safe-area, 100dvh, and Thai text rules. Use whenever adding or editing UI (new pages, components, buttons, cards, forms, layouts, CSS) so changes stay mobile-friendly without a re-audit.
---

# aptdashboard — Mobile UI conventions

This dashboard is used heavily on phones (sales walking units, engineers on
the floor). These are the project's established rules — follow them when
touching any UI so we don't regress what PRs #249/#250 fixed. They come
from the codebase, not generic advice.

## Breakpoints — one source of truth

`lib/breakpoints.ts` is canonical. Import `MQ` + `useMediaQuery`; never
hard-code pixel thresholds in JS.

```ts
import { useMediaQuery } from "@/lib/useMediaQuery";
import { MQ } from "@/lib/breakpoints";

const isMobile = useMediaQuery(MQ.mobile);        // ≤768
const isRail   = useMediaQuery(MQ.desktopRail);   // ≥1281
```

- `768px` → mobile: bottom nav shows, header compacts.
- `1280px` → sidebar boundary: **≤1280 = hamburger overlay**, **≥1281 = static rail**.
- CSS `@media` can't read JS values, so `app/globals.css` duplicates these
  numbers by design. **If you change a breakpoint, change it in BOTH**
  `lib/breakpoints.ts` and the CSS, together.
- `useMediaQuery` is SSR-safe: returns `false` on the server + first client
  render, then resolves on mount. Treat the first `false` as "not measured
  yet", not as "desktop".

## Touch targets — 44px floor on touch

Interactive elements must be ≥44×44px on touch devices (WCAG 2.5.5 / Apple
HIG). Keep desktop density — grow the hit area only on coarse pointers:

```css
@media (pointer: coarse) {
  .my-button { min-height: 44px; }
  .my-icon-btn { min-width: 44px; min-height: 44px; }
}
```

Existing coarse-pointer blocks already cover `.ac-icon-btn`, `.ac-side-item`,
`.ac-bottom-nav-tab`, room-modal nav, and the sales `.drawerBtn`/`.drawerClose`
(globals.css + components/sales/sales.module.css). Add new interactive
classes to the same pattern; don't ship a tap target under 44px.

## Safe-area (notch / home indicator)

Already wired globally: `app/layout.tsx` sets `viewportFit: "cover"`. For any
NEW fixed/sticky element at a screen edge, pad with the inset so it clears
the notch / home bar:

```css
padding-bottom: max(6px, env(safe-area-inset-bottom));
/* top edge: env(safe-area-inset-top) */
```

## Viewport height — use dvh

Never use bare `100vh` for full-height/edge containers — it jumps when the
mobile browser chrome shows/hides. Always pair it:

```css
min-height: 100vh;
min-height: 100dvh; /* dvh wins where supported */
```

(Same for `calc(100vh - …)` → add a `calc(100dvh - …)` line after it.)

## Thai text (`<html lang="th">`)

- Base `body` line-height is **1.5** — correct for Thai upper/lower marks
  (สระบน/ล่าง/วรรณยุกต์). Don't drop multi-line Thai below ~1.3.
- The whole app is Thai, so `:lang(th)` targets everything — there is no
  "Thai vs Latin" split to scope to.
- **10px micro-labels are intentional**, not a bug: badges, status pills,
  absolute card markers, and `white-space: nowrap` labels (e.g.
  `.ac-mode-badge`, `.ac-rc-status`, `.ac-bottom-nav-label`,
  `.ac-lead-funnel-label`). They match iOS/Android conventions. Don't bump
  these blind — it risks overflow for no readability gain. Only enlarge a
  small font if it's genuinely readable body/secondary copy AND won't wrap.

## Existing responsive structures — reuse, don't duplicate

- Sidebar: overlay + backdrop ≤1280 (`.ac-side.is-open`), static rail above.
- Bottom nav: `BottomNav.tsx`, shows ≤768, hide-on-scroll, role-aware tabs.
- Kanban (`EngineerKanban.tsx`): 4-col → horizontal scroll-snap ≤900 →
  single column + mobile tab selector ≤768. Reuse this collapse shape for
  any new multi-column board.
- Charts: wrap in recharts `ResponsiveContainer width="100%"`.

## Verify

Can't screenshot in CI here — **the Vercel PR preview is the device check**.
After a UI change, open the preview on a real phone (or DevTools device mode)
before merging. Run `tsc --noEmit`, `vitest run`, `next build` as usual.
