import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { appsScriptCall } from "./appsScriptFetch";

/**
 * Regression test for the action-spread bug:
 * /api/room-equipment forwards the client's whole body (which includes
 * `action: "add"`) to appsScriptCall("addEquipment", body). The wrapper
 * must guarantee the EXPLICIT `action` parameter wins over body.action,
 * otherwise Apps Script receives `action: "add"` → "unknown action: add".
 */

describe("appsScriptCall — action spread precedence", () => {
  const ORIG_FETCH = global.fetch;
  let capturedPayload: string | null = null;

  beforeEach(() => {
    capturedPayload = null;
    process.env.SHEET_WRITE_URL = "https://script.google.com/macros/s/MOCK/exec";
    global.fetch = vi.fn(async (_url: unknown, init?: { body?: BodyInit }) => {
      capturedPayload = typeof init?.body === "string" ? init.body : null;
      return new Response(
        JSON.stringify({ ok: true, result: {} }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = ORIG_FETCH;
    delete process.env.SHEET_WRITE_URL;
  });

  it("explicit action parameter wins over body.action", async () => {
    await appsScriptCall("addEquipment", {
      action: "add",  // intentionally stale — should be overridden
      building: "Kl",
      room: "101",
      type: "แอร์",
    });

    expect(capturedPayload).not.toBeNull();
    const sent = JSON.parse(capturedPayload!);
    expect(sent.action).toBe("addEquipment");
    expect(sent.building).toBe("Kl");
    expect(sent.room).toBe("101");
    expect(sent.type).toBe("แอร์");
  });

  it("uses parameter action when body has no action field", async () => {
    await appsScriptCall("getTasks", {});
    const sent = JSON.parse(capturedPayload!);
    expect(sent.action).toBe("getTasks");
  });

  it("preserves other body fields untouched", async () => {
    await appsScriptCall("updateEquipment", {
      action: "update",
      id: "abc-123",
      status: "ปกติ",
      lastService: "2026-05-19",
    });
    const sent = JSON.parse(capturedPayload!);
    expect(sent.action).toBe("updateEquipment");
    expect(sent.id).toBe("abc-123");
    expect(sent.status).toBe("ปกติ");
    expect(sent.lastService).toBe("2026-05-19");
  });
});

describe("appsScriptCall — non-idempotent writes never retry (dup-append guard)", () => {
  const ORIG_FETCH = global.fetch;

  beforeEach(() => {
    process.env.SHEET_WRITE_URL = "https://script.google.com/macros/s/MOCK/exec";
  });
  afterEach(() => {
    global.fetch = ORIG_FETCH;
    delete process.env.SHEET_WRITE_URL;
  });

  it("does not retry a write on HTTP 500 (single fetch)", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("upstream boom", { status: 500 }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    // A retry here could duplicate an already-committed append, so the
    // write must hit the network exactly once and surface the error.
    await expect(appsScriptCall("addRequisition", { partId: "p1", quantity: 1 }))
      .rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries an idempotent read on HTTP 500", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("upstream boom", { status: 500 }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      appsScriptCall("getTasks", {}, { idempotent: true }),
    ).rejects.toThrow();
    // Reads still retry through the configured backoff (> 1 attempt).
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });
});
