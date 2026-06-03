/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useEquipmentCountByRoom } from "./useEquipmentCountByRoom";
import { _clearCachedFetch } from "./cachedFetchJson";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  _clearCachedFetch();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("useEquipmentCountByRoom", () => {
  it("counts equipment per building|room from /api/maintenance-plan", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        rows: [
          { building: "A", room: "101" },
          { building: "A", room: "101" },
          { building: "A", room: "102" },
        ],
      }),
    });
    const { result } = renderHook(() => useEquipmentCountByRoom());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.get("A", "101")).toBe(2);
    expect(result.current.get("A", "102")).toBe(1);
    expect(result.current.get("A", "999")).toBe(0);
  });

  it("silent-fails to an empty map on fetch error", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useEquipmentCountByRoom());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.get("A", "101")).toBe(0);
  });
});
