/**
 * Generic in-memory SWR cache slot for read-heavy list endpoints (server).
 *
 * Several /api list routes (facilities, parts, leads, vehicles) used to
 * block on Apps Script for every GET — so each page mount, sidebar badge
 * refresh, or lazy-view open round-tripped to Sheets even when the data
 * hadn't changed. This module factors out the proven SWR machinery from
 * `lib/maintenanceCache.ts` (fresh → stale → missing + emergency-stale
 * fallback) so those routes can share one battle-tested implementation
 * instead of four near-identical copies.
 *
 * Lives in module scope → persists across requests on a warm Vercel
 * function instance; a cold start gets an empty slot (fine — it just
 * fetches once). Each route owns its own slot, so a parts write never
 * touches the facilities cache.
 *
 * Correctness contract:
 *   - Writes (POST) call `slot.invalidate()` so the next GET refetches.
 *   - `serveCachedRows` returns `{ rows }` exactly like the un-cached
 *     handler did, plus harmless `cached`/`cacheState` fields the client
 *     ignores. So wiring a route to this helper is behavior-preserving
 *     for every existing consumer (they read `j.rows`).
 */

import { runAfterResponse } from "@/lib/afterResponse";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { AppsScriptError } from "@/lib/appsScriptFetch";
import { redisGetEpoch, type EpochName } from "@/lib/redisCache";

export type CacheState = "fresh" | "stale" | "missing";

export interface CacheLookup<T> {
  state: CacheState;
  data: T | null;
  ageMs: number;
}

export interface SwrTtls {
  freshMs: number;
  staleMs: number;
  emergencyMs: number;
}

/** Defaults mirror maintenanceCache: 90s fresh / 10min stale / 1hr emergency. */
export const DEFAULT_SWR_TTLS: SwrTtls = {
  freshMs: 90_000,
  staleMs: 10 * 60_000,
  emergencyMs: 60 * 60_000,
};

export class SwrSlot<T> {
  private value: T | null = null;
  private savedAt = 0;
  private revalidating = false;
  private gen = 0; // r34 — see setIfCurrent
  private readonly ttls: SwrTtls;

  constructor(ttls: SwrTtls = DEFAULT_SWR_TTLS) {
    this.ttls = ttls;
  }

  generation(): number { return this.gen; }

  /** r34: set only if no invalidate() happened since `gen` was captured —
   *  a background fetch that started before a write must not overwrite
   *  the post-write invalidation with pre-write rows. */
  setIfCurrent(v: T, gen: number, now: number = Date.now()): boolean {
    if (gen !== this.gen) return false;
    this.set(v, now);
    return true;
  }

  /** r34: drop the entry when it was fetched before the last write
   *  (cross-instance epoch from Redis). */
  dropIfOlderThan(epochMs: number): boolean {
    if (this.value === null || this.savedAt >= epochMs) return false;
    this.invalidate();
    return true;
  }

  get(now: number = Date.now()): CacheLookup<T> {
    if (this.value === null) return { state: "missing", data: null, ageMs: 0 };
    const ageMs = now - this.savedAt;
    if (ageMs <= this.ttls.freshMs) return { state: "fresh", data: this.value, ageMs };
    if (ageMs <= this.ttls.staleMs) return { state: "stale", data: this.value, ageMs };
    // Past staleMs → report "missing" so the route blocks on a fresh
    // fetch, but DON'T drop the value: peekEmergency() still needs it as
    // the upstream-down fallback up to emergencyMs. It's overwritten by
    // the next successful set().
    return { state: "missing", data: null, ageMs };
  }

  peekEmergency(now: number = Date.now()): T | null {
    if (this.value === null) return null;
    if (now - this.savedAt <= this.ttls.emergencyMs) return this.value;
    return null;
  }

  set(v: T, now: number = Date.now()): void {
    this.value = v;
    this.savedAt = now;
  }

  invalidate(): void {
    this.value = null;
    this.savedAt = 0;
    this.gen++;
  }

  tryBeginRevalidation(): boolean {
    if (this.revalidating) return false;
    this.revalidating = true;
    return true;
  }

  endRevalidation(): void {
    this.revalidating = false;
  }
}

/** md5-prefix ETag over the rows JSON — same shape as the dashboard
 *  endpoints. Collisions are harmless: a miss just sends the body anyway. */
function makeRowsEtag(rows: unknown, tag: string): string {
  const hash = createHash("md5").update(JSON.stringify(rows)).digest("hex");
  return `W/"${tag}-${hash.slice(0, 16)}"`;
}

function jsonWithEtag<T>(
  body: T,
  rows: unknown,
  etagTag: string,
  ifNoneMatch: string | null,
  cacheHeaders: Record<string, string>,
): NextResponse {
  const etag = makeRowsEtag(rows, etagTag);
  const headers = { ...cacheHeaders, ETag: etag };
  if (ifNoneMatch === etag) {
    // 304: body skipped, ETag echoed so the browser keeps using its copy.
    return new NextResponse(null, { status: 304, headers });
  }
  return NextResponse.json(body, { headers });
}

/**
 * Serve a `{ rows }` JSON response backed by an SwrSlot.
 *
 *   - fresh  → return cached immediately
 *   - stale  → return cached + kick a background revalidation
 *   - miss   → block on `fetchFresh`, cache, return; on upstream failure
 *              fall back to emergency-stale if any, else surface the error
 *
 * Pass `req` to opt into 304 short-circuits: the helper hashes the rows
 * to a weak ETag and returns 304 when `If-None-Match` matches — the same
 * pattern the dashboard slice endpoints use. `etagTag` is a short label
 * baked into the ETag (e.g. "facilities") so two routes can't collide on
 * a private CDN. `errorPrefix` is the Thai user-facing message stem for
 * the hard-fail case (no cache + upstream down).
 */
export async function serveCachedRows<T>(
  slot: SwrSlot<T[]>,
  fetchFresh: () => Promise<T[]>,
  errorPrefix: string,
  opts: {
    req?: Request;
    etagTag?: string;
    epoch?: EpochName;
    /** r35: per-role projection applied to every response body (and the
     *  ETag) — the slot keeps FULL rows, the caller strips what this
     *  requester may not see (e.g. part cost for sales). */
    project?: (rows: T[]) => T[];
  } = {},
): Promise<NextResponse> {
  const cacheHeaders = {
    "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
  };
  const { req, etagTag = "rows", epoch, project = (r: T[]) => r } = opts;
  const ifNoneMatch = req?.headers.get("if-none-match") ?? null;

  // r34: a write on ANOTHER instance stamps the family's epoch in Redis;
  // drop our L1 when it predates that write (no-op without Redis).
  if (epoch) {
    const lastWrite = await redisGetEpoch(epoch);
    if (lastWrite !== null) slot.dropIfOlderThan(lastWrite);
  }

  const c = slot.get();

  if (c.state === "fresh" && c.data) {
    const out = project(c.data);
    return jsonWithEtag(
      { rows: out, cached: true, cacheState: "fresh", ageMs: c.ageMs },
      out, etagTag, ifNoneMatch, cacheHeaders,
    );
  }

  if (c.state === "stale" && c.data) {
    // Background revalidate — don't await, don't block the response.
    // r37: runAfterResponse กัน Vercel แช่แข็ง instance ก่อนงานจบ
    if (slot.tryBeginRevalidation()) {
      runAfterResponse((async () => {
        // r34: capture generation + start time so rows fetched before a
        // concurrent write can't repopulate the slot after it.
        const gen = slot.generation();
        const startedAt = Date.now();
        try {
          const rows = await fetchFresh();
          slot.setIfCurrent(rows, gen, startedAt);
        } catch {
          // keep previous value; next miss will retry
        } finally {
          slot.endRevalidation();
        }
      })());
    }
    const out = project(c.data);
    return jsonWithEtag(
      { rows: out, cached: true, cacheState: "stale", ageMs: c.ageMs },
      out, etagTag, ifNoneMatch, cacheHeaders,
    );
  }

  // Missing — block on upstream, with emergency-stale fallback.
  const gen = slot.generation();
  const startedAt = Date.now();
  try {
    const rows = await fetchFresh();
    slot.setIfCurrent(rows, gen, startedAt);
    const out = project(rows);
    return jsonWithEtag(
      { rows: out, cached: false, cacheState: "missing" },
      out, etagTag, ifNoneMatch, cacheHeaders,
    );
  } catch (e) {
    const error = e instanceof Error ? e.message : "unknown";
    const emergency = slot.peekEmergency();
    if (emergency) {
      const out = project(emergency);
      return jsonWithEtag(
        { rows: out, cached: true, cacheState: "emergency-stale", error },
        // r34: fold the degraded state into the ETag so a 304 can't hide it
        { state: "emergency-stale", rows: out }, etagTag, ifNoneMatch, cacheHeaders,
      );
    }
    // audit r33: keep AppsScriptError's status (504 = "Google ตอบช้า", which the
    // client can phrase honestly) instead of flattening everything to 502.
    return NextResponse.json(
      { ok: false, error: `${errorPrefix}: ${error}` },
      { status: e instanceof AppsScriptError ? e.status : 502 },
    );
  }
}
