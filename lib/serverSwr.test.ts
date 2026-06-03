import { describe, expect, it, vi } from "vitest";
import { SwrSlot, serveCachedRows, DEFAULT_SWR_TTLS } from "./serverSwr";

const TTLS = DEFAULT_SWR_TTLS;

describe("SwrSlot", () => {
  it("reports missing when empty", () => {
    const s = new SwrSlot<number[]>();
    expect(s.get().state).toBe("missing");
  });

  it("reports fresh within freshMs, stale after, missing past staleMs", () => {
    const s = new SwrSlot<number[]>(TTLS);
    const t0 = 1_000_000;
    s.set([1], t0);
    expect(s.get(t0).state).toBe("fresh");
    expect(s.get(t0 + TTLS.freshMs - 1).state).toBe("fresh");
    expect(s.get(t0 + TTLS.freshMs + 1).state).toBe("stale");
    expect(s.get(t0 + TTLS.staleMs + 1).state).toBe("missing");
  });

  it("reports missing past staleMs but keeps value for emergency fallback", () => {
    const s = new SwrSlot<number[]>(TTLS);
    const t0 = 0;
    s.set([1], t0);
    const past = t0 + TTLS.staleMs + 1;
    expect(s.get(past).state).toBe("missing");
    // Value retained for emergency use within emergencyMs.
    expect(s.peekEmergency(past)).toEqual([1]);
  });

  it("peekEmergency returns value until emergencyMs, then null", () => {
    const s = new SwrSlot<number[]>(TTLS);
    const t0 = 0;
    s.set([9], t0);
    expect(s.peekEmergency(t0 + TTLS.emergencyMs)).toEqual([9]);
    expect(s.peekEmergency(t0 + TTLS.emergencyMs + 1)).toBeNull();
  });

  it("invalidate clears the slot", () => {
    const s = new SwrSlot<number[]>();
    s.set([1]);
    s.invalidate();
    expect(s.get().state).toBe("missing");
  });

  it("tryBeginRevalidation is a single-flight latch", () => {
    const s = new SwrSlot<number[]>();
    expect(s.tryBeginRevalidation()).toBe(true);
    expect(s.tryBeginRevalidation()).toBe(false);
    s.endRevalidation();
    expect(s.tryBeginRevalidation()).toBe(true);
  });
});

async function bodyOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("serveCachedRows", () => {
  it("fetches on miss, caches, and returns rows", async () => {
    const slot = new SwrSlot<number[]>();
    const fetchFresh = vi.fn(async () => [1, 2, 3]);
    const res = await serveCachedRows(slot, fetchFresh, "err");
    const body = await bodyOf(res);
    expect(body.rows).toEqual([1, 2, 3]);
    expect(body.cacheState).toBe("missing");
    expect(fetchFresh).toHaveBeenCalledTimes(1);
  });

  it("serves fresh from cache without refetching", async () => {
    const slot = new SwrSlot<number[]>();
    slot.set([7]);
    const fetchFresh = vi.fn(async () => [99]);
    const res = await serveCachedRows(slot, fetchFresh, "err");
    const body = await bodyOf(res);
    expect(body.rows).toEqual([7]);
    expect(body.cacheState).toBe("fresh");
    expect(fetchFresh).not.toHaveBeenCalled();
  });

  it("serves stale immediately and revalidates in the background", async () => {
    const slot = new SwrSlot<number[]>(TTLS);
    // Seed as stale: set at a time freshMs+1 in the past.
    slot.set([1], Date.now() - (TTLS.freshMs + 1_000));
    let resolveBg: ((v: number[]) => void) | null = null;
    const fetchFresh = vi.fn(() => new Promise<number[]>((r) => { resolveBg = r; }));
    const res = await serveCachedRows(slot, fetchFresh, "err");
    const body = await bodyOf(res);
    expect(body.rows).toEqual([1]);
    expect(body.cacheState).toBe("stale");
    expect(fetchFresh).toHaveBeenCalledTimes(1);
    // Resolve bg revalidation and confirm cache updated.
    resolveBg!([2]);
    await Promise.resolve();
    await Promise.resolve();
    expect(slot.get().data).toEqual([2]);
  });

  it("falls back to emergency-stale when upstream fails on a miss", async () => {
    const slot = new SwrSlot<number[]>(TTLS);
    // Value old enough to be "missing" for get() but within emergency window.
    slot.set([5], Date.now() - (TTLS.staleMs + 1_000));
    const fetchFresh = vi.fn(async () => { throw new Error("upstream down"); });
    const res = await serveCachedRows(slot, fetchFresh, "ดึงล้มเหลว");
    const body = await bodyOf(res);
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([5]);
    expect(body.cacheState).toBe("emergency-stale");
    expect(body.error).toContain("upstream down");
  });

  it("returns 502 with prefix when upstream fails and no cache exists", async () => {
    const slot = new SwrSlot<number[]>();
    const fetchFresh = vi.fn(async () => { throw new Error("boom"); });
    const res = await serveCachedRows(slot, fetchFresh, "ดึงล้มเหลว");
    const body = await bodyOf(res);
    expect(res.status).toBe(502);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("ดึงล้มเหลว: boom");
  });
});
