"use client";

import type { ReactNode } from "react";

/**
 * AppShell — pure layout wrapper for the dashboard chrome.
 *
 * Slot pattern (not prop-drilled): the page hands in already-rendered
 * header/sidebar/bottomNav and the main content as children. Why slots:
 *
 *   - AppHeader/AppSidebar/BottomNav each take 10-20 props that closure
 *     over page state. Forwarding them through AppShell would duplicate
 *     the prop surface here and at every call site for zero gain.
 *   - This way the page keeps the wiring (one place), AppShell owns
 *     the markup (one place), and refactoring one doesn't churn the
 *     other.
 *
 * Owns ONLY the chrome structure:
 *
 *   <div .ac-app>
 *     {header}                ← AppHeader
 *     <div .ac-body>
 *       {sidebar}             ← AppSidebar
 *       <main .ac-main>
 *         {errorsBanner}      ← inline JSX from the page when errors[] not empty
 *         {children}          ← active view tree
 *       </main>
 *     </div>
 *   </div>
 *   {bottomNav}               ← BottomNav, intentionally OUTSIDE .ac-app so the
 *                               app's flex layout doesn't reserve space for it
 *                               on desktop (it's display:none above the mobile
 *                               breakpoint).
 *
 * Breakup PR 4 — visual zero-diff.
 */

interface Props {
  header: ReactNode;
  sidebar: ReactNode;
  bottomNav: ReactNode;
  /** Inline-rendered error banner from the data loader. Null when no errors. */
  errorsBanner?: ReactNode;
  /** Main content (the active view + any in-flow modals/drawers). */
  children: ReactNode;
}

export default function AppShell({
  header, sidebar, bottomNav, errorsBanner, children,
}: Props) {
  return (
    <>
      <div className="ac-app">
        {header}
        <div className="ac-body">
          {sidebar}
          <main className="ac-main" id="main-content" tabIndex={-1}>
            {errorsBanner}
            {children}
          </main>
        </div>
      </div>
      {bottomNav}
    </>
  );
}
