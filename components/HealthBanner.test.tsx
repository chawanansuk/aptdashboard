import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated" }) }));

import HealthBanner, { HEALTH_RETRY_DELAY_MS } from "./HealthBanner";

const TIMEOUT = { ok: false, error: "timeout", message: "Apps Script ไม่ตอบใน 20 วินาที", latencyMs: 20001 };
const OK = { ok: true, version: "3.33.0", expectedVersion: "3.33.0", outdated: false, message: "", latencyMs: 900 };
const MISSING_ENV = { ok: false, error: "missing_env", message: "SHEET_WRITE_URL ไม่ได้ตั้งค่า" };

function mockProbes(...bodies: unknown[]) {
  const fetchMock = vi.fn();
  for (const b of bodies) fetchMock.mockResolvedValueOnce({ json: async () => b });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Let the probe promises settle, then run the retry pause. */
async function flush(ms = 0) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("<HealthBanner> (B-hardening)", () => {
  it("a single slow probe that recovers on the re-probe shows nothing", async () => {
    const fetchMock = mockProbes(TIMEOUT, OK);
    const { container } = render(<HealthBanner />);
    await flush();
    expect(container.querySelector(".ac-health-banner")).toBeNull(); // not after the first failure…
    await flush(HEALTH_RETRY_DELAY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector(".ac-health-banner")).toBeNull(); // …nor after the recovery
  });

  it("slow twice → a calm 'Google is slow' notice, not 'ติดต่อไม่ได้'", async () => {
    mockProbes(TIMEOUT, TIMEOUT);
    const { container } = render(<HealthBanner />);
    await flush();
    await flush(HEALTH_RETRY_DELAY_MS);
    const banner = container.querySelector(".ac-health-banner");
    expect(banner).not.toBeNull();
    expect(banner!.className).toContain("ac-health-banner-warn");
    expect(banner!.getAttribute("role")).toBe("status");
    expect(banner!.textContent).toContain("ตอบช้า");
    expect(banner!.textContent).not.toContain("ติดต่อไม่ได้");
  });

  it("configuration errors are shown at once, without a re-probe", async () => {
    const fetchMock = mockProbes(MISSING_ENV);
    const { container } = render(<HealthBanner />);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const banner = container.querySelector(".ac-health-banner");
    expect(banner?.getAttribute("role")).toBe("alert");
    expect(banner?.textContent).toContain("Vercel env หาย");
  });
});
