import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SwrSlot } from "./serverSwr";
import {
  dropTasksCacheIfOlderThan, getTasksCacheState, invalidateDashboardCache,
  setTasksCache, setTasksCacheIfCurrent, tasksCacheGeneration,
} from "./dashboardCache";
import { redisBumpEpoch, redisGetEpoch } from "./redisCache";

/**
 * r34 (audit): แคชข้ามเครื่อง Vercel + revalidate ค้างเขียนทับ
 *  - generation: fetch ที่เริ่มก่อนมีคนบันทึก ห้ามเอาผลมาเขียนทับหลังบันทึก
 *  - epoch: entry ที่ดึงมาก่อน "เวลาบันทึกล่าสุด" (จาก Redis) ต้องถูกทิ้ง
 */

describe("SwrSlot generation / epoch (serverSwr)", () => {
  it("setIfCurrent is rejected after an invalidate() that happened mid-fetch", () => {
    const s = new SwrSlot<number[]>();
    const gen = s.generation();
    s.invalidate(); // a write landed while the fetch was in flight
    expect(s.setIfCurrent([1, 2], gen)).toBe(false);
    expect(s.get().state).toBe("missing");
    // a fetch started AFTER the write is accepted
    expect(s.setIfCurrent([3], s.generation())).toBe(true);
    expect(s.get().data).toEqual([3]);
  });

  it("dropIfOlderThan drops an entry fetched before the last write, keeps newer ones", () => {
    const s = new SwrSlot<number[]>();
    s.set([1], 1_000);
    expect(s.dropIfOlderThan(2_000)).toBe(true);
    expect(s.get().state).toBe("missing");
    s.set([2], 3_000);
    expect(s.dropIfOlderThan(2_000)).toBe(false);
    expect(s.get(3_001).data).toEqual([2]);
  });
});

describe("dashboardCache generation / epoch", () => {
  beforeEach(() => invalidateDashboardCache());
  afterEach(() => invalidateDashboardCache());

  it("a stale background revalidate cannot resurrect pre-write rows", () => {
    const gen = tasksCacheGeneration();
    invalidateDashboardCache(); // write
    expect(setTasksCacheIfCurrent([], gen)).toBe(false);
    expect(getTasksCacheState().state).toBe("missing");
  });

  it("dropTasksCacheIfOlderThan honours the cross-instance write epoch", () => {
    setTasksCache([], 1_000);
    expect(dropTasksCacheIfOlderThan(5_000)).toBe(true);
    expect(getTasksCacheState().state).toBe("missing");
  });
});

describe("redis epoch helpers", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ result: "OK" }) } as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "tok");
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it("bump writes one MSET with a numeric timestamp per family", async () => {
    await redisBumpEpoch("rooms", "tasks");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const cmd = JSON.parse(String(init.body)) as (string | number)[];
    expect(cmd[0]).toBe("MSET");
    expect(cmd[1]).toBe("apt:v1:epoch:rooms");
    expect(typeof cmd[2]).toBe("number");
    expect(cmd[3]).toBe("apt:v1:epoch:tasks");
  });

  it("get parses the stored timestamp; null when missing or unconfigured", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ result: "1700000000000" }) } as Response);
    expect(await redisGetEpoch("tasks")).toBe(1700000000000);
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ result: null }) } as Response);
    expect(await redisGetEpoch("tasks")).toBeNull();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    expect(await redisGetEpoch("tasks")).toBeNull();
  });
});
