import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
    });
  } catch (e) {
    const body: HealthFail = {
      ok: false,
      error: "network_error",
      message: e instanceof Error ? e.message : "unknown network error",
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

  const body: HealthOK = {
    ok: true,
    version: parsed.version || "unknown",
    message: parsed.message || "",
    latencyMs,
  };
  return NextResponse.json(body);
}
