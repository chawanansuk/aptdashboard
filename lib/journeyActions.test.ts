import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomView, SheetRow } from "@/types";
import {
  journeyTaskSpec, hasOpenJourneyTask, executeJourneyAction,
} from "./journeyActions";
import { MOVEOUT_CLEAN_NOTE, MOVEOUT_INSPECT_NOTE } from "./moveoutTasks";

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/realtimeBus", () => ({ publishBusEvent: vi.fn() }));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) } as Response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => vi.clearAllMocks());

function mkRoom(p: Partial<RoomView> = {}): RoomView {
  return {
    building: "Kl", room: "101", floor: "1", price: "5000",
    status: "moveout", rawStatus: "แจ้งย้ายออก", tenant: "", phone: "",
    contractEnd: "", today: false, needsCleaning: false,
    todayTasks: [], upcomingTasks: [], pastTasks: [],
    ...p,
  };
}

function mkTask(p: Partial<SheetRow>): SheetRow {
  return {
    date: "12/06/2026", type: "ทำสะอาด", building: "Kl", room: "101",
    customer: "", phone: "", note: "", status: "",
    ...p,
  };
}

describe("journeyTaskSpec", () => {
  it("maps create-actions to their marker specs", () => {
    expect(journeyTaskSpec("createCleanBefore")!.note).toBe(MOVEOUT_CLEAN_NOTE);
    expect(journeyTaskSpec("createInspect")!.note).toBe(MOVEOUT_INSPECT_NOTE);
  });
  it("skipRepair shares the QC spec (no repair → straight to checklist)", () => {
    expect(journeyTaskSpec("skipRepair")).toEqual(journeyTaskSpec("createQcChecklist"));
  });
  it("returns null for non-task actions", () => {
    expect(journeyTaskSpec("confirmBooking")).toBeNull();
    expect(journeyTaskSpec("releaseRoom")).toBeNull();
  });
});

describe("hasOpenJourneyTask", () => {
  const spec = { type: "ทำสะอาด", note: MOVEOUT_CLEAN_NOTE };

  it("true when an open marker task exists", () => {
    const room = mkRoom({ todayTasks: [mkTask({ note: MOVEOUT_CLEAN_NOTE })] });
    expect(hasOpenJourneyTask(room, spec)).toBe(true);
  });

  it("false when the marker task is closed (done/cancelled)", () => {
    const room = mkRoom({ pastTasks: [mkTask({ note: MOVEOUT_CLEAN_NOTE, status: "เสร็จ" })] });
    expect(hasOpenJourneyTask(room, spec)).toBe(false);
  });

  it("false for a different marker of the same type", () => {
    const room = mkRoom({ todayTasks: [mkTask({ note: "ทำสะอาดหลังซ่อม — เตรียม QC" })] });
    expect(hasOpenJourneyTask(room, spec)).toBe(false);
  });
});

describe("executeJourneyAction — dup guard", () => {
  it("does NOT POST when an open marker task already exists (stale-panel double click)", async () => {
    const refresh = vi.fn();
    const room = mkRoom({ todayTasks: [mkTask({ note: MOVEOUT_CLEAN_NOTE })] });
    const result = await executeJourneyAction("createCleanBefore", room, { refresh });
    expect(result).toBe("done");
    expect(fetchMock).not.toHaveBeenCalled();   // ← the guard
    expect(refresh).toHaveBeenCalled();          // still refetch to unstick the UI
  });

  it("POSTs normally when no duplicate exists", async () => {
    const refresh = vi.fn();
    const room = mkRoom();
    await executeJourneyAction("createCleanBefore", room, { refresh });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ action: "addTask", type: "ทำสะอาด", note: MOVEOUT_CLEAN_NOTE });
  });

  it("returns delegate for booking/viewing without any network call", async () => {
    const refresh = vi.fn();
    expect(await executeJourneyAction("confirmBooking", mkRoom(), { refresh })).toBe("delegate");
    expect(await executeJourneyAction("addViewing", mkRoom(), { refresh })).toBe("delegate");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("releaseRoom uses the dedicated releaseRoom action (server blanks tenant)", async () => {
    // The old code sent action updateRoomStatus with tenant:"" and the
    // test asserted it — but the route STRIPS tenant fields from that
    // action (security split), so the blanking never reached the sheet.
    // releaseRoom carries no PII; Apps Script force-blanks server-side.
    const refresh = vi.fn();
    const room = mkRoom({ tenant: "คุณเก่า", phone: "081", contractEnd: "01/01/2026" });
    await executeJourneyAction("releaseRoom", room, { refresh });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ action: "releaseRoom", status: "ว่าง" });
    expect(body.tenant).toBeUndefined();
    expect(body.phone).toBeUndefined();
  });

  it("releaseRoom falls back to a plain status write on an old backend", async () => {
    // Backend without the releaseRoom dispatch answers ok:false
    // "unknown action" — the client degrades to updateRoomStatus so
    // ปล่อยขาย still flips the room.
    fetchMock
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ ok: false, error: "unknown action: releaseRoom" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ ok: true }),
      } as Response);
    const refresh = vi.fn();
    const room = mkRoom({ tenant: "คุณเก่า" });
    await executeJourneyAction("releaseRoom", room, { refresh });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retry = JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(retry).toMatchObject({ action: "updateRoomStatus", status: "ว่าง" });
  });

  it("confirmMoveIn is a plain status hop — no tenant fields in the write", async () => {
    // Tenant preservation happens server-side by OMISSION (the writer
    // only touches fields present in the body); the route strips any
    // tenant fields from updateRoomStatus anyway.
    const refresh = vi.fn();
    const room = mkRoom({ status: "pending", tenant: "คุณจอง", phone: "089" });
    await executeJourneyAction("confirmMoveIn", room, { refresh });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ action: "updateRoomStatus", status: "มีผู้เช่า" });
    expect(body.tenant).toBeUndefined();
  });
});
