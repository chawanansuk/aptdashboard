/**
 * Shared client for calling the Apps Script Web App from Vercel API
 * routes. Adds resilience that single-shot `fetch` lacks:
 *
 * - Retry with exponential backoff (300/600/1200ms) on network errors,
 *   5xx, 408 timeout, 429 rate-limit
 * - AbortSignal timeout (15s default) so we never hang a Vercel function
 *   on an Apps Script cold-start that never completes
 * - JSON-aware: returns parsed body or throws a structured error so each
 *   route doesn't need to repeat the same boilerplate
 *
 * Read vs write: pass `idempotent: true` for reads (so retries are safe).
 * Writes default to `idempotent: false` — they still retry, but only on
 * network errors *before* the request body has been ack'd (best effort;
 * the upstream Apps Script `withWriteLock_` v3.9.0 dedupes on its side).
 */

export interface AppsScriptResult<T = unknown> {
  ok: boolean;
  error?: string;
  result?: T;
}

export class AppsScriptError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "AppsScriptError";
    this.status = status;
  }
}

const RETRY_DELAYS_MS = [300, 600, 1200];
const DEFAULT_TIMEOUT_MS = 15_000;

interface CallOptions {
  /** Reads can safely retry on any error; writes only on network-level. */
  idempotent?: boolean;
  timeoutMs?: number;
  /** Cap on RETRIES (attempts = maxRetries + 1). Callers running inside a
   *  platform execution limit must budget: attempts × timeoutMs + delays
   *  has to fit under their maxDuration, or the platform kills the
   *  function mid-retry and the client sees a bare 504 instead of our
   *  JSON envelope. Default: the full ladder (3 retries). */
  maxRetries?: number;
}

/**
 * In-flight request dedup. When N requests for the same (action, body)
 * arrive concurrently — typical when multiple clients hit a function
 * instance after cache expiry — only the first hits Apps Script. The
 * rest await the same promise.
 *
 * Only opted into by callers passing idempotent:true. Originally that
 * meant reads only; since the write-timeout fix, the route also marks
 * the six SET-style write actions idempotent (updateTask, updateTaskStatus,
 * updateRoomStatus, updateRoomData, bookRoom, releaseRoom) — collapsing two
 * identical concurrent set-writes is benign because they converge to the
 * same row state. APPEND actions (addTask, addLead, …) must NEVER be
 * marked idempotent: dedup or retry would silently drop/duplicate a commit.
 * Keys auto-purge on settle. Lives at module scope, so it's per-Vercel-
 * function-instance, which is exactly the right scope.
 */
const inflight = new Map<string, Promise<AppsScriptResult<unknown>>>();

function dedupKey(action: string, body: Record<string, unknown>): string {
  return action + ":" + JSON.stringify(body);
}

// `idempotent` parameter is accepted but currently unused — the
// retry-vs-not decision is purely status-driven. Kept in the signature
// so callers can keep passing it (changing the surface would touch
// every appsScriptCall site for no behavior benefit), and so a future
// refactor can wire write-retries to it without changing callers.
function shouldRetry(status: number, _idempotent: boolean): boolean {
  // Network/abort errors (caught separately) always retry once for idempotent
  if (status >= 500) return true;
  if (status === 408 || status === 429) return true;
  // 4xx other than above — never retry
  if (status >= 400) return false;
  return false;
}

function getUrl(): string {
  const url = process.env.SHEET_WRITE_URL;
  if (!url) throw new AppsScriptError("ยังไม่ได้ตั้งค่า SHEET_WRITE_URL", 500);
  return url;
}

/**
 * Call an Apps Script action with retry + timeout.
 * Returns the parsed { ok, result, error } envelope as-is.
 * Throws AppsScriptError if all retries fail or the response isn't JSON.
 */
export async function appsScriptCall<T = unknown>(
  action: string,
  body: Record<string, unknown> = {},
  opts: CallOptions = {}
): Promise<AppsScriptResult<T>> {
  const idempotent = opts.idempotent ?? false;

  // Dedup concurrent identical reads (e.g. 10 users hit cache miss at once).
  if (idempotent) {
    const key = dedupKey(action, body);
    const existing = inflight.get(key) as Promise<AppsScriptResult<T>> | undefined;
    if (existing) return existing;
    const p = runCall<T>(action, body, opts).finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, p as Promise<AppsScriptResult<unknown>>);
    return p;
  }
  return runCall<T>(action, body, opts);
}

async function runCall<T>(
  action: string,
  body: Record<string, unknown>,
  opts: CallOptions
): Promise<AppsScriptResult<T>> {
  const url = getUrl();
  const idempotent = opts.idempotent ?? false;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // Explicit `action` parameter must always win — earlier spread of
  // body keys can include a stale `action` field (e.g. from /api/room-equipment
  // forwarding the client's `action: "add"` while we want to upstream
  // `action: "addEquipment"`). Putting `action` LAST guarantees it overrides.
  //
  // `secret` authenticates us to the Apps Script web app (its doPost
  // checks Script Property SHARED_SECRET when set — the URL alone used
  // to be full write access). Server-only env var; never NEXT_PUBLIC.
  // Placed after the body spread so a malicious client payload can't
  // override it, and omitted entirely when unset (pre-rollout compat).
  const secret = process.env.APPS_SCRIPT_SECRET;
  const payload = JSON.stringify({ ...body, ...(secret ? { secret } : {}), action });

  let lastErr: Error | null = null;

  const maxAttempts = 1 + Math.min(opts.maxRetries ?? RETRY_DELAYS_MS.length, RETRY_DELAYS_MS.length);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        cache: "no-store",
        redirect: "follow",
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const text = await res.text();
        let json: AppsScriptResult<T> | null = null;
        try {
          json = JSON.parse(text) as AppsScriptResult<T>;
        } catch {
          throw new AppsScriptError(
            "ตอบกลับไม่ใช่ JSON (ตรวจ Apps Script access setting)",
            502
          );
        }
        return json;
      }

      // Non-2xx
      lastErr = new AppsScriptError(`upstream HTTP ${res.status}`, 502);
      // Non-idempotent writes never retry (see catch below); reads retry
      // only on the retryable statuses.
      if (!idempotent || !shouldRetry(res.status, idempotent)) {
        throw lastErr;
      }
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof AppsScriptError && e.status < 500 && e.status !== 408 && e.status !== 429) {
        throw e;
      }
      lastErr = e instanceof Error ? e : new Error(String(e));
      // Never retry a non-idempotent write. A timeout/abort can fire AFTER
      // Apps Script already committed the append (cold starts routinely
      // exceed the abort window), so a retry duplicates the row. Only
      // addTask_ dedups server-side (findTaskRow_); parts / leads /
      // vehicles / facilities / equipment / requisitions do not — and a
      // duplicate requisition double-decrements stock. Fail fast and let
      // the user retry deliberately if the write truly didn't land.
      if (!idempotent) {
        break;
      }
    }

    const delay = RETRY_DELAYS_MS[attempt];
    if (delay == null) break;
    await new Promise((r) => setTimeout(r, delay));
  }

  throw lastErr || new AppsScriptError("upstream call failed", 502);
}
