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

/**
 * Live health check for /api/version?ping=1 — the only way to SEE
 * whether the shared cache actually works (a bad token is silently
 * swallowed everywhere else by design). Round-trips a PING.
 */
export async function redisPing(): Promise<{
  configured: boolean;
  ok: boolean;
  latencyMs: number | null;
}> {
  if (!redisEnv()) return { configured: false, ok: false, latencyMs: null };
  const t0 = Date.now();
  const res = await command<string>(["PING"]);
  return {
    configured: true,
    ok: res === "PONG",
    latencyMs: res === "PONG" ? Date.now() - t0 : null,
  };
}

/** A hung cache lookup must never stall the dashboard — fail fast and
 *  fall through to origin. Upstash p99 is ~50ms from Vercel regions. */
const CMD_TIMEOUT_MS = 1_500;
/** r36: SETs of the tasks/rooms slices carry 100-400KB and are fire-and-
 *  forget (never on a response's critical path) — production logs showed
 *  them aborting at 1.5s ("SET failed: aborted due to timeout"), so L2 was
 *  silently never populated. Give uploads a longer, separate budget. */
const SET_TIMEOUT_MS = 8_000;

/** Upstash REST caps request bodies around 1MB — skip oversized SETs
 *  instead of erroring (the L1 + origin path still works without L2). */
const MAX_VALUE_BYTES = 900_000;

async function command<T>(cmd: (string | number)[], timeoutMs: number = CMD_TIMEOUT_MS): Promise<T | null> {
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
          ? AbortSignal.timeout(timeoutMs)
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
  const t0 = Date.now();
  const r = await command(["SET", key, raw, "EX", Math.max(1, Math.round(ttlSec))], SET_TIMEOUT_MS);
  if (r === null) console.warn("[redis] SET not stored", key, { bytes: raw.length, ms: Date.now() - t0 });
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

/* ====================================================================
 * Write epochs (r34 — audit: "บันทึกจากเครื่องหนึ่ง เครื่องอื่นยังตอบของเก่า")
 *
 * `redisDel` on a write only clears L2; a SIBLING instance whose L1 is
 * still "fresh" (≤90s) never looks at L2 and keeps serving pre-write
 * rows. The epoch is the timestamp of the last write per data family:
 * every read compares its L1 entry's fetch time against it and drops the
 * entry when it predates the write (one tiny GET, ~50ms; a no-op when
 * Redis isn't configured — single-instance behaviour is unchanged).
 * ==================================================================== */

export type EpochName =
  | "rooms" | "tasks" | "parts" | "leads" | "vehicles" | "facilities" | "recurring";

const EPOCH_PREFIX = "apt:v1:epoch:";

/** Stamp "a write just happened" for these families. Fire-and-forget. */
export async function redisBumpEpoch(...names: EpochName[]): Promise<void> {
  if (!redisEnabled() || names.length === 0) return;
  const now = Date.now();
  const args: (string | number)[] = ["MSET"];
  for (const n of names) args.push(EPOCH_PREFIX + n, now);
  await command(args);
}

/** Timestamp (ms) of the last write for this family, or null. */
export async function redisGetEpoch(name: EpochName): Promise<number | null> {
  const raw = await command<string | null>(["GET", EPOCH_PREFIX + name]);
  const n = typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** True when the envelope looks sane (guards against schema drift). */
export function isCachedSlice<T>(v: unknown): v is CachedSlice<T> {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as CachedSlice<T>).at === "number" &&
    Array.isArray((v as CachedSlice<T>).rows)
  );
}
