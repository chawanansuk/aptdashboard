import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Client error sink — `/api/client-error`.
 *
 * Receives unhandled errors that escape ErrorBoundary or window-level
 * handlers in the browser, attaches the authenticated user's email +
 * UA + a server-side timestamp, and writes them to Vercel's runtime
 * logs as a structured log line.
 *
 * Why a homegrown endpoint instead of pulling Sentry in:
 *   - Zero new dependency in package.json
 *   - We already have Vercel log retention (good enough for now)
 *   - One place to filter sensitive fields (we strip nothing today —
 *     but if a future error message starts to carry PII this is the
 *     single chokepoint to scrub)
 *
 * The endpoint deliberately:
 *   - returns 204 No Content on any well-formed POST so the client
 *     "fire and forget" path can't see whether logging worked
 *   - drops payloads larger than ~16KB to keep one bad page from
 *     filling the log budget
 *   - never validates strictly — half-broken payloads still log
 *     (a partial trace is more useful than nothing during an outage)
 */

const MAX_BYTES = 16 * 1024;

interface ClientErrorBody {
  message?: string;
  stack?: string;
  componentStack?: string;
  /** Free-text origin: "ErrorBoundary:global", "window.onerror", etc. */
  source?: string;
  /** Page URL the error happened on. */
  url?: string;
  /** ISO timestamp recorded by the browser (server adds its own too). */
  clientTs?: string;
  /** Optional level — global/route/section from ErrorBoundary. */
  level?: string;
  /** Browser UA from the client (we also have req headers but this lets
   *  us correlate cross-route when the client navigates client-side). */
  ua?: string;
}

function truncate(s: string | undefined, max: number): string | undefined {
  if (!s) return s;
  return s.length > max ? `${s.slice(0, max)}…[truncated]` : s;
}

export async function POST(req: Request) {
  // Capacity guard — single oversized payload could fill the daily log
  // budget. Drop politely (still 204 so the client can't tell).
  const len = Number(req.headers.get("content-length") || "0");
  if (len > MAX_BYTES) return new NextResponse(null, { status: 204 });

  let body: ClientErrorBody = {};
  try {
    body = (await req.json()) as ClientErrorBody;
  } catch {
    // Malformed JSON — log a minimal marker so we still see the request
    // happened (an upstream bug might be sending garbage).
    console.error("[client-error] malformed body");
    return new NextResponse(null, { status: 204 });
  }

  // User identity is best-effort; an error might fire before auth
  // hydrates (initial bundle load). Anonymous is fine.
  let userEmail: string | undefined;
  try {
    const session = await auth();
    userEmail = session?.user?.email || undefined;
  } catch { /* ignore — auth() can throw if cookies missing */ }

  const ua = body.ua || req.headers.get("user-agent") || "unknown";

  // One structured log line so Vercel's log search can pivot by user /
  // source / message. Keep the line under ~4KB by truncating stacks.
  const entry = {
    type: "client-error",
    ts: new Date().toISOString(),
    user: userEmail || "anon",
    source: truncate(body.source, 80) || "unknown",
    level: truncate(body.level, 40),
    url: truncate(body.url, 400),
    message: truncate(body.message, 400) || "(no message)",
    stack: truncate(body.stack, 2000),
    componentStack: truncate(body.componentStack, 2000),
    clientTs: truncate(body.clientTs, 40),
    ua: truncate(ua, 200),
  };

  // Stringified so each error is one greppable line in Vercel logs.
  console.error(`[client-error] ${JSON.stringify(entry)}`);

  return new NextResponse(null, { status: 204 });
}
