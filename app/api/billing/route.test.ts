import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const callMock = vi.fn();

vi.mock("@/auth", () => ({ auth: () => authMock() }));
// The rooms the server already knows (its own price for a room).
const roomsMock = vi.fn(() => [{ building: "มั่งมี", room: "101", price: "4,500" }]);
vi.mock("@/lib/dashboardCache", () => ({
  getRoomsCacheState: () => ({ state: "fresh", data: roomsMock(), ageMs: 0 }),
  peekEmergencyRoomsCache: () => null,
}));
vi.mock("@/lib/appsScriptFetch", () => ({
  appsScriptCall: (...args: unknown[]) => callMock(...args),
  AppsScriptError: class AppsScriptError extends Error { status = 502; },
}));

import { GET, POST } from "./route";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const as = (...roles: string[]) => authMock.mockResolvedValue({ user: { email: "u@apt.test", roles } });
const post = (body: unknown) => POST(new Request("http://t/api/billing", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}));
const get = (q: string) => GET(new Request(`http://t/api/billing${q}`));

const RATE = { building: "มั่งมี", elecRate: 8, waterRate: 18, waterMin: 100, dueDay: 5 };
const row = (o: Record<string, unknown>) => ({
  month: "2026-10", building: "มั่งมี", room: "101",
  elecPrev: null, elecCur: null, elecUnits: null, elecCost: null,
  waterPrev: null, waterCur: null, waterUnits: null, waterCost: null,
  rent: null, keyFee: null, parking: null, other: null, total: null, paidDate: "", note: "", ...o,
});
const BILLING = {
  month: "2026-10",
  rows: [row({ room: "102", elecPrev: 100, elecCur: 150, rent: 5000, total: 6000, paidDate: "2026-11-01" })],
  prevRows: [{ building: "มั่งมี", room: "101", elecCur: 1234, waterCur: 50 }],
  rates: [RATE],
};

beforeEach(() => {
  authMock.mockReset();
  callMock.mockReset().mockImplementation(async (action: string) =>
    action === "getBilling" ? { ok: true, result: BILLING } : { ok: true, saved: 1 });
});

describe("GET /api/billing", () => {
  it("managers get everything", async () => {
    as("management");
    const j = await (await get("?month=2026-10")).json();
    expect(j.finance).toBe(true);
    expect(j.rows[0]).toMatchObject({ total: 6000, paidDate: "2026-11-01" });
    expect(j.rates).toHaveLength(1);
  });

  it("other roles get readings only — no baht, no payment dates, no rates", async () => {
    as("engineer");
    const j = await (await get("?month=2026-10")).json();
    expect(j.finance).toBe(false);
    expect(j.rows[0]).toMatchObject({ elecCur: 150, total: null, rent: null, paidDate: "" });
    expect(j.rates).toEqual([]);
  });

  it("rejects a bad month and signed-out users", async () => {
    as("management");
    expect((await get("?month=10-2026")).status).toBe(400);
    authMock.mockResolvedValue(null);
    expect((await get("?month=2026-10")).status).toBe(401);
  });
});

describe("POST saveReadings", () => {
  it("computes amounts server-side from the sheet's rates; previous reading comes from last month", async () => {
    as("engineer");
    const res = await post({ action: "saveReadings", month: "2026-10", items: [
      { building: "มั่งมี", room: "101", elecCur: 1290, waterCur: 56, roomPrice: 1 /* ignored: rent comes from the server's room price */,
        rent: 1, total: 99999 /* not accepted from anyone */ },
    ] });
    expect(res.status).toBe(200);
    const write = callMock.mock.calls.find((c) => c[0] === "saveMeterReadings")![1] as { items: Record<string, unknown>[] };
    expect(write.items[0]).toMatchObject({
      building: "มั่งมี", room: "101", elecPrev: 1234, elecCur: 1290, waterPrev: 50, waterCur: 56,
      elecUnits: 56, elecCost: 448, waterUnits: 6, waterCost: 108, rent: 4500, total: 5056,
    });
    const j = await res.json();
    expect(j.results[0]).not.toHaveProperty("total"); // engineers don't see baht
  });

  it("a manager may set rent and extras; an engineer's are ignored", async () => {
    as("management");
    await post({ action: "saveReadings", month: "2026-10", items: [
      { building: "มั่งมี", room: "101", elecCur: 1290, waterCur: 56, rent: 4800, parking: 200 },
    ] });
    let w = callMock.mock.calls.find((c) => c[0] === "saveMeterReadings")![1] as { items: Record<string, unknown>[] };
    expect(w.items[0]).toMatchObject({ rent: 4800, parking: 200, total: 4800 + 448 + 108 + 200 });
    callMock.mockClear();
    as("engineer");
    await post({ action: "saveReadings", month: "2026-10", items: [
      { building: "มั่งมี", room: "101", elecCur: 1290, waterCur: 56, rent: 1, parking: 9999, roomPrice: 1 },
    ] });
    w = callMock.mock.calls.find((c) => c[0] === "saveMeterReadings")![1] as { items: Record<string, unknown>[] };
    expect(w.items[0]).toMatchObject({ rent: 4500, total: 5056 });
    expect(w.items[0]).not.toHaveProperty("parking");
  });

  it("no rate for the building → readings and units are saved, no amount (an old one is cleared)", async () => {
    as("management");
    await post({ action: "saveReadings", month: "2026-10", items: [
      { building: "KL", room: "201", elecPrev: 10, elecCur: 20, waterPrev: 1, waterCur: 2, roomPrice: 3000 },
    ] });
    const w = callMock.mock.calls.find((c) => c[0] === "saveMeterReadings")![1] as { items: Record<string, unknown>[] };
    expect(w.items[0]).toMatchObject({ elecUnits: 10, waterUnits: 1, elecCost: null, total: null });
  });

  it("'save the totals' (nothing changed) only fills blanks — hand-typed amounts survive", async () => {
    as("management");
    await post({ action: "saveReadings", month: "2026-10", items: [{ building: "KL", room: "201", roomPrice: 3000 }] });
    const w = callMock.mock.calls.find((c) => c[0] === "saveMeterReadings")![1] as { items: Record<string, unknown>[] };
    expect(w.items[0]).not.toHaveProperty("elecCost");
    expect(w.items[0]).not.toHaveProperty("total");
  });

  it("a corrected reading clears the old units/amounts instead of leaving the wrong bill (audit r38)", async () => {
    as("engineer");
    callMock.mockImplementation(async (action: string) => action === "getBilling"
      ? { ok: true, result: { ...BILLING, rows: [row({ room: "101", elecPrev: 1000, elecCur: 1300, elecUnits: 300, elecCost: 2400, total: 6508 })] } }
      : { ok: true, saved: 1 });
    await post({ action: "saveReadings", month: "2026-10", items: [{ building: "มั่งมี", room: "101", elecCur: 30 }] });
    const w = callMock.mock.calls.find((c) => c[0] === "saveMeterReadings")![1] as { items: Record<string, unknown>[] };
    expect(w.items[0]).toMatchObject({ elecCur: 30, elecUnits: null, elecCost: null, total: null });
  });

  it("an explicit null clears a mistyped reading", async () => {
    as("engineer");
    await post({ action: "saveReadings", month: "2026-10", items: [{ building: "มั่งมี", room: "102", waterCur: null }] });
    const w = callMock.mock.calls.find((c) => c[0] === "saveMeterReadings")![1] as { items: Record<string, unknown>[] };
    expect(w.items[0]).toHaveProperty("waterCur", null);
  });

  it("'KL' and 'Kl' are one building: last month's reading is found", async () => {
    as("management");
    callMock.mockImplementation(async (action: string) => action === "getBilling"
      ? { ok: true, result: { ...BILLING, rows: [], prevRows: [{ building: "KL", room: "201", elecCur: 500, waterCur: 10 }] } }
      : { ok: true, saved: 1 });
    await post({ action: "saveReadings", month: "2026-10", items: [{ building: "Kl", room: "201", elecCur: 510 }] });
    const w = callMock.mock.calls.find((c) => c[0] === "saveMeterReadings")![1] as { items: Record<string, unknown>[] };
    expect(w.items[0]).toMatchObject({ elecPrev: 500, elecUnits: 10, waterPrev: 10 });
  });

  it("an unusable room price doesn't fail the whole round", async () => {
    as("management");
    roomsMock.mockReturnValueOnce([]);
    const res = await post({ action: "saveReadings", month: "2026-10", items: [{ building: "KL", room: "201", elecCur: 5, roomPrice: 35_004_000 }] });
    expect(res.status).toBe(200);
  });
});

describe("POST setPaid / setRate", () => {
  it("managers only", async () => {
    as("sales");
    expect((await post({ action: "setPaid", month: "2026-10", building: "มั่งมี", room: "102", paidDate: "2026-11-02" })).status).toBe(403);
    expect((await post({ action: "setRate", building: "มั่งมี", elecRate: 8, waterRate: 18, waterMin: 100, dueDay: 5 })).status).toBe(403);
    as("management");
    expect((await post({ action: "setPaid", month: "2026-10", building: "มั่งมี", room: "102", paidDate: "2026-11-02" })).status).toBe(200);
    // the Code.gs action is setBillPaid — every action name sent must exist in Code.gs (see below)
    expect(callMock).toHaveBeenCalledWith("setBillPaid", expect.objectContaining({ paidDate: "2026-11-02", creator: "u@apt.test" }), expect.anything());
  });

  it("validates input", async () => {
    as("management");
    expect((await post({ action: "setPaid", month: "2026-10", building: "มั่งมี", room: "102", paidDate: "2/11/2026" })).status).toBe(400);
    expect((await post({ action: "setRate", building: "มั่งมี", elecRate: -1, waterRate: 18, waterMin: 0, dueDay: 5 })).status).toBe(400);
    expect((await post({ action: "nope" })).status).toBe(400);
  });
});

describe("contract with Code.gs", () => {
  it("every Apps Script action this route calls exists in Code.gs", async () => {
    const code = readFileSync(join(__dirname, "..", "..", "..", "apps-script", "Code.gs"), "utf8");
    as("management");
    await get("?month=2026-10");
    await post({ action: "saveReadings", month: "2026-10", items: [{ building: "มั่งมี", room: "101", elecCur: 1 }] });
    await post({ action: "setPaid", month: "2026-10", building: "มั่งมี", room: "102", paidDate: "" });
    await post({ action: "setRate", building: "มั่งมี", elecRate: 8, waterRate: 18, waterMin: 100, dueDay: 5 });
    const actions = new Set(callMock.mock.calls.map((c) => c[0] as string));
    expect([...actions].sort()).toEqual(["getBilling", "saveMeterReadings", "setBillPaid", "setRate"]);
    for (const a of actions) expect(code, a).toContain(`case '${a}':`);
  });
});
