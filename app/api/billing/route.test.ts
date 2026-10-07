import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const callMock = vi.fn();

vi.mock("@/auth", () => ({ auth: () => authMock() }));
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
      { building: "มั่งมี", room: "101", elecCur: 1290, waterCur: 56, roomPrice: 4500,
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
      { building: "มั่งมี", room: "101", elecCur: 1290, waterCur: 56, rent: 1, parking: 9999, roomPrice: 4500 },
    ] });
    w = callMock.mock.calls.find((c) => c[0] === "saveMeterReadings")![1] as { items: Record<string, unknown>[] };
    expect(w.items[0]).toMatchObject({ rent: 4500, total: 5056 });
    expect(w.items[0]).not.toHaveProperty("parking");
  });

  it("no rate for the building → readings and units are saved, amounts are not written", async () => {
    as("management");
    await post({ action: "saveReadings", month: "2026-10", items: [
      { building: "KL", room: "201", elecPrev: 10, elecCur: 20, waterPrev: 1, waterCur: 2, roomPrice: 3000 },
    ] });
    const w = callMock.mock.calls.find((c) => c[0] === "saveMeterReadings")![1] as { items: Record<string, unknown>[] };
    expect(w.items[0]).toMatchObject({ elecUnits: 10, waterUnits: 1 });
    expect(w.items[0]).not.toHaveProperty("elecCost");
    expect(w.items[0]).not.toHaveProperty("total");
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
