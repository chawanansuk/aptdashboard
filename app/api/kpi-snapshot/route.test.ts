import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const getMock = vi.fn();
const setMock = vi.fn();
let enabled = true;

vi.mock("@/auth", () => ({ auth: () => authMock() }));
vi.mock("@/lib/redisCache", () => ({
  redisEnabled: () => enabled,
  redisGetJson: (k: string) => getMock(k),
  redisSetJson: (...a: unknown[]) => setMock(...a),
}));

import { GET, POST } from "./route";
import { lastBangkokDates } from "@/lib/kpiSnapshot";

const as = (...roles: string[]) => authMock.mockResolvedValue({ user: { email: "u@apt.test", roles } });
const post = (body: unknown) => POST(new Request("http://t/api/kpi-snapshot", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}));
const SNAP = { "ทั้งหมด": { available: 5, pending: 2, moveout: 1 }, KL: { available: 1, pending: 0, moveout: 0 } };

beforeEach(() => {
  enabled = true;
  authMock.mockReset(); getMock.mockReset().mockResolvedValue(null); setMock.mockReset().mockResolvedValue(undefined);
});

describe("/api/kpi-snapshot", () => {
  it("same audience as the sales page: engineer is refused, signed-out is 401", async () => {
    as("engineer");
    expect((await GET()).status).toBe(403);
    expect((await post({ snapshot: SNAP })).status).toBe(403);
    authMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(setMock).not.toHaveBeenCalled();
  });

  it("POST stores under TODAY's Bangkok key — the date is the server's", async () => {
    as("sales");
    const res = await post({ snapshot: SNAP, date: "2020-01-01" });
    expect(res.status).toBe(200);
    const today = lastBangkokDates(1)[0];
    expect(setMock).toHaveBeenCalledWith(`apt:v1:kpi:${today}`, SNAP, expect.any(Number));
  });

  it("POST rejects a malformed snapshot", async () => {
    as("management");
    expect((await post({ snapshot: { KL: { available: 1, pending: 0, moveout: 0 } } })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect(setMock).not.toHaveBeenCalled();
  });

  it("GET returns the previous 6 days, oldest first, null where nothing was stored", async () => {
    as("sales");
    const dates = lastBangkokDates(7).slice(0, -1);
    getMock.mockImplementation(async (k: string) => (k.endsWith(dates[5]) ? SNAP : null));
    const j = await (await GET()).json();
    expect(j.days.map((d: { date: string }) => d.date)).toEqual(dates);
    expect(j.days[5].snapshot).toEqual(SNAP);
    expect(j.days[0].snapshot).toBeNull();
  });

  it("without Redis: answers enabled:false and stores nothing", async () => {
    enabled = false;
    as("sales");
    expect(await (await GET()).json()).toMatchObject({ ok: true, enabled: false, days: [] });
    expect(await (await post({ snapshot: SNAP })).json()).toMatchObject({ ok: true, enabled: false });
    expect(setMock).not.toHaveBeenCalled();
  });
});
