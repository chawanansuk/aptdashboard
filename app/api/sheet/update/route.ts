import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAddTask, canDeleteTask, canEditTask, canEditTenant } from "@/lib/permissions";
import { invalidateDashboardCache } from "@/lib/dashboardCache";

export const runtime = "nodejs";

type Body = {
  action?: string;
  [key: string]: unknown;
};

function isAllowed(action: string, role: "admin" | "staff" | undefined): boolean {
  switch (action) {
    case "addTask":          return canAddTask(role);
    case "updateTask":
    case "updateTaskStatus": return canEditTask(role);
    case "deleteTask":       return canDeleteTask(role);
    case "updateRoomStatus": return canEditTenant(role);
    case "debugFindTask":    return canEditTask(role);
    default:                 return false;
  }
}

export async function POST(req: Request) {
  // 1. Auth — all writes require login
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 }
    );
  }
  const role = session.user.role;
  const email = session.user.email;

  // 2. Parse body
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400 }
    );
  }

  const action = typeof body.action === "string" ? body.action : "";
  if (!action) {
    return NextResponse.json(
      { ok: false, error: "missing action" },
      { status: 400 }
    );
  }

  // 3. Role check
  if (!isAllowed(action, role)) {
    return NextResponse.json(
      { ok: false, error: `ไม่มีสิทธิ์สำหรับการกระทำนี้ (action=${action}, role=${role || "none"})` },
      { status: 403 }
    );
  }

  // 4. Stamp creator from session — overrides anything client sent
  body.creator = email;

  // 5. Forward to Apps Script
  const writeUrl = process.env.SHEET_WRITE_URL;
  if (!writeUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: "ยังไม่ได้ตั้งค่า SHEET_WRITE_URL (ดู docs/SETUP.md)",
      },
      { status: 503 }
    );
  }

  try {
    const res = await fetch(writeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Apps Script Web App often redirects 302 → follow
      redirect: "follow",
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {
      // Apps Script may return HTML on permission failure
      return NextResponse.json(
        {
          ok: false,
          error:
            "ตอบกลับไม่ใช่ JSON (ตรวจสิทธิ์ Apps Script: Anyone)",
          raw: text.slice(0, 200),
        },
        { status: 502 }
      );
    }
    // Successful write → invalidate function-local dashboard cache so the
    // next /api/dashboard call refetches fresh data
    if (data && typeof data === "object" && (data as { ok?: boolean }).ok !== false) {
      invalidateDashboardCache();
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { ok: false, error: `write failed: ${message}` },
      { status: 502 }
    );
  }
}
