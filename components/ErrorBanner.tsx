"use client";

/**
 * Reusable error banner with optional retry. Replaces ad-hoc
 * `<div className="ac-banner ac-banner-warn">` snippets scattered
 * across list views — provides a consistent affordance (retry +
 * dismiss) so users aren't stuck on a failed fetch.
 *
 * Usage:
 *   <ErrorBanner message={err} onRetry={() => load()} onDismiss={() => setErr(null)} />
 */

interface Props {
  message: string | null;
  /** Optional retry handler — when supplied, renders "ลองใหม่" button. */
  onRetry?: () => void;
  /** Optional dismiss handler — when supplied, renders "ปิด" button. */
  onDismiss?: () => void;
}

export default function ErrorBanner({ message, onRetry, onDismiss }: Props) {
  if (!message) return null;
  return (
    <div className="ac-banner ac-banner-warn ac-banner-with-actions" role="alert">
      <span className="ac-banner-icon" aria-hidden>⚠</span>
      <span className="ac-banner-msg">{message}</span>
      <span className="ac-banner-actions">
        {onRetry && (
          <button
            type="button"
            className="ac-btn ac-btn-primary ac-btn-sm"
            onClick={onRetry}
          >↻ ลองใหม่</button>
        )}
        {onDismiss && (
          <button
            type="button"
            className="ac-btn ac-btn-ghost ac-btn-sm"
            onClick={onDismiss}
          >ปิด</button>
        )}
      </span>
    </div>
  );
}
