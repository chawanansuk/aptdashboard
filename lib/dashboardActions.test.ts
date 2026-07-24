import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead, SheetRow } from "@/types";
import {
  linkLeadOnViewingScheduled,
  bumpLeadOnViewingClosed,
  autoCreateMoveoutPrep,
} from "./dashboardActions";

// Silence toasts + the realtime bus — we assert on fetch traffic, not UI.
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/realtimeBus", () => ({
  publishBusEvent: vi.fn(),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.clearAllMocks();
});

function jsonRes(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

function mkLead(p: Partial<Lead>): Lead {
  return {
    id: "L1", name: "คุณเอ", phone: "0812345678", source: "อื่นๆ",
    interest: "", stage: "นัดดูแล้ว", note: "", createdAt: "", updatedAt: "",
    ...p,
  } as Lead;
}

function mkTask(p: Partial<SheetRow>): SheetRow {
  return {
    date: "10/06/2026", type: "ชมห้อง", building: "Kl", room: "101",
    customer: "", phone: "", note: "", status: "",
    ...p,
  };
}

describe("linkLeadOnViewingScheduled", () => {
  const values = {
    type: "ชมห้อง" as const, phone: "0812345678",
    customer: "คุณบี", building: "Kl", room: "101",
  };

  it("no-ops for non-viewing task types (no fetch at all)", async () => {
    await linkLeadOnViewingScheduled({ ...values, type: "ซ่อม" as never });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no-ops when phone is blank", async () => {
    await linkLeadOnViewingScheduled({ ...values, phone: "  " });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips the add when a lead with that phone already exists", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ rows: [mkLead({ phone: "0812345678" })] }));
    await linkLeadOnViewingScheduled(values);
    expect(fetchMock).toHaveBeenCalledTimes(1); // GET only, no POST
  });

  it("POSTs a new lead with the scheduled stage when the phone is unknown", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ rows: [] }));
    fetchMock.mockResolvedValueOnce(jsonRes({ ok: true }));
    await linkLeadOnViewingScheduled(values);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, post] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const body = JSON.parse(String(post.body));
    expect(body.action).toBe("add");
    expect(body.phone).toBe("0812345678");
    expect(body.stage).toBe("นัดดูแล้ว");
    expect(body.interest).toContain("Kl-101");
  });

  it("swallows network failures (never throws into the caller)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("net down"));
    await expect(linkLeadOnViewingScheduled(values)).resolves.toBeUndefined();
  });
});

describe("bumpLeadOnViewingClosed", () => {
  it("no-ops on non-viewing type / blank phone / irrelevant status", async () => {
    await bumpLeadOnViewingClosed(mkTask({ type: "ซ่อม", phone: "081" }), "เสร็จ");
    await bumpLeadOnViewingClosed(mkTask({ phone: "" }), "เสร็จ");
    await bumpLeadOnViewingClosed(mkTask({ phone: "081" }), "ยกเลิก");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("advances นัดดูแล้ว → กำลังคุย when the viewing completes", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ rows: [mkLead({ stage: "นัดดูแล้ว" })] }));
    fetchMock.mockResolvedValueOnce(jsonRes({ ok: true }));
    await bumpLeadOnViewingClosed(mkTask({ phone: "0812345678" }), "เสร็จ");

    const [, post] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const body = JSON.parse(String(post.body));
    expect(body).toMatchObject({ action: "update", id: "L1", stage: "กำลังคุย" });
  });

  it("does not POST when no lead matches the phone", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ rows: [] }));
    await bumpLeadOnViewingClosed(mkTask({ phone: "0812345678" }), "เสร็จ");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not regress a won deal on ไม่สนใจ", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ rows: [mkLead({ stage: "ปิดดีล" })] }));
    await bumpLeadOnViewingClosed(mkTask({ phone: "0812345678" }), "ไม่สนใจ");
    expect(fetchMock).toHaveBeenCalledTimes(1); // GET only
  });
});

describe("autoCreateMoveoutPrep", () => {
  it("files both prep tasks and fires onCreated when none exist", async () => {
    fetchMock.mockResolvedValue(jsonRes({ ok: true }));
    const onCreated = vi.fn();
    await autoCreateMoveoutPrep([], "Kl", "101", onCreated);

    expect(fetchMock).toHaveBeenCalledTimes(2); // ตรวจห้อง + ทำสะอาด
    const bodies = fetchMock.mock.calls.map(
      (c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)),
    );
    expect(bodies.every((b) => b.action === "addTask" && b.building === "Kl" && b.room === "101")).toBe(true);
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("skips a kind whose open prep task already exists (dup guard)", async () => {
    fetchMock.mockResolvedValue(jsonRes({ ok: true }));
    // Open cleaning task already filed for this room.
    const existing = [mkTask({ type: "ทำสะอาด", building: "Kl", room: "101", status: "" })];
    await autoCreateMoveoutPrep(existing, "Kl", "101");

    expect(fetchMock).toHaveBeenCalledTimes(1); // only ตรวจห้อง
  });

  it("does not fire onCreated when nothing was created", async () => {
    const existing = [
      mkTask({ type: "ทำสะอาด", building: "Kl", room: "101", status: "" }),
      mkTask({ type: "อื่นๆ", building: "Kl", room: "101", status: "", note: "ตรวจสภาพห้องหลังแจ้งย้ายออก — บันทึกความเสียหายก่อนคืนเงินประกัน" }),
    ];
    const onCreated = vi.fn();
    await autoCreateMoveoutPrep(existing, "Kl", "101", onCreated);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("tolerates a PERSISTENTLY failing POST and still files the other kind", async () => {
    // r11: addTask now auto-retries transient failures (resilientPost,
    // 1 + 3 attempts) — so a single rejection no longer fails a kind.
    // Simulate a HARD failure: every attempt for kind 1 rejects, then
    // kind 2 succeeds. Backoff timers are stubbed to keep the test fast.
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
    fetchMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(jsonRes({ ok: true }));
    const onCreated = vi.fn();
    await autoCreateMoveoutPrep([], "Kl", "101", onCreated);
    expect(fetchMock).toHaveBeenCalledTimes(5); // 4 attempts kind1 + 1 kind2
    expect(onCreated).toHaveBeenCalledTimes(1); // the other kind still landed
    vi.restoreAllMocks();
  });

  it("a TRANSIENT failure now recovers by itself (r11 retry)", async () => {
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
    fetchMock
      .mockRejectedValueOnce(new Error("blip"))
      .mockResolvedValueOnce(jsonRes({ ok: true }))
      .mockResolvedValueOnce(jsonRes({ ok: true }));
    const onCreated = vi.fn();
    await autoCreateMoveoutPrep([], "Kl", "101", onCreated);
    expect(onCreated).toHaveBeenCalledTimes(1);
    // kind1: fail+retry-success (2 calls) + kind2: success (1 call)
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.restoreAllMocks();
  });
});
