import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { EXPECTED_BACKEND_VERSION, isBackendOutdated } from "@/lib/backendVersion";
import { appsScriptCall, isAbortLike } from "@/lib/appsScriptFetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// audit r33: ตัววินิจฉัย "ค้าง" ต้องไม่ค้างเสียเอง — เดิมไม่มี timeout/maxDuration
export const maxDuration = 60;
const HEALTH_TIMEOUT_MS = 20_000;

/**
 * Probes the Apps Script Web App with a GET request and reports the
 * outcome in detail. Used by <HealthBanner /> to surface configuration
 * problems (wrong URL, missing access permission, old deployment) before
 * a user notices "save didn't save" symptoms.
 *
 * Auth required so we don't expose deployment info to anonymous probes.
 */

interface HealthOK {
  ok: true;
  version: string;
  /** The version this frontend was built to talk to. */
  expectedVersion: string;
  /** True when the deployed backend is older than expectedVersion — the
   *  operator pasted new Code.gs but hasn't run "New version" yet. */
  outdated: boolean;
  message: string;
  latencyMs: number;
}

interface HealthFail {
  ok: false;
  error: "missing_env" | "network_error" | "not_json" | "upstream_not_ok";
  message: string;
  statusCode?: number;
  responsePreview?: string;
  latencyMs?: number;
}

export async function GET(): Promise<NextResponse<HealthOK | HealthFail | { error: string }>> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = process.env.SHEET_WRITE_URL;
  if (!url) {
    const body: HealthFail = {
      ok: false,
      error: "missing_env",
      message: "SHEET_WRITE_URL ไม่ได้ตั้งค่าใน Vercel environment variables",
    };
    return NextResponse.json(body);
  }

  const t0 = Date.now();

  // audit r35: once SHARED_SECRET is on, doGet no longer reveals the version
  // (anyone with the URL could read it). Probe through the gated `ping`
  // action instead; an older backend (unknown action) falls through to GET.
  if (process.env.APPS_SCRIPT_SECRET) {
    try {
      const j = await appsScriptCall<never>("ping", {}, { idempotent: true, timeoutMs: HEALTH_TIMEOUT_MS, maxRetries: 0 });
      const pinged = j as { ok: boolean; version?: string; message?: string; error?: string };
      if (pinged.ok && pinged.version) {
        const body: HealthOK = {
          ok: true,
          version: pinged.version,
          expectedVersion: EXPECTED_BACKEND_VERSION,
          outdated: isBackendOutdated(pinged.version),
          message: pinged.message || "",
          latencyMs: Date.now() - t0,
        };
        return NextResponse.json(body);
      }
      if (pinged.error && !/unknown action/i.test(pinged.error)) {
        const body: HealthFail = { ok: false, error: "upstream_not_ok", message: pinged.error, latencyMs: Date.now() - t0 };
        return NextResponse.json(body);
      }
      // unknown action → pre-3.32 backend: fall through to the GET probe
    } catch (e) {
      const body: HealthFail = {
        ok: false,
        error: "network_error",
        message: e instanceof Error ? e.message : "unknown network error",
        latencyMs: Date.now() - t0,
      };
      return NextResponse.json(body);
    }
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
  } catch (e) {
    const body: HealthFail = {
      ok: false,
      error: "network_error",
      message: isAbortLike(e)
        ? `Apps Script ไม่ตอบใน ${HEALTH_TIMEOUT_MS / 1000} วินาที (cold start นานผิดปกติ หรือ URL ผิด)`
        : e instanceof Error ? e.message : "unknown network error",
      latencyMs: Date.now() - t0,
    };
    return NextResponse.json(body);
  }
  const latencyMs = Date.now() - t0;

  let text: string;
  try {
    text = await res.text();
  } catch (e) {
    const body: HealthFail = {
      ok: false,
      error: "network_error",
      message: `อ่าน response ไม่สำเร็จ: ${e instanceof Error ? e.message : "unknown"}`,
      statusCode: res.status,
      latencyMs,
    };
    return NextResponse.json(body);
  }

  let parsed: { ok?: boolean; version?: string; message?: string } | null = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* not JSON */
  }

  if (!parsed) {
    const body: HealthFail = {
      ok: false,
      error: "not_json",
      message:
        "Apps Script ตอบกลับไม่ใช่ JSON — อาจเป็นเพราะ access setting ของ Web App ไม่ใช่ 'Anyone' หรือ deployment URL ผิด",
      statusCode: res.status,
      responsePreview: text.slice(0, 200),
      latencyMs,
    };
    return NextResponse.json(body);
  }

  if (!parsed.ok) {
    const body: HealthFail = {
      ok: false,
      error: "upstream_not_ok",
      message: parsed.message || "Apps Script ตอบกลับ ok=false",
      statusCode: res.status,
      latencyMs,
    };
    return NextResponse.json(body);
  }

  const version = parsed.version || "unknown";
  const body: HealthOK = {
    ok: true,
    version,
    expectedVersion: EXPECTED_BACKEND_VERSION,
    outdated: isBackendOutdated(version),
    message: parsed.message || "",
    latencyMs,
  };
  return NextResponse.json(body);
}
