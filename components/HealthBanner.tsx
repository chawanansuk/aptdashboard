"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type Health =
  | { ok: true; version: string; expectedVersion: string; outdated: boolean; message: string; latencyMs: number }
  | { ok: false; error: string; message: string; statusCode?: number; responsePreview?: string; latencyMs?: number };

/**
 * Probes /api/sheet/health on mount and shows a dismissible warning
 * banner if Apps Script is unreachable / mis-configured.
 *
 * Suppresses itself on /login pages so unauthenticated users don't see
 * the auth-required error.
 */
export default function HealthBanner() {
  const { status: authStatus } = useSession();
  const [health, setHealth] = useState<Health | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;
    fetch("/api/sheet/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setHealth(data as Health);
      })
      .catch((e) => {
        if (cancelled) return;
        setHealth({
          ok: false,
          error: "network_error",
          message: e instanceof Error ? e.message : "fetch failed",
        });
      });
    return () => { cancelled = true; };
  }, [authStatus]);

  if (!health || dismissed) return null;

  // Backend reachable but running OLDER code than this frontend expects —
  // the operator pasted new Code.gs but hasn't run "New version" yet.
  // A distinct, actionable notice (not the red error styling) so the
  // "did my redeploy take?" question is answered on-screen.
  if (health.ok) {
    if (!health.outdated) return null;
    return (
      <div className="ac-health-banner ac-health-banner-warn" role="status">
        <div className="ac-health-banner-main">
          <strong>⬆ Apps Script ยังเป็นเวอร์ชันเก่า</strong>
          <span className="ac-health-banner-msg">
            backend ที่รันอยู่คือ v{health.version} แต่โค้ดล่าสุดคือ v{health.expectedVersion} —
            วางโค้ดใหม่แล้ว Deploy → Manage deployments → ✏️ → New version (URL เดิม ไม่เปลี่ยน)
          </span>
          <button
            type="button"
            className="ac-health-banner-close"
            onClick={() => setDismissed(true)}
            aria-label="ปิด"
          >✕</button>
        </div>
      </div>
    );
  }

  const errorLabel: Record<string, string> = {
    missing_env: "Vercel env หาย",
    network_error: "Network ติดต่อไม่ได้",
    not_json: "Apps Script ตอบไม่ใช่ JSON",
    upstream_not_ok: "Apps Script ตอบ error",
  };
  const label = errorLabel[health.error] || health.error;

  return (
    <div className="ac-health-banner" role="alert">
      <div className="ac-health-banner-main">
        <strong>⚠ Apps Script: {label}</strong>
        <span className="ac-health-banner-msg">{health.message}</span>
        <button
          type="button"
          className="ac-health-banner-link"
          onClick={() => setExpanded((v) => !v)}
        >{expanded ? "ซ่อนรายละเอียด" : "ดูรายละเอียด"}</button>
        <button
          type="button"
          className="ac-health-banner-close"
          onClick={() => setDismissed(true)}
          aria-label="ปิด"
        >✕</button>
      </div>
      {expanded && (
        <div className="ac-health-banner-details">
          {"statusCode" in health && health.statusCode != null && <div>HTTP status: {health.statusCode}</div>}
          {"latencyMs" in health && health.latencyMs != null && <div>Latency: {health.latencyMs}ms</div>}
          {"responsePreview" in health && health.responsePreview && (
            <details>
              <summary>Response preview (200 chars)</summary>
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 11, margin: 0 }}>{health.responsePreview}</pre>
            </details>
          )}
          <div style={{ marginTop: 8, fontSize: 12 }}>
            <strong>วิธีแก้ที่น่าจะเป็น:</strong>
            <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
              {health.error === "missing_env" && (
                <li>Vercel → Settings → Environment Variables → เพิ่ม <code>SHEET_WRITE_URL</code> จาก Apps Script Deploy → Web app → URL</li>
              )}
              {health.error === "not_json" && (
                <>
                  <li>Apps Script Web App access setting ต้องเป็น <strong>Anyone</strong> (ไม่ใช่ "Anyone with Google account")</li>
                  <li>URL ใน <code>SHEET_WRITE_URL</code> ต้องลงท้ายด้วย <code>/exec</code></li>
                </>
              )}
              {health.error === "network_error" && (
                <li>Apps Script deployment อาจถูกลบ หรือ URL ผิด — เปิด Deploy → Manage deployments → ตรวจสอบ Web app URL</li>
              )}
              {health.error === "upstream_not_ok" && (
                <li>Apps Script ตอบ error — เปิด Apps Script editor → Executions → ดู log error</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
