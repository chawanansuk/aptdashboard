/**
 * Tier-2 shared cache — Upstash Redis over its REST API (no SDK dep).
 *
 * Why an L2 exists: the in-memory SWR slots (lib/dashboardCache) live
 * inside ONE warm serverless instance. Every cold start — and every
 * parallel instance Vercel spins up — starts empty and re-pays the slow
 * Apps Script fetch (2-8s). Worse, a write only invalidates the memory
 * of the instance that handled it; other warm instances keep serving
 * stale data until their TTL runs out. A tiny shared Redis fixes both:
 *
 *   read:  L1 (memory) → L2 (Redis, shared) → origin (Sheets)
 *   write: bust L1 of this instance + DELETE the L2 keys (global)
 *
 * Ops: create a free Upstash Redis database and set
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 * in Vercel (the Vercel-KV names KV_REST_API_URL / KV_REST_API_TOKEN
 * work too). WITHOUT the env vars every function here is a fast no-op —
 * the app behaves exactly as before, so this is safe to merge first and
 * configure later.
 *
 * HARD RULE: cache failures must never break a read. Every path here
 * swallows errors (logged at warn) and returns null/undefined so the
 * caller falls through to the origin fetch.
 */

interface RedisEnv {
  url: string;
  token: string;
}

/** Read env at call time (not module init) so tests can stub per-case. */
function redisEnv(): RedisEnv | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

export function redisEnabled(): boolean {
  return redisEnv() !== null;
}

/** A hung cache lookup must never stall the dashboard — fail fast and
 *  fall through to origin. Upstash p99 is ~50ms from Vercel regions. */
const CMD_TIMEOUT_MS = 1_500;

/** Upstash REST caps request bodies around 1MB — skip oversized SETs
 *  instead of erroring (the L1 + origin path still works without L2). */
const MAX_VALUE_BYTES = 900_000;

async function command<T>(cmd: (string | number)[]): Promise<T | null> {
  const env = redisEnv();
  if (!env) return null;
  try {
    const res = await fetch(env.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cmd),
      cache: "no-store",
      signal:
        typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(CMD_TIMEOUT_MS)
          : undefined,
    });
    if (!res.ok) {
      console.warn("[redis] HTTP", res.status, "on", cmd[0]);
      return null;
    }
    const j = (await res.json()) as { result?: T; error?: string };
    if (j.error) {
      console.warn("[redis] error on", cmd[0], j.error);
      return null;
    }
    return (j.result ?? null) as T | null;
  } catch (e) {
    console.warn("[redis]", cmd[0], "failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** GET key → parsed JSON, or null (missing / disabled / any failure). */
export async function redisGetJson<T>(key: string): Promise<T | null> {
  const raw = await command<string | null>(["GET", key]);
  if (typeof raw !== "string" || raw === "") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn("[redis] unparseable value at", key);
    return null;
  }
}

/** SET key = JSON(value) with a TTL. Fire-and-forget friendly. */
export async function redisSetJson(
  key: string,
  value: unknown,
  ttlSec: number,
): Promise<void> {
  if (!redisEnabled()) return;
  const raw = JSON.stringify(value);
  if (raw.length > MAX_VALUE_BYTES) {
    console.warn("[redis] value too large, skipping SET", key, raw.length);
    return;
  }
  await command(["SET", key, raw, "EX", Math.max(1, Math.round(ttlSec))]);
}

/** DELETE keys — called on writes so every instance sees fresh data. */
export async function redisDel(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await command(["DEL", ...keys]);
}

/* ====================================================================
 * Dashboard slice envelope — shared by the three read routes.
 *
 * `at` is the origin-fetch timestamp; readers seed the in-memory SWR
 * slot with it (SwrSlot.set(v, at)) so the existing fresh/stale/missing
 * state machine — and the 1-hour emergency-stale fallback — apply to
 * L2-hydrated data exactly as if this instance had fetched it itself.
 * ==================================================================== */

export interface CachedSlice<T> {
  at: number;
  rows: T[];
}

export const REDIS_ROOMS_KEY = "apt:v1:rooms";
export const REDIS_TASKS_KEY = "apt:v1:tasks";

/** Keep L2 entries for the same window as the in-memory emergency
 *  fallback (lib/dashboardCache EMERGENCY_STALE_TTL_MS = 1h) — an entry
 *  older than STALE_TTL seeds L1 as "missing but held", which is
 *  precisely what powers serve-stale-on-origin-failure across instances. */
export const REDIS_SLICE_TTL_SEC = 60 * 60;

/** True when the envelope looks sane (guards against schema drift). */
export function isCachedSlice<T>(v: unknown): v is CachedSlice<T> {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as CachedSlice<T>).at === "number" &&
    Array.isArray((v as CachedSlice<T>).rows)
  );
}
