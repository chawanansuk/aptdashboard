/**
 * Helper: send a JSON response with a weak ETag + browser cache hint,
 * and short-circuit to 304 on a matching `If-None-Match`.
 *
 * For per-query API routes whose body changes by URL (e.g. ?partId=X)
 * — adding a shared SwrSlot would mean keying by query, which we don't
 * have today. This helper gives us the 304 win without that machinery:
 * the body is still computed every request, but the browser skips the
 * download when bytes are identical.
 *
 * Same md5-prefix shape as serverSwr / dashboard/tasks so curl/devtools
 * see a familiar ETag.
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

const DEFAULT_CACHE = "private, max-age=30, stale-while-revalidate=120";

export function etagJsonResponse(
  body: unknown,
  req: Request,
  opts: { tag: string; cacheControl?: string } = { tag: "rows" },
): NextResponse {
  const ifNoneMatch = req.headers.get("if-none-match");
  // Stable stringify isn't needed — same JS object always stringifies the
  // same in the same Node version; cross-request determinism comes from
  // the upstream rows themselves.
  const json = JSON.stringify(body);
  const hash = createHash("md5").update(json).digest("hex");
  const etag = `W/"${opts.tag}-${hash.slice(0, 16)}"`;
  const headers: Record<string, string> = {
    "Cache-Control": opts.cacheControl ?? DEFAULT_CACHE,
    ETag: etag,
  };
  if (ifNoneMatch === etag) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(json, {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
