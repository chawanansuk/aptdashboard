import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { RoomView } from "@/types";
import { useKpiHistory } from "./useKpiHistory";

function room(over: Partial<RoomView>): RoomView {
  return {
    building: "A", room: "101", floor: "1", price: "4500", status: "ready", rawStatus: "ว่าง",
    tenant: "", phone: "", contractEnd: "", today: false, needsCleaning: false,
    todayTasks: [], upcomingTasks: [], pastTasks: [], ...over,
  };
}
const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ ok: true, days: [] }) });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const posts = () => fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "POST")
  .map((c) => JSON.parse((c[1] as RequestInit).body as string).snapshot["ทั้งหมด"]);

describe("useKpiHistory reporting (audit r37)", () => {
  it("reports the settled counts, not the cached first render", async () => {
    const cached = [room({ room: "101" })];                                  // stale cache: 1 vacant
    const fresh = [room({ room: "101" }), room({ room: "102", status: "pending", rawStatus: "รอสัญญา" })];
    const { rerender } = renderHook(({ r }) => useKpiHistory(r), { initialProps: { r: cached } });
    await vi.advanceTimersByTimeAsync(1_000);
    rerender({ r: fresh });                                                   // fresh data a second later
    await vi.advanceTimersByTimeAsync(6_000);
    expect(posts()).toEqual([{ available: 1, pending: 1, moveout: 0 }]);
  });

  it("a later change inside the 10-minute window is sent when the window ends, not dropped", async () => {
    const { rerender } = renderHook(({ r }) => useKpiHistory(r), { initialProps: { r: [room({})] } });
    await vi.advanceTimersByTimeAsync(6_000);
    rerender({ r: [room({ status: "moveout", rawStatus: "แจ้งย้ายออก" })] });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(posts()).toHaveLength(1);                                          // throttled…
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(posts()).toHaveLength(2);                                          // …then the latest goes out
    expect(posts()[1]).toEqual({ available: 0, pending: 0, moveout: 1 });
  });
});
