"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Icon } from "@/lib/icons";
import { reportClientError } from "@/lib/reportError";

/**
 * ErrorBoundary — catches render-time errors in its subtree and shows
 * a friendly fallback instead of crashing the whole app to a white screen.
 *
 * Important React caveats (why this is a class):
 *   - Error boundaries MUST be class components — there's no hook API
 *     for `componentDidCatch` / `getDerivedStateFromError`.
 *   - Boundaries only catch errors during render, lifecycle methods,
 *     and constructors of components below them. They do NOT catch:
 *       • event handlers (use try/catch + toast)
 *       • async code (use `useErrorBoundary` to manually rethrow into render)
 *       • SSR errors (those are surfaced to the server)
 *       • errors inside the boundary itself
 *
 * Compose nested:
 *   <ErrorBoundary> (global, in layout)            → full-page fallback
 *     <ErrorBoundary> (per-route)                  → in-view fallback
 *       <SalesPipelineView />
 *     </ErrorBoundary>
 *   </ErrorBoundary>
 *
 * `level` only affects the visual treatment of the default fallback.
 * Custom `fallback` (render-prop) overrides both.
 */

export type ErrorBoundaryLevel = "global" | "route" | "section";

interface FallbackProps {
  error: Error;
  reset: () => void;
  level: ErrorBoundaryLevel;
}

interface Props {
  children: ReactNode;
  /** Visual size of the default fallback. */
  level?: ErrorBoundaryLevel;
  /** Hook for telemetry — gets the error + a structured stack. */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** Render-prop override; replaces the default fallback entirely. */
  fallback?: (props: FallbackProps) => ReactNode;
  /** Optional friendly label, e.g. "ปฏิทิน" — interpolated into the
   *  default message: "เกิดข้อผิดพลาดในส่วนของ {label}". */
  label?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Always log so it surfaces in browser devtools / Vercel runtime logs.
    console.error("[ErrorBoundary]", error, info.componentStack);
    // Ship to /api/client-error so production failures show up in the
    // Vercel log search — without this, every user error was invisible
    // to us until someone screenshotted the fallback.
    const level = this.props.level ?? "section";
    reportClientError({
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
      source: `ErrorBoundary:${level}${this.props.label ? `:${this.props.label}` : ""}`,
      level,
    });
    this.props.onError?.(error, info);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      const level = this.props.level ?? "section";
      if (this.props.fallback) {
        return this.props.fallback({ error, reset: this.reset, level });
      }
      return (
        <DefaultErrorFallback
          error={error}
          reset={this.reset}
          level={level}
          label={this.props.label}
        />
      );
    }
    return this.props.children;
  }
}

function DefaultErrorFallback({
  error, reset, level, label,
}: FallbackProps & { label?: string }) {
  const heading =
    level === "global"
      ? "ขออภัย เกิดข้อผิดพลาด"
      : label
      ? `เกิดข้อผิดพลาดในส่วนของ${label}`
      : "เกิดข้อผิดพลาดในส่วนนี้";

  const description =
    level === "global"
      ? "ลองรีเฟรชหน้านี้อีกครั้ง ถ้ายังเจอปัญหา กรุณาแจ้งทีมงาน"
      : "ลองรีเฟรชหรือเลือกมุมมองอื่น ส่วนอื่นของแอปยังใช้งานได้ตามปกติ";

  const handleReload = () => {
    if (level === "global") {
      if (typeof window !== "undefined") window.location.reload();
    } else {
      reset();
    }
  };

  const handleReport = () => {
    // Placeholder until a real bug-report flow exists. Copies error
    // detail to clipboard so the user can paste into LINE/Slack.
    if (typeof navigator === "undefined") return;
    const detail = `[${new Date().toISOString()}]\n${error.message}\n\n${error.stack || ""}`;
    navigator.clipboard?.writeText(detail).then(
      () => alert("คัดลอกข้อมูลปัญหาแล้ว — วางใน LINE/แชท เพื่อแจ้งทีม"),
      () => alert("คัดลอกไม่สำเร็จ — กรุณาสกรีนช็อตหน้านี้แทน"),
    );
  };

  return (
    <div
      className={`ac-error-boundary ac-error-boundary-${level}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="ac-error-boundary-icon" aria-hidden>
        <Icon name="alert" size={level === "global" ? 48 : 32} />
      </div>
      <div className="ac-error-boundary-body">
        <h2 className="ac-error-boundary-title">{heading}</h2>
        <p className="ac-error-boundary-desc">{description}</p>
        {/* In dev/preview show the raw message so we can diagnose quickly.
            In production it would be hidden behind a "details" toggle. */}
        <details className="ac-error-boundary-details">
          <summary>รายละเอียดทางเทคนิค</summary>
          <pre className="ac-error-boundary-pre">{error.message}</pre>
        </details>
        <div className="ac-error-boundary-actions">
          <button className="ac-btn ac-btn-primary" onClick={handleReload}>
            <Icon name="refresh" size={14} />
            <span>{level === "global" ? "รีเฟรชหน้า" : "ลองใหม่"}</span>
          </button>
          <button className="ac-btn ac-btn-ghost" onClick={handleReport}>
            รายงานปัญหา
          </button>
        </div>
      </div>
    </div>
  );
}

export default ErrorBoundary;
