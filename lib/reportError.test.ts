import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reportClientError, _resetReportErrorDedup } from "./reportError";

beforeEach(() => {
  _resetReportErrorDedup();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reportClientError", () => {
  it("posts via sendBeacon when available", () => {
    const beacon = vi.fn(() => true);
    (navigator as unknown as { sendBeacon: typeof beacon }).sendBeacon = beacon;

    reportClientError({ message: "boom", source: "test" });

    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, blob] = beacon.mock.calls[0] as unknown as [string, Blob];
    expect(url).toBe("/api/client-error");
    expect(blob).toBeInstanceOf(Blob);
  });

  it("falls back to fetch+keepalive when sendBeacon is absent", () => {
    delete (navigator as unknown as { sendBeacon?: unknown }).sendBeacon;
    const fetchMock = vi.fn(() => Promise.resolve(new Response()));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    reportClientError({ message: "boom2", source: "test" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/client-error");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
  });

  it("dedups identical errors within the 10s window", () => {
    const beacon = vi.fn(() => true);
    (navigator as unknown as { sendBeacon: typeof beacon }).sendBeacon = beacon;

    reportClientError({ message: "same", stack: "stk", source: "x" });
    reportClientError({ message: "same", stack: "stk", source: "x" });
    reportClientError({ message: "same", stack: "stk", source: "x" });

    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it("treats different stack traces as different keys (one for each)", () => {
    const beacon = vi.fn(() => true);
    (navigator as unknown as { sendBeacon: typeof beacon }).sendBeacon = beacon;

    reportClientError({ message: "x", stack: "stk1", source: "a" });
    reportClientError({ message: "x", stack: "stk2", source: "a" });

    expect(beacon).toHaveBeenCalledTimes(2);
  });

  it("never throws when the browser apis blow up — logging must not surface a new error", () => {
    const broken = () => { throw new Error("beacon offline"); };
    (navigator as unknown as { sendBeacon: typeof broken }).sendBeacon = broken;

    expect(() => reportClientError({ message: "boom", source: "test" })).not.toThrow();
  });
});
