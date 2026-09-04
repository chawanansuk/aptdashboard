import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAddEngTask } from "@/lib/permissions";
import { appsScriptCall, AppsScriptError } from "@/lib/appsScriptFetch";
import type { TimeLog, ActiveTimer } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// r27: Vercel default (10-15s) สั้นกว่า timeout ของ appsScriptCall → function
// ถูกฆ่าก่อนโค้ดจับ error ผู้ใช้เจอ 504 เปล่าๆ. 60s = เพดาน Hobby.
export const maxDuration = 60;

/**
 * Time tracking (v3.12.0 — Task 35).
 *
 * GET  /api/time-logs?taskKey=...&user=... → { rows: TimeLog[] }
 *      query params optional; both apply as AND
 * GET  /api/time-logs?active=1            → { active: ActiveTimer | null }
 *      ↑ shortcut: "do I have anything running right now?"
 *
 * POST /api/time-logs { action: "start" | "stop", taskKey, note? }
 *
 * Permissions:
 *   - GET:  authenticated users (read own + others — useful for
 *           management to see who's clocked-in)
 *   - POST: engineer + management only (canAddEngTask)
 *
 * Server always uses the session email for `user`; client-supplied
 * user is ignored to prevent clocking other people in/out.
 */

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);

  const url = new URL(req.url);
  const active = url.searchParams.get("active");
  const taskKey = url.searchParams.get("taskKey") || "";
  const userFilter = url.searchParams.get("user") || "";

  try {
    if (active === "1") {
      const json = await appsScriptCall<{ active: ActiveTimer | null }>(
        "getActiveTimer", { user: session.user.email }, { idempotent: true },
      );
      if (!json.ok) return bad(json.error || "backend error", 502);
      return NextResponse.json({ active: json.result?.active ?? null });
    }
    const json = await appsScriptCall<{ rows?: TimeLog[] }>(
      "getTimeLogs",
      { taskKey, user: userFilter },
      { idempotent: true },
    );
    if (!json.ok) return bad(json.error || "backend error", 502);
    return NextResponse.json({ rows: (json.result?.rows || []) as TimeLog[] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = e instanceof AppsScriptError ? e.status : 502;
    return bad(`ดึงข้อมูลเวลาทำงานไม่สำเร็จ: ${msg}`, status);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);
  if (!canAddEngTask(session.user.roles)) {
    return bad("ไม่มีสิทธิ์จับเวลา (เฉพาะ engineer และ management)", 403);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("invalid JSON");
  }

  const action = String(body.action || "").trim();
  if (action !== "start" && action !== "stop") {
    return bad("action ต้องเป็น 'start' หรือ 'stop'");
  }

  const taskKey = String(body.taskKey || "").trim();
  if (!taskKey) return bad("taskKey required");

  // Server-stamped user — never trust client input here
  const payload: Record<string, unknown> = {
    taskKey,
    user: session.user.email,
  };
  if (typeof body.note === "string") payload.note = body.note;

  const upstreamAction = action === "start" ? "startTimer" : "stopTimer";

  try {
    const json = await appsScriptCall(upstreamAction, payload);
    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = e instanceof AppsScriptError ? e.status : 502;
    return bad(`${action === "start" ? "เริ่ม" : "หยุด"}จับเวลาไม่สำเร็จ: ${msg}`, status);
  }
}
