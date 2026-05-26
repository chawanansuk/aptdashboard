/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Fake BroadcastChannel: jsdom doesn't implement it, and even when it
// does the spec says a channel never receives its OWN postMessage. To
// test the dispatch path we capture the module's "message" listener and
// drive it directly (simulating a message from another tab).
class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  name: string;
  listeners: Array<(ev: { data: unknown }) => void> = [];
  posted: unknown[] = [];
  constructor(name: string) {
    this.name = name;
    FakeBroadcastChannel.instances.push(this);
  }
  addEventListener(type: string, fn: (ev: { data: unknown }) => void) {
    if (type === "message") this.listeners.push(fn);
  }
  postMessage(data: unknown) { this.posted.push(data); }
  close() {}
  emit(data: unknown) { this.listeners.forEach((fn) => fn({ data })); }
}

beforeEach(() => {
  vi.resetModules();
  FakeBroadcastChannel.instances = [];
  vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
});

describe("realtimeBus", () => {
  it("delivers a valid published event to subscribers (cross-tab)", async () => {
    const { subscribeBus } = await import("./realtimeBus");
    const fn = vi.fn();
    subscribeBus(fn);
    FakeBroadcastChannel.instances[0].emit({ kind: "data-changed", source: "task", ts: 1 });
    expect(fn).toHaveBeenCalledWith({ kind: "data-changed", source: "task", ts: 1 });
  });

  it("ignores malformed messages", async () => {
    const { subscribeBus } = await import("./realtimeBus");
    const fn = vi.fn();
    subscribeBus(fn);
    const ch = FakeBroadcastChannel.instances[0];
    ch.emit(null);
    ch.emit({ foo: "bar" });
    ch.emit("a string");
    expect(fn).not.toHaveBeenCalled();
  });

  it("unsubscribe stops further delivery", async () => {
    const { subscribeBus } = await import("./realtimeBus");
    const fn = vi.fn();
    const off = subscribeBus(fn);
    const ch = FakeBroadcastChannel.instances[0];
    ch.emit({ kind: "session-changed", ts: 1 });
    off();
    ch.emit({ kind: "session-changed", ts: 2 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("isolates one subscriber's error from others", async () => {
    const { subscribeBus } = await import("./realtimeBus");
    const bad = vi.fn(() => { throw new Error("boom"); });
    const good = vi.fn();
    subscribeBus(bad);
    subscribeBus(good);
    FakeBroadcastChannel.instances[0].emit({ kind: "session-changed", ts: 1 });
    expect(good).toHaveBeenCalledTimes(1);
  });

  it("publishBusEvent posts the event to the channel", async () => {
    const { publishBusEvent, subscribeBus } = await import("./realtimeBus");
    subscribeBus(() => {}); // ensures the channel is created
    publishBusEvent({ kind: "data-changed", source: "room", ts: 5 });
    expect(FakeBroadcastChannel.instances[0].posted).toContainEqual({
      kind: "data-changed", source: "room", ts: 5,
    });
  });

  it("degrades gracefully when BroadcastChannel is unavailable", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    vi.resetModules();
    const { publishBusEvent, subscribeBus } = await import("./realtimeBus");
    const off = subscribeBus(vi.fn());
    expect(() => publishBusEvent({ kind: "session-changed", ts: 1 })).not.toThrow();
    expect(() => off()).not.toThrow();
  });
});
