import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cachedFetchJson, bustCachedFetch, _clearCachedFetch, CACHED_FETCH_TTL_MS } from "./cachedFetchJson";

const fetchMock = vi.fn();

beforeEach(() => {
  _clearCachedFetch();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
});

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe("cachedFetchJson", () => {
  it("returns parsed JSON and caches it within TTL", async () => {
    fetchMock.mockResolvedValueOnce(ok({ rows: [1] }));
    const a = await cachedFetchJson<{ rows: number[] }>("/api/x");
    const b = await cachedFetchJson<{ rows: number[] }>("/api/x");
    expect(a).toEqual({ rows: [1] });
    expect(b).toEqual({ rows: [1] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("dedups concurrent in-flight callers to one network request", async () => {
    let resolveFetch: ((r: Response) => void) | null = null;
    fetchMock.mockReturnValueOnce(new Promise<Response>((res) => { resolveFetch = res; }));
    const p1 = cachedFetchJson<{ n: number }>("/api/y");
    const p2 = cachedFetchJson<{ n: number }>("/api/y");
    const p3 = cachedFetchJson<{ n: number }>("/api/y");
    resolveFetch!(ok({ n: 42 }));
    const [a, b, c] = await Promise.all([p1, p2, p3]);
    expect(a).toEqual({ n: 42 });
    expect(b).toEqual({ n: 42 });
    expect(c).toEqual({ n: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches after TTL expires", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(ok({ v: 1 }));
    fetchMock.mockResolvedValueOnce(ok({ v: 2 }));
    const a = await cachedFetchJson<{ v: number }>("/api/z");
    expect(a).toEqual({ v: 1 });
    vi.advanceTimersByTime(CACHED_FETCH_TTL_MS + 1);
    const b = await cachedFetchJson<{ v: number }>("/api/z");
    expect(b).toEqual({ v: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bustCachedFetch forces a refetch", async () => {
    fetchMock.mockResolvedValueOnce(ok({ v: 1 }));
    fetchMock.mockResolvedValueOnce(ok({ v: 2 }));
    const a = await cachedFetchJson<{ v: number }>("/api/q");
    bustCachedFetch("/api/q");
    const b = await cachedFetchJson<{ v: number }>("/api/q");
    expect(a).toEqual({ v: 1 });
    expect(b).toEqual({ v: 2 });
  });

  it("clears in-flight slot on error so retry works", async () => {
    fetchMock.mockRejectedValueOnce(new Error("net"));
    await expect(cachedFetchJson("/api/e")).rejects.toThrow("net");
    fetchMock.mockResolvedValueOnce(ok({ v: "ok" }));
    const b = await cachedFetchJson<{ v: string }>("/api/e");
    expect(b).toEqual({ v: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws on non-2xx responses without poisoning cache", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response);
    await expect(cachedFetchJson("/api/bad")).rejects.toThrow(/500/);
    fetchMock.mockResolvedValueOnce(ok({ v: 9 }));
    const b = await cachedFetchJson<{ v: number }>("/api/bad");
    expect(b).toEqual({ v: 9 });
  });

  it("treats different URLs as independent cache entries", async () => {
    fetchMock.mockResolvedValueOnce(ok({ k: "a" }));
    fetchMock.mockResolvedValueOnce(ok({ k: "b" }));
    const a = await cachedFetchJson<{ k: string }>("/api/m");
    const b = await cachedFetchJson<{ k: string }>("/api/n");
    expect(a).toEqual({ k: "a" });
    expect(b).toEqual({ k: "b" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses 'no-cache' so the browser ETag/304 flow stays intact", async () => {
    fetchMock.mockResolvedValueOnce(ok({ v: 1 }));
    await cachedFetchJson("/api/x");
    expect(fetchMock).toHaveBeenCalledWith("/api/x", { cache: "no-cache" });
  });

  it("rejects with AbortError when the signal aborts mid-flight without poisoning the cache for others", async () => {
    let resolveFetch: ((r: Response) => void) | null = null;
    fetchMock.mockReturnValueOnce(new Promise<Response>((res) => { resolveFetch = res; }));

    const ac = new AbortController();
    const p1 = cachedFetchJson("/api/abortable", ac.signal);
    const p2 = cachedFetchJson("/api/abortable"); // no signal

    ac.abort();
    await expect(p1).rejects.toThrow(/abort/i);

    // The other caller still sees the resolved value (one fetch, shared promise).
    resolveFetch!(ok({ v: 7 }));
    await expect(p2).resolves.toEqual({ v: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects synchronously if the signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(cachedFetchJson("/api/x", ac.signal)).rejects.toThrow(/abort/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
