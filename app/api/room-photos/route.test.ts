import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level tests for /api/room-photos with the Apps Script layer
 * mocked at the appsScriptCall seam — the exact seam the e2e suite
 * can't see (it mocks the whole route). The production bug this guards:
 * WRITE actions return their payload at the envelope's TOP LEVEL
 * ({ok, fileId, ...}), not under `result`, and the first cut of the
 * route dropped the fileId → every successful upload reported
 * "อัปโหลดไม่สำเร็จ (HTTP 200)" to the user.
 */

const authMock = vi.fn();
const callMock = vi.fn();

vi.mock("@/auth", () => ({ auth: () => authMock() }));
vi.mock("@/lib/appsScriptFetch", () => ({
  appsScriptCall: (...args: unknown[]) => callMock(...args),
  AppsScriptError: class AppsScriptError extends Error {
    status: number;
    constructor(message: string, status = 502) {
      super(message);
      this.status = status;
    }
  },
}));

import { GET, POST } from "./route";

function postReq(body: unknown): Request {
  return new Request("http://test/api/room-photos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authMock.mockReset().mockResolvedValue({ user: { email: "sale@apt.test" } });
  callMock.mockReset();
});

describe("POST /api/room-photos", () => {
  const goodBody = { building: "มีทอง", room: "204", dataBase64: "QUFB", mimeType: "image/jpeg" };

  it("returns the fileId from a TOP-LEVEL write envelope (the HTTP-200 bug)", async () => {
    callMock.mockResolvedValue({ ok: true, id: "u1", fileId: "drive-1", createdAt: "2026-07-25 10:00" });
    const res = await POST(postReq(goodBody));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toMatchObject({ ok: true, fileId: "drive-1", id: "u1" });
  });

  it("also accepts a result-wrapped envelope (future-proof)", async () => {
    callMock.mockResolvedValue({ ok: true, result: { id: "u2", fileId: "drive-2" } });
    const res = await POST(postReq(goodBody));
    expect((await res.json()).fileId).toBe("drive-2");
  });

  it("fails loudly when the backend answers ok but without a fileId (old backend)", async () => {
    callMock.mockResolvedValue({ ok: true });
    const res = await POST(postReq(goodBody));
    expect(res.status).toBe(502);
    expect((await res.json()).ok).toBe(false);
  });

  it("stamps creator from the session, never from the client body", async () => {
    callMock.mockResolvedValue({ ok: true, fileId: "drive-3" });
    await POST(postReq({ ...goodBody, creator: "hacker@evil" }));
    const [, sent] = callMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(sent.creator).toBe("sale@apt.test");
  });

  it("rejects unauthenticated, missing fields, and oversized payloads", async () => {
    authMock.mockResolvedValueOnce(null);
    expect((await POST(postReq(goodBody))).status).toBe(401);

    expect((await POST(postReq({ building: "มีทอง", room: "204" }))).status).toBe(400);

    const huge = { ...goodBody, dataBase64: "A".repeat(8_000_001) };
    expect((await POST(postReq(huge))).status).toBe(413);
    expect(callMock).not.toHaveBeenCalled();
  });

  it("surfaces the backend error message on ok:false", async () => {
    callMock.mockResolvedValue({ ok: false, error: "รูปใหญ่เกินไป (ย่อรูปก่อนส่ง)" });
    const res = await POST(postReq(goodBody));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("รูปใหญ่เกินไป");
  });
});

describe("POST action:setNote (v3.25.1 fill-once description)", () => {
  const noteBody = { action: "setNote", id: "p1", note: "รอยขีดผนัง" };

  it("forwards to updatePhotoNote with the session creator", async () => {
    callMock.mockResolvedValue({ ok: true, id: "p1", note: "รอยขีดผนัง" });
    const res = await POST(postReq(noteBody));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    const [action, sent] = callMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(action).toBe("updatePhotoNote");
    expect(sent).toMatchObject({ id: "p1", note: "รอยขีดผนัง", creator: "sale@apt.test" });
  });

  it("translates old-backend 'unknown action' into a redeploy hint", async () => {
    callMock.mockResolvedValue({ ok: false, error: "unknown action: updatePhotoNote" });
    const res = await POST(postReq(noteBody));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("v3.25.1");
  });

  it("surfaces the write-once rejection as-is", async () => {
    callMock.mockResolvedValue({ ok: false, error: "รูปนี้มีคำอธิบายแล้ว แก้ไม่ได้ (เป็นหลักฐาน)" });
    const res = await POST(postReq(noteBody));
    expect((await res.json()).error).toContain("มีคำอธิบายแล้ว");
  });

  it("rejects missing id / empty note without calling upstream", async () => {
    expect((await POST(postReq({ action: "setNote", note: "x" }))).status).toBe(400);
    expect((await POST(postReq({ action: "setNote", id: "p1", note: "  " }))).status).toBe(400);
    expect(callMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/room-photos", () => {
  it("unwraps rows from the result envelope", async () => {
    callMock.mockResolvedValue({ ok: true, result: { rows: [{ id: "p1", fileId: "f1" }] } });
    const res = await GET(new Request("http://test/api/room-photos?building=มีทอง&room=204"));
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.rows).toHaveLength(1);
    // read path is idempotent → retried
    const [, , opts] = callMock.mock.calls[0] as [string, unknown, { idempotent?: boolean }];
    expect(opts.idempotent).toBe(true);
  });
});
