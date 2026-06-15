import { createHash } from "node:crypto";

/**
 * Server-Timing header value: `name;desc="..."; dur=<ms>`. Quotes in
 * `desc` are downgraded to single quotes so the header stays well-formed.
 */
export function timing(name: string, ms: number, desc?: string): string {
  const d = desc ? `;desc="${desc.replace(/"/g, "'")}"` : "";
  return `${name}${d};dur=${ms.toFixed(0)}`;
}

/**
 * Hash a value into a short weak ETag, namespaced by `prefix`. Computed
 * over the PROJECTED rows the caller will send so a non-admin's 304
 * cannot be satisfied by an admin's cached body. Md5 is cheap; collisions
 * just send the body anyway.
 */
export function makeEtag(prefix: string, value: unknown): string {
  const hash = createHash("md5").update(JSON.stringify(value)).digest("hex");
  return `W/"${prefix}-${hash.slice(0, 16)}"`;
}
