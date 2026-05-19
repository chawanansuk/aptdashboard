"use client";

import { ReactNode } from "react";

export type EmptyStateIcon =
  | "tasks"
  | "tenants"
  | "rooms"
  | "calendar"
  | "search"
  | "equipment"
  | "facility"
  | "maintenance"
  | "celebration";

/**
 * Tone changes visual treatment of the empty-state card:
 *   neutral      — default ink + soft tint (most empties)
 *   celebration  — green accent + 🎉 vibe (0 tasks today, all done, etc.)
 *   warning      — orange accent (zero results from a filter; user should
 *                  notice that their filter excluded everything)
 */
export type EmptyStateTone = "neutral" | "celebration" | "warning";

interface Props {
  icon?: EmptyStateIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  /** Optional secondary action (ghost button, e.g. "ดูตัวอย่าง"). */
  secondaryAction?: { label: string; onClick: () => void };
  tone?: EmptyStateTone;
  /** Use small (inline) layout when the empty fits inside a tight list/card. */
  compact?: boolean;
  children?: ReactNode;
}

const ICONS: Record<EmptyStateIcon, ReactNode> = {
  tasks: (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  ),
  tenants: (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  rooms: (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  calendar: (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  search: (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  // Wrench (equipment in a room)
  equipment: (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  ),
  // Building (facility = shared infra in a building)
  facility: (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v8h4"/><path d="M18 9h2a2 2 0 0 1 2 2v11h-4"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>
    </svg>
  ),
  // Clipboard with check (maintenance schedule)
  maintenance: (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>
    </svg>
  ),
  // Stars / sparkles (celebration: nothing to do, well done)
  celebration: (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z"/>
      <path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/>
    </svg>
  ),
};

export default function EmptyState({
  icon = "tasks",
  title,
  description,
  action,
  secondaryAction,
  tone = "neutral",
  compact = false,
  children,
}: Props) {
  const toneClass = tone === "neutral" ? "" : ` ac-empty-state-${tone}`;
  const sizeClass = compact ? " ac-empty-state-compact" : "";
  return (
    <div className={`ac-empty-state${toneClass}${sizeClass}`} role="status" aria-live="polite">
      <div className="ac-empty-icon">{ICONS[icon]}</div>
      <div className="ac-empty-title">{title}</div>
      {description && <div className="ac-empty-desc">{description}</div>}
      {(action || secondaryAction) && (
        <div className="ac-empty-actions">
          {action && (
            <button className="ac-btn ac-btn-primary" onClick={action.onClick}>
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button className="ac-btn ac-btn-ghost" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
