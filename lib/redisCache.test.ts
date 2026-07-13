import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  redisEnabled, redisGetJson, redisSetJson, redisDel, isCachedSlice,
} from "./redisCache";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result: "OK" }),
  } as Response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "tok");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("redisEnabled / no-op without env", () => {
  it("disabled when env vars are missing — every op is a silent no-op", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    expect(redisEnabled()).toBe(false);
    expect(await redisGetJson("k")).toBeNull();
    await redisSetJson("k", { a: 1 }, 60);
    await redisDel("k");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts the Vercel-KV env names as fallback", () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "https://kv.example.io");
    vi.stubEnv("KV_REST_API_TOKEN", "tok2");
    expect(redisEnabled()).toBe(true);
  });
});

describe("redisGetJson", () => {
  it("parses the stored JSON string", async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ result: JSON.stringify({ at: 123, rows: [1, 2] }) }),
    } as Response);
    const v = await redisGetJson<{ at: number; rows: number[] }>("apt:v1:tasks");
    expect(v).toEqual({ at: 123, rows: [1, 2] });
    // Command shape: ["GET", key] with bearer auth
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://fake.upstash.io");
    expect(JSON.parse(String(init.body))).toEqual(["GET", "apt:v1:tasks"]);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("returns null on a missing key", async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200, json: async () => ({ result: null }),
    } as Response);
    expect(await redisGetJson("nope")).toBeNull();
  });

  it("returns null (never throws) on HTTP error / network failure / bad JSON", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response);
    expect(await redisGetJson("k")).toBeNull();

    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    expect(await redisGetJson("k")).toBeNull();

    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ result: "{corrupt" }),
    } as Response);
    expect(await redisGetJson("k")).toBeNull();
  });
});

describe("redisSetJson", () => {
  it("issues SET key value EX ttl", async () => {
    await redisSetJson("apt:v1:rooms", { at: 1, rows: [] }, 3600);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const cmd = JSON.parse(String(init.body));
    expect(cmd[0]).toBe("SET");
    expect(cmd[1]).toBe("apt:v1:rooms");
    expect(JSON.parse(cmd[2])).toEqual({ at: 1, rows: [] });
    expect(cmd[3]).toBe("EX");
    expect(cmd[4]).toBe(3600);
  });

  it("skips oversized values instead of erroring (Upstash ~1MB body cap)", async () => {
    const huge = { rows: "x".repeat(950_000) };
    await redisSetJson("k", huge, 60);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("redisDel", () => {
  it("deletes multiple keys in one command", async () => {
    await redisDel("apt:v1:rooms", "apt:v1:tasks");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual(["DEL", "apt:v1:rooms", "apt:v1:tasks"]);
  });

  it("no-ops on an empty key list", async () => {
    await redisDel();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("isCachedSlice", () => {
  it("accepts the envelope and rejects drifted shapes", () => {
    expect(isCachedSlice({ at: 1, rows: [] })).toBe(true);
    expect(isCachedSlice(null)).toBe(false);
    expect(isCachedSlice({ rows: [] })).toBe(false);
    expect(isCachedSlice({ at: "old", rows: [] })).toBe(false);
    expect(isCachedSlice({ at: 1, rows: "not-array" })).toBe(false);
  });
});
