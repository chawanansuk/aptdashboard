import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level guards for /api/sheet/update (audit r36), Apps Script
 * mocked at the appsScriptCall seam:
 *  - an engineer's task edit must not wipe the customer name/phone the
 *    tasks API blanked for them;
 *  - re-typing a task through updateTask passes the same type gate as
 *    creating one (an unchanged type is not a change).
 */

const authMock = vi.fn();
const callMock = vi.fn();

vi.mock("@/auth", () => ({ auth: () => authMock() }));
vi.mock("@/lib/appsScriptFetch", () => ({
  appsScriptCall: (...args: unknown[]) => callMock(...args),
  AppsScriptError: class AppsScriptError extends Error {
    status = 502;
  },
}));
const cachedTasks = vi.fn((): { id: string; type: string }[] => []);
vi.mock("@/lib/dashboardCache", () => ({
  getTasksCacheState: () => ({ state: "fresh", data: cachedTasks(), ageMs: 0 }),
  peekEmergencyTasksCache: () => null,
  invalidateDashboardCache: vi.fn(),
}));
vi.mock("@/lib/redisCache", () => ({
  redisBumpEpoch: vi.fn(), redisDel: vi.fn(), REDIS_ROOMS_KEY: "r", REDIS_TASKS_KEY: "t",
}));

import { POST } from "./route";

function post(body: unknown): Promise<Response> {
  return POST(new Request("http://test/api/sheet/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

function as(...roles: string[]) {
  authMock.mockResolvedValue({ user: { email: "u@apt.test", roles } });
}

const EDIT = {
  action: "updateTask",
  id: "T-1",
  matchDate: "2026-09-24", matchType: "ย้ายเข้า", matchBuilding: "มั่งมี", matchRoom: "104",
  date: "2026-09-24", customer: "", phone: "", note: "ตรวจห้องแล้ว",
};

beforeEach(() => {
  authMock.mockReset();
  callMock.mockReset().mockResolvedValue({ ok: true });
});

describe("POST /api/sheet/update — updateTask guards", () => {
  it("engineer edit: customer/phone are not forwarded, so the sheet keeps them", async () => {
    as("engineer");
    const res = await post(EDIT);
    expect(res.status).toBe(200);
    const payload = callMock.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.note).toBe("ตรวจห้องแล้ว");
    expect(payload).not.toHaveProperty("customer");
    expect(payload).not.toHaveProperty("phone");
  });

  it("sales edit still writes customer/phone", async () => {
    as("sales");
    await post({ ...EDIT, customer: "คุณเอ", phone: "0812345678" });
    const payload = callMock.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toMatchObject({ customer: "คุณเอ", phone: "0812345678" });
  });

  it("engineer cannot re-type a task into a sales type", async () => {
    as("engineer");
    const res = await post({ ...EDIT, matchType: "ซ่อม", type: "ย้ายเข้า" });
    expect(res.status).toBe(403);
    expect(callMock).not.toHaveBeenCalled();
  });

  it("sending the unchanged type is not a re-type", async () => {
    as("engineer");
    const res = await post({ ...EDIT, type: "ย้ายเข้า" });
    expect(res.status).toBe(200);
  });
  it("the type the server knows wins over the matchType the client claims (audit r38)", async () => {
    as("engineer");
    cachedTasks.mockReturnValueOnce([{ id: "T-1", type: "ย้ายเข้า" }]);
    // claims the task already was a ย้ายเข้า… it was, so this is unchanged → ok
    expect((await post({ ...EDIT, type: "ย้ายเข้า" })).status).toBe(200);
    // sales claims a ซ่อม task "was" ซ่อม while it is really a ย้ายเข้า → a re-type into ซ่อม
    as("sales");
    cachedTasks.mockReturnValueOnce([{ id: "T-1", type: "ย้ายเข้า" }]);
    expect((await post({ ...EDIT, matchType: "ซ่อม", type: "ซ่อม" })).status).toBe(403);
  });
});

describe("POST /api/sheet/update — reopen (audit r38)", () => {
  it("an empty status from an old page is sent as 'pending', never '' (Apps Script read '' as done)", async () => {
    as("engineer");
    await post({ action: "updateTaskStatus", id: "T-1", date: "2026-09-24", type: "ซ่อม", building: "มั่งมี", room: "104", status: "" });
    expect(callMock.mock.calls[0][1]).toMatchObject({ status: "pending" });
  });
});
