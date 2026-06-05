import { describe, expect, it } from "vitest";
import { etagJsonResponse } from "./etagJsonResponse";

function reqWith(headers: Record<string, string> = {}): Request {
  return new Request("https://x/api", { headers });
}

describe("etagJsonResponse", () => {
  it("emits a weak ETag and 200 + body when no If-None-Match is sent", async () => {
    const r = etagJsonResponse({ rows: [1, 2] }, reqWith(), { tag: "t" });
    expect(r.status).toBe(200);
    expect(r.headers.get("ETag")).toMatch(/^W\/"t-[a-f0-9]+"$/);
    expect(await r.json()).toEqual({ rows: [1, 2] });
    expect(r.headers.get("Cache-Control")).toContain("max-age=30");
  });

  it("returns 304 + empty body + echoed ETag when If-None-Match matches", async () => {
    const first = etagJsonResponse({ rows: [1, 2] }, reqWith(), { tag: "t" });
    const etag = first.headers.get("ETag")!;
    const r = etagJsonResponse({ rows: [1, 2] }, reqWith({ "if-none-match": etag }), { tag: "t" });
    expect(r.status).toBe(304);
    expect(r.headers.get("ETag")).toBe(etag);
    expect(await r.text()).toBe("");
  });

  it("does not 304 when the body differs (etag changes)", async () => {
    const a = etagJsonResponse({ rows: [1] }, reqWith(), { tag: "t" });
    const etagA = a.headers.get("ETag")!;
    const b = etagJsonResponse({ rows: [1, 2] }, reqWith({ "if-none-match": etagA }), { tag: "t" });
    expect(b.status).toBe(200);
    expect(b.headers.get("ETag")).not.toBe(etagA);
  });

  it("scopes etag by tag — same body under a different tag is a different etag", async () => {
    const a = etagJsonResponse({ rows: [1] }, reqWith(), { tag: "audit" });
    const b = etagJsonResponse({ rows: [1] }, reqWith(), { tag: "requisitions" });
    expect(a.headers.get("ETag")).not.toBe(b.headers.get("ETag"));
  });

  it("honors a custom cacheControl header", async () => {
    const r = etagJsonResponse({ rows: [1] }, reqWith(), {
      tag: "t", cacheControl: "private, max-age=300",
    });
    expect(r.headers.get("Cache-Control")).toBe("private, max-age=300");
  });
});
