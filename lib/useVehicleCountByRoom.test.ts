/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useVehicleCountByRoom } from "./useVehicleCountByRoom";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("useVehicleCountByRoom", () => {
  it("builds a count map keyed by building|room", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        rows: [
          { building: "A", room: "101" },
          { building: "A", room: "101" },
          { building: "B", room: "202" },
        ],
      }),
    });
    const { result } = renderHook(() => useVehicleCountByRoom());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.get("A", "101")).toBe(2);
    expect(result.current.get("B", "202")).toBe(1);
    expect(result.current.get("C", "303")).toBe(0); // unknown → 0
  });

  it("silent-fails to an empty map on fetch error", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useVehicleCountByRoom());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.get("A", "101")).toBe(0);
  });

  it("refresh() re-fetches", async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ rows: [{ building: "A", room: "101" }] }) });
    const { result } = renderHook(() => useVehicleCountByRoom());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => result.current.refresh());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
