/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAssetAlertCounts } from "./useAssetAlertCounts";
import { _clearCachedFetch } from "./cachedFetchJson";

const fetchMock = vi.fn();

// Crafted so the REAL classifiers (isLowStock, getMaintenanceStatus) decide:
//   parts: 1 low-stock (stock ≤ threshold, threshold > 0)
//   equipment: 1 overdue (interval set, last service far in the past)
const parts = [
  { stock: 2, threshold: 5 }, // low
  { stock: 8, threshold: 5 }, // ok
  { stock: 0, threshold: 0 }, // ok (threshold 0 → not tracked)
];
const equipment = [
  { intervalDays: 1, lastService: "2000-01-01", installDate: "" }, // overdue
  { intervalDays: 0, lastService: "", installDate: "" },           // unknown (no schedule)
];

function routeFetch(opts: { partsReject?: boolean } = {}) {
  fetchMock.mockImplementation((url: string) => {
    if (url.startsWith("/api/parts")) {
      return opts.partsReject
        ? Promise.reject(new Error("network"))
        : Promise.resolve({ ok: true, status: 200, json: async () => ({ rows: parts }) });
    }
    if (url.startsWith("/api/maintenance-plan")) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ rows: equipment }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  _clearCachedFetch();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("useAssetAlertCounts", () => {
  it("does not fetch and reports zeros when disabled", () => {
    routeFetch();
    const { result } = renderHook(() => useAssetAlertCounts(false));
    expect(result.current).toEqual({ lowStockParts: 0, overdueEquipment: 0, loading: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("counts low-stock parts and overdue equipment when enabled", async () => {
    routeFetch();
    const { result } = renderHook(() => useAssetAlertCounts(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.lowStockParts).toBe(1);
    expect(result.current.overdueEquipment).toBe(1);
  });

  it("degrades per-endpoint: a failed parts fetch → 0 parts, equipment still counted", async () => {
    routeFetch({ partsReject: true });
    const { result } = renderHook(() => useAssetAlertCounts(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.lowStockParts).toBe(0);
    expect(result.current.overdueEquipment).toBe(1);
  });
});
