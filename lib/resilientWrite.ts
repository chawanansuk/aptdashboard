/**
 * Resilient POST for writes that are SAFE to re-send.
 *
 * The Sheets backend is slow and occasionally hiccups (cold starts >20s,
 * transient 502s, brief network drops). The Apps Script route deliberately
 * does NOT retry append writes server-side — a timeout can fire AFTER the
 * row was committed, so a blind retry would duplicate it
 * (lib/appsScriptFetch). That protection means a single blip surfaces to
 * staff as a red error, and they retype the whole task.
 *
 * This helper adds a bounded CLIENT retry on transient failures only —
 * but it is safe to use ONLY for writes the server can absorb a duplicate
 * of:
 *   - addTask: addTask_ dedups by (date|type|building|room) open-task key
 *     server-side, so a re-send after a lost response returns
 *     skipped:'duplicate-open' instead of a second row. ✓ safe
 *   - the idempotent SET writes (updateRoomStatus / updateTaskStatus / …)
 *     — re-applying the same status is a no-op. ✓ safe (though those
 *     already retry server-side, so client retry adds little there)
 *
 * DO NOT use for addRequisition / addLead / addVehicle / addEquipment /
 * addFacility — those have NO server dedup and a duplicate double-counts
 * stock / creates ghost records.
 *
 * Retries fire ONLY on transient signals — a thrown fetch (network/abort)
 * or HTTP ≥ 500. A 4xx (bad body) or a 200-with-ok:false (business
 * rejection) is returned immediately: those won't get better by retrying.
 *
 * Failure contract: THROWS only when no response ever arrived (every
 * attempt was a network error / abort). If the final attempt produced an
 * HTTP response — even a 5xx — that response is RETURNED, so the caller
 * can surface the server's own message and keep the user's form intact.
 */

export interface ResilientResult {
  res: Response;
  // Parsed JSON body (or a synthesized {ok:false} on unparseable body).
  data: { ok?: boolean; error?: string; skipped?: string; [k: string]: unknown };
}

export interface ResilientOpts {
  /** Extra attempts after the first (default 3 → up to 4 tries total). */
  retries?: number;
  /** Called before each RETRY (not the first try) with the upcoming
   *  attempt number and the total, so the UI can show "ลองใหม่ (2/4)". */
  onRetry?: (attempt: number, total: number) => void;
  signal?: AbortSignal;
}

// Gentle backoff — covers a cold start (~a few s) without making a real
// failure feel frozen. Index clamps to the last entry.
const BACKOFF_MS = [900, 2500, 5000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function resilientPost(
  url: string,
  body: unknown,
  opts: ResilientOpts = {},
): Promise<ResilientResult> {
  const extra = opts.retries ?? 3;
  const total = extra + 1;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= extra; attempt++) {
    if (attempt > 0) {
      opts.onRetry?.(attempt + 1, total);
      await sleep(BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)]);
    }
    if (opts.signal?.aborted) throw new DOMException("aborted", "AbortError");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
      // Transient server error → retry (unless this was the last attempt).
      if (res.status >= 500 && attempt < extra) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      const data = await res
        .json()
        .catch(() => ({ ok: false, error: "invalid JSON response" }));
      return { res, data };
    } catch (e) {
      // Network/abort. A user-initiated abort must NOT be retried.
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      lastErr = e;
      if (attempt >= extra) throw e;
    }
  }
  throw lastErr ?? new Error("write failed");
}
