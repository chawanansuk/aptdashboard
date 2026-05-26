/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { useTaskTimer, formatDuration } from "./useTaskTimer";

const fetchMock = vi.fn();

interface MockState {
  logs?: Array<{ durationMin: number }>;
  active?: { taskKey: string; startedAt: string } | null;
}

function routeFetch(state: MockState) {
  fetchMock.mockImplementation((url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === "POST") return Promise.resolve({ json: async () => ({ ok: true }) });
    if (url.includes("active=1")) return Promise.resolve({ json: async () => ({ active: state.active ?? null }) });
    if (url.includes("taskKey=")) return Promise.resolve({ json: async () => ({ rows: state.logs ?? [] }) });
    return Promise.resolve({ json: async () => ({}) });
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("formatDuration", () => {
  it("formats minutes as h:mm", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(130)).toBe("2:10");
  });
});

describe("useTaskTimer", () => {
  it("is idle and does not fetch when taskKey is null", () => {
    const { result } = renderHook(() => useTaskTimer(null));
    expect(result.current.status).toBe("idle");
    expect(result.current.active).toBeNull();
    expect(result.current.totalMin).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sums closed log durations into totalMin (idle)", async () => {
    routeFetch({ logs: [{ durationMin: 10 }, { durationMin: 5 }], active: null });
    const { result } = renderHook(() => useTaskTimer("K1"));
    await waitFor(() => expect(result.current.logs).toHaveLength(2));
    expect(result.current.status).toBe("idle");
    expect(result.current.totalMin).toBe(15);
  });

  it("marks running when the active timer belongs to this task", async () => {
    routeFetch({ active: { taskKey: "K1", startedAt: "2026-05-26 10:00:00" } });
    const { result } = renderHook(() => useTaskTimer("K1"));
    await waitFor(() => expect(result.current.status).toBe("running"));
    expect(result.current.active?.taskKey).toBe("K1");
  });

  it("ignores an active timer that belongs to a different task", async () => {
    routeFetch({ active: { taskKey: "OTHER", startedAt: "2026-05-26 10:00:00" } });
    const { result } = renderHook(() => useTaskTimer("K1"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(result.current.active).toBeNull();
  });

  it("start() posts action:start then refreshes to running", async () => {
    let active: { taskKey: string; startedAt: string } | null = null;
    fetchMock.mockImplementation((url: string, init?: { method?: string }) => {
      if (init?.method === "POST") {
        active = { taskKey: "K1", startedAt: "2026-05-26 10:00:00" };
        return Promise.resolve({ json: async () => ({ ok: true }) });
      }
      if (url.includes("active=1")) return Promise.resolve({ json: async () => ({ active }) });
      return Promise.resolve({ json: async () => ({ rows: [] }) });
    });
    const { result } = renderHook(() => useTaskTimer("K1"));
    await waitFor(() => expect(result.current.status).toBe("idle"));

    await act(async () => { await result.current.start(); });
    await waitFor(() => expect(result.current.status).toBe("running"));

    const postCall = fetchMock.mock.calls.find((c) => (c[1] as { method?: string })?.method === "POST");
    expect(JSON.parse((postCall![1] as { body: string }).body)).toMatchObject({
      action: "start", taskKey: "K1",
    });
  });

  it("surfaces an error when starting fails", async () => {
    fetchMock.mockImplementation((url: string, init?: { method?: string }) => {
      if (init?.method === "POST") return Promise.resolve({ json: async () => ({ ok: false, error: "เริ่มไม่ได้" }) });
      if (url.includes("active=1")) return Promise.resolve({ json: async () => ({ active: null }) });
      return Promise.resolve({ json: async () => ({ rows: [] }) });
    });
    const { result } = renderHook(() => useTaskTimer("K1"));
    await waitFor(() => expect(result.current.status).toBe("idle"));
    await act(async () => { await result.current.start(); });
    expect(result.current.error).toBe("เริ่มไม่ได้");
    expect(result.current.status).toBe("idle");
  });
});
