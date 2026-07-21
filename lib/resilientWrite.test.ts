import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resilientPost } from "./resilientWrite";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  // Make backoff instant so the suite doesn't actually wait seconds.
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
    fn();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);
});

afterEach(() => vi.restoreAllMocks());

const ok = (body: unknown = { ok: true }) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;
const server500 = () =>
  ({ ok: false, status: 502, json: async () => ({ ok: false }) }) as Response;

describe("resilientPost", () => {
  it("returns immediately on first success (no retry)", async () => {
    fetchMock.mockResolvedValueOnce(ok({ ok: true, row: 5 }));
    const onRetry = vi.fn();
    const { data } = await resilientPost("/api/x", { a: 1 }, { onRetry });
    expect(data).toEqual({ ok: true, row: 5 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("retries on HTTP 5xx then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(server500())
      .mockResolvedValueOnce(server500())
      .mockResolvedValueOnce(ok({ ok: true }));
    const onRetry = vi.fn();
    const { data } = await resilientPost("/api/x", {}, { onRetry });
    expect(data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2); // before attempts 2 and 3
    expect(onRetry).toHaveBeenLastCalledWith(3, 4);
  });

  it("retries on a thrown network error then succeeds", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(ok());
    const { data } = await resilientPost("/api/x", {});
    expect(data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a 4xx — bad body won't get better", async () => {
    const bad = { ok: false, status: 400, json: async () => ({ ok: false, error: "bad" }) } as Response;
    fetchMock.mockResolvedValueOnce(bad);
    const { res, data } = await resilientPost("/api/x", {});
    expect(res.status).toBe(400);
    expect(data.error).toBe("bad");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a 200-with-ok:false — business rejection is final", async () => {
    fetchMock.mockResolvedValueOnce(ok({ ok: false, error: "duplicate" }));
    const { data } = await resilientPost("/api/x", {});
    expect(data).toEqual({ ok: false, error: "duplicate" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("after the budget, RETURNS the final 5xx response (caller sees server's word)", async () => {
    // Contract: throw only when we never got a response (network). A final
    // HTTP response — even 5xx — is returned so the caller can surface the
    // server's error and keep the form data.
    fetchMock.mockResolvedValue(server500());
    const { res, data } = await resilientPost("/api/x", {}, { retries: 2 });
    expect(res.status).toBe(502);
    expect(data.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it("throws when EVERY attempt is a network error (no response at all)", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    await expect(resilientPost("/api/x", {}, { retries: 2 })).rejects.toThrow(/ECONNRESET/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("never retries a user abort", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
    await expect(resilientPost("/api/x", {})).rejects.toThrow(/abort/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
