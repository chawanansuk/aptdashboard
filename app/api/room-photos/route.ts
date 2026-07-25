import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { appsScriptCall, AppsScriptError } from "@/lib/appsScriptFetch";
import type { RoomPhoto } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Upload calls Apps Script with a 45s timeout (Drive write + cold start)
// — the function budget must exceed it or Vercel kills us mid-upload
// and the client sees a bare 504. Same pattern as /api/sheet/update.
export const maxDuration = 60;

/**
 * Per-room defect photos (v3.25).
 *
 * GET  /api/room-photos?building=X&room=Y → { ok, rows: RoomPhoto[] }
 * POST /api/room-photos { building, room, dataBase64, mimeType?, note? }
 *
 * Storage is Google Drive (free tier) via Apps Script; the ledger tab
 * 'รูปตำหนิ' is append-only — no delete action exists on purpose, so
 * photos are tamper-resistant evidence for deposit disputes.
 *
 * Permissions: any authenticated user (sales file photos on behalf of
 * engineers — ทิศ B — and everyone may view).
 *
 * IMPORTANT: the upload POST is NOT idempotent (each call creates a new
 * Drive file + ledger row) — never wrap it in blind auto-retry. The
 * client shows a manual "ลองอีกครั้ง" instead.
 */

/** ~8MB of base64 ≈ 6MB binary — far above the ~300KB the client
 *  compressor emits; this guard only stops abuse/bugs. Apps Script has
 *  its own 11M-char ceiling. */
const MAX_BASE64_CHARS = 8_000_000;

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);

  const url = new URL(req.url);
  const building = (url.searchParams.get("building") || "").trim();
  const room = (url.searchParams.get("room") || "").trim();
  if (!building || !room) return bad("building/room required");

  try {
    const json = await appsScriptCall<{ rows?: RoomPhoto[] }>(
      "getRoomPhotos", { building, room }, { idempotent: true }
    );
    if (!json.ok) return bad(json.error || "backend error", 502);
    return NextResponse.json({ ok: true, rows: json.result?.rows || [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = e instanceof AppsScriptError ? e.status : 502;
    return bad(`ดึงรูปตำหนิไม่สำเร็จ: ${msg}`, status);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return bad("unauthenticated", 401);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("invalid JSON");
  }

  // action: "setNote" — fill-once description on an existing photo
  // (v3.25.1). Backend enforces write-once; replaying the same note is
  // idempotent, so a resilient retry here would be safe — but it's a
  // tiny payload, so we keep single-shot like the upload.
  if (String(body.action || "") === "setNote") {
    const id = String(body.id || "").trim();
    const noteText = String(body.note || "").trim();
    if (!id) return bad("id required");
    if (!noteText) return bad("note required");
    try {
      const json = await appsScriptCall("updatePhotoNote", {
        id,
        note: noteText,
        creator: session.user.email,
      });
      if (!json.ok) {
        // Old backend answers ok:false "unknown action" — translate.
        const err = json.error || "backend error";
        return bad(
          /unknown action/i.test(err)
            ? "ต้องอัปเดตหลังบ้านเป็น v3.25.1 ก่อน (ดูแถบฟ้าด้านบน)"
            : err,
          502
        );
      }
      return NextResponse.json({ ok: true, id, note: noteText });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      const status = e instanceof AppsScriptError ? e.status : 502;
      return bad(`บันทึกคำอธิบายไม่สำเร็จ: ${msg}`, status);
    }
  }

  const building = String(body.building || "").trim();
  const room = String(body.room || "").trim();
  const dataBase64 = String(body.dataBase64 || "");
  if (!building || !room) return bad("building/room required");
  if (!dataBase64) return bad("dataBase64 required");
  if (dataBase64.length > MAX_BASE64_CHARS) {
    return bad("รูปใหญ่เกินไป — ลองถ่าย/เลือกใหม่อีกครั้ง", 413);
  }

  try {
    const json = await appsScriptCall(
      "uploadRoomPhoto",
      {
        building,
        room,
        dataBase64,
        mimeType: String(body.mimeType || "image/jpeg"),
        note: String(body.note || "").trim(),
        creator: session.user.email,
      },
      // Upload payloads are big and Drive writes are slow — allow more
      // headroom than the default before declaring failure.
      { timeoutMs: 45_000 }
    );
    if (!json.ok) return bad(json.error || "backend error", 502);
    // WRITE actions return their payload at the TOP LEVEL of the envelope
    // ({ok, id, fileId, createdAt}) — only reads use {ok, result}. The
    // first cut read json.result here, got undefined, and the client
    // declared "อัปโหลดไม่สำเร็จ (HTTP 200)" on every SUCCESSFUL upload.
    // Accept both shapes so a future backend normalization can't re-break it.
    const r = (json.result ?? json) as { id?: string; fileId?: string; createdAt?: string };
    if (!r.fileId) return bad("backend ตอบกลับไม่มี fileId (ตรวจเวอร์ชัน Apps Script)", 502);
    return NextResponse.json({ ok: true, id: r.id || "", fileId: r.fileId, createdAt: r.createdAt || "" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = e instanceof AppsScriptError ? e.status : 502;
    return bad(`อัปโหลดรูปไม่สำเร็จ: ${msg}`, status);
  }
}
