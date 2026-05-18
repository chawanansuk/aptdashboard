"use client";

interface Props {
  label?: string;
  /** "comfortable" (default) for in-view placeholders, "compact" for inline. */
  size?: "compact" | "comfortable";
}

/**
 * Consistent loading state — spinner + label. Replaces the various
 * "กำลังโหลด..." gray-text patterns sprinkled across views. Use any
 * time the user is waiting on a fetch.
 */
export default function LoadingState({ label = "กำลังโหลด...", size = "comfortable" }: Props) {
  return (
    <div className={`ac-loading ac-loading-${size}`} role="status" aria-live="polite">
      <span className="ac-loading-spinner" aria-hidden />
      <span className="ac-loading-label">{label}</span>
    </div>
  );
}
