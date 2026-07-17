import { describe, it, expect } from "vitest";
import {
  mergeRoomsAndTasks,
  applyOptimisticRoomPatches,
  applyOptimisticTasks,
  applyOptimisticTaskStatus,
  dedupTasks,
  describeFetchError,
  taskKey,
  type OptimisticRoomPatch,
  type OptimisticTask,
} from "./useDashboardData";
import type { RoomRow, SheetRow } from "@/types";

function room(over: Partial<RoomRow> = {}): RoomRow {
  return {
    building: "A", room: "101", floor: "1", price: "5000",
    status: "ว่าง", tenant: "", phone: "", contractEnd: "", ...over,
  };
}

function task(over: Partial<SheetRow> = {}): SheetRow {
  return {
    date: "", type: "ทำสะอาด", building: "A", room: "101",
    customer: "", phone: "", note: "", status: "รอ", ...over,
  };
}

function todayParts() {
  const d = new Date();
  return {
    iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    dmy: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`,
  };
}

describe("mergeRoomsAndTasks — identity preservation (perf r7)", () => {
  it("returns the PREVIOUS RoomView object for rooms nothing touched", () => {
    const rooms = [room(), room({ room: "102" })];
    const { dmy } = todayParts();
    const tasks = [task({ date: dmy })];
    const first = mergeRoomsAndTasks(rooms, tasks);
    // Same inputs re-merged with prev → same object identities out, so
    // React.memo'd cards skip all unchanged rooms.
    const second = mergeRoomsAndTasks(rooms, tasks, first);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
  });

  it("returns a NEW object for the room whose data changed, old for the rest", () => {
    const rooms = [room(), room({ room: "102" })];
    const first = mergeRoomsAndTasks(rooms, [], undefined);
    const patched = [{ ...rooms[0], status: "แจ้งย้ายออก" }, rooms[1]];
    const second = mergeRoomsAndTasks(patched, [], first);
    expect(second[0]).not.toBe(first[0]);
    expect(second[0].status).toBe("moveout");
    expect(second[1]).toBe(first[1]);
  });
});

describe("mergeRoomsAndTasks — today bucket", () => {
  it("flags a task dated today in ISO format (yyyy-MM-dd) as today", () => {
    const { iso } = todayParts();
    const [view] = mergeRoomsAndTasks([room()], [task({ date: iso })]);
    expect(view.today).toBe(true);
    expect(view.todayTasks).toHaveLength(1);
  });

  it("flags a task dated today in DMY format (dd/MM/yyyy) as today", () => {
    const { dmy } = todayParts();
    const [view] = mergeRoomsAndTasks([room()], [task({ date: dmy })]);
    expect(view.today).toBe(true);
  });

  it("ignores done/cancelled tasks dated today", () => {
    const { iso } = todayParts();
    const [view] = mergeRoomsAndTasks(
      [room()],
      [task({ date: iso, status: "เสร็จ" }), task({ date: iso, status: "ยกเลิก" })],
    );
    expect(view.today).toBe(false);
    expect(view.todayTasks).toHaveLength(0);
  });
});

describe("mergeRoomsAndTasks — needsCleaning flag (#6)", () => {
  const future = () => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  };

  it("booked (ว่าง + ย้ายเข้า) room that also needs cleaning → pending + needsCleaning", () => {
    const f = future();
    const [view] = mergeRoomsAndTasks(
      [room({ status: "ว่าง" })],
      [task({ type: "ย้ายเข้า", date: f }), task({ type: "ทำสะอาด", date: f })],
    );
    expect(view.status).toBe("pending"); // headline stays booked (no double-book)
    expect(view.needsCleaning).toBe(true); // but the clean is flagged
  });

  it("does NOT flag when the headline is already qc (ว่าง + ทำสะอาด only)", () => {
    const f = future();
    const [view] = mergeRoomsAndTasks([room({ status: "ว่าง" })], [task({ type: "ทำสะอาด", date: f })]);
    expect(view.status).toBe("qc");
    expect(view.needsCleaning).toBe(false); // redundant — headline shows it
  });

  it("flags a sheet-pending (รอสัญญา) room with an outstanding clean", () => {
    const f = future();
    const [view] = mergeRoomsAndTasks([room({ status: "รอสัญญา" })], [task({ type: "ทำสะอาด", date: f })]);
    expect(view.status).toBe("pending");
    expect(view.needsCleaning).toBe(true);
  });

  it("no clean task → needsCleaning false", () => {
    const f = future();
    const [view] = mergeRoomsAndTasks([room({ status: "ว่าง" })], [task({ type: "ย้ายเข้า", date: f })]);
    expect(view.needsCleaning).toBe(false);
  });
});

describe("mergeRoomsAndTasks — ชมห้อง viewing → room status", () => {
  const future = () => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  };

  it("an OPEN ชมห้อง pushes a ว่าง room to pending (no double-book)", () => {
    const [view] = mergeRoomsAndTasks(
      [room({ status: "ว่าง" })],
      [task({ type: "ชมห้อง", date: future(), status: "" })],
    );
    expect(view.status).toBe("pending");
  });

  it("a ไม่สนใจ (not-interested) ชมห้อง frees the room back to ready", () => {
    const [view] = mergeRoomsAndTasks(
      [room({ status: "ว่าง" })],
      [task({ type: "ชมห้อง", date: future(), status: "ไม่สนใจ" })],
    );
    expect(view.status).toBe("ready"); // closed viewing no longer holds the room
  });

  it("a cancelled ชมห้อง also frees the room", () => {
    const [view] = mergeRoomsAndTasks(
      [room({ status: "ว่าง" })],
      [task({ type: "ชมห้อง", date: future(), status: "ยกเลิก" })],
    );
    expect(view.status).toBe("ready");
  });
});

describe("applyOptimisticTasks", () => {
  const TTL = 5 * 60_000;
  const mk = (over: Partial<SheetRow> = {}): SheetRow => ({
    date: "27/05/2026", type: "ชมห้อง", building: "A", room: "101",
    customer: "", phone: "", note: "", status: "", ...over,
  });
  const pend = (entries: [string, OptimisticTask][]) => new Map<string, OptimisticTask>(entries);

  it("returns server tasks unchanged when nothing pending", () => {
    const server = [mk()];
    expect(applyOptimisticTasks(server, new Map(), Date.now(), TTL)).toBe(server);
  });

  it("prepends a pending task the server hasn't returned yet", () => {
    const now = Date.now();
    const added = mk({ room: "205" });
    const map = pend([[taskKey(added), { task: added, at: now }]]);
    const out = applyOptimisticTasks([mk({ room: "101" })], map, now, TTL);
    expect(out).toHaveLength(2);
    expect(out[0].room).toBe("205"); // prepended
    expect(map.size).toBe(1); // still pending — server hasn't confirmed
  });

  it("drops a pending task once the server list contains its key (confirmed)", () => {
    const now = Date.now();
    const added = mk({ room: "205" });
    const map = pend([[taskKey(added), { task: added, at: now }]]);
    // Server now returns the same task → reconcile away.
    const out = applyOptimisticTasks([mk({ room: "205" })], map, now, TTL);
    expect(out).toHaveLength(1);
    expect(map.has(taskKey(added))).toBe(false);
  });

  it("drops a pending task past the TTL even if unconfirmed", () => {
    const now = Date.now();
    const added = mk({ room: "205" });
    const map = pend([[taskKey(added), { task: added, at: now - TTL - 1 }]]);
    const out = applyOptimisticTasks([], map, now, TTL);
    expect(out).toHaveLength(0);
    expect(map.size).toBe(0);
  });

  it("taskKey matches the AddTaskModal identity (date|building|room|type)", () => {
    expect(taskKey(mk())).toBe("27/05/2026|A|101|ชมห้อง");
  });
});

describe("applyOptimisticTaskStatus", () => {
  const TTL = 5 * 60_000;
  const mk = (over: Partial<SheetRow> = {}): SheetRow => ({
    date: "20/05/2026", type: "ซ่อม", building: "A", room: "101",
    customer: "", phone: "", note: "", status: "", ...over,
  });
  const pend = (entries: [string, { status: string; at: number }][]) =>
    new Map<string, { status: string; at: number }>(entries);

  it("returns server tasks unchanged when nothing pending", () => {
    const server = [mk()];
    expect(applyOptimisticTaskStatus(server, new Map(), Date.now(), TTL)).toBe(server);
  });

  it("overrides an open task's status with the pending one (closed task stays closed)", () => {
    const now = Date.now();
    const t = mk({ status: "" }); // server still shows it open (cache lag)
    const map = pend([[taskKey(t), { status: "เสร็จ", at: now }]]);
    const out = applyOptimisticTaskStatus([t], map, now, TTL);
    expect(out[0].status).toBe("เสร็จ");
    expect(map.size).toBe(1); // not yet confirmed by server
  });

  it("drops the pending entry once the server row already shows the new status", () => {
    const now = Date.now();
    const t = mk({ status: "เสร็จ" }); // server caught up
    const key = taskKey(t);
    const map = pend([[key, { status: "เสร็จ", at: now }]]);
    const out = applyOptimisticTaskStatus([t], map, now, TTL);
    expect(out[0].status).toBe("เสร็จ");
    expect(map.has(key)).toBe(false); // reconciled away
  });

  it("drops a pending entry past the TTL even if unconfirmed", () => {
    const now = Date.now();
    const t = mk({ status: "" });
    const map = pend([[taskKey(t), { status: "เสร็จ", at: now - TTL - 1 }]]);
    const out = applyOptimisticTaskStatus([t], map, now, TTL);
    expect(out[0].status).toBe(""); // expired → no override
    expect(map.size).toBe(0);
  });

  it("leaves unrelated tasks untouched", () => {
    const now = Date.now();
    const closing = mk({ room: "101" });
    const other = mk({ room: "202", status: "" });
    const map = pend([[taskKey(closing), { status: "ยกเลิก", at: now }]]);
    const out = applyOptimisticTaskStatus([closing, other], map, now, TTL);
    expect(out.find((t) => t.room === "101")!.status).toBe("ยกเลิก");
    expect(out.find((t) => t.room === "202")!.status).toBe("");
  });

  it("keeps suppressing duplicate rows until EVERY row with the key flips", () => {
    // Two server rows share a key (stray duplicate). The backend closed one
    // but the twin still reads open — without holding the pending entry the
    // open twin would pop the task back open ("เด้งกลับ").
    const now = Date.now();
    const closed = mk({ status: "เสร็จ" });
    const openTwin = mk({ status: "" });
    const key = taskKey(closed); // identical key
    const map = pend([[key, { status: "เสร็จ", at: now }]]);
    const out = applyOptimisticTaskStatus([closed, openTwin], map, now, TTL);
    expect(out.every((t) => t.status === "เสร็จ")).toBe(true); // both suppressed
    expect(map.has(key)).toBe(true); // NOT dropped — a twin is still open
  });

  it("drops the pending entry only once all duplicate rows have flipped", () => {
    const now = Date.now();
    const a = mk({ status: "เสร็จ" });
    const b = mk({ status: "เสร็จ" });
    const key = taskKey(a);
    const map = pend([[key, { status: "เสร็จ", at: now }]]);
    applyOptimisticTaskStatus([a, b], map, now, TTL);
    expect(map.has(key)).toBe(false); // fully reconciled
  });
});

describe("describeFetchError", () => {
  it("maps network failures to a connectivity message", () => {
    for (const raw of ["Failed to fetch", "NetworkError when attempting", "Load failed"]) {
      expect(describeFetchError(raw)).toContain("เชื่อมต่อเครือข่ายไม่ได้");
    }
  });

  it("maps 5xx / timeout to a server-unavailable message", () => {
    expect(describeFetchError("HTTP 502 Bad Gateway")).toContain("เซิร์ฟเวอร์ไม่ตอบ");
    expect(describeFetchError("request timed out")).toContain("เซิร์ฟเวอร์ไม่ตอบ");
  });

  it("maps quota/rate-limit errors", () => {
    expect(describeFetchError("Service quota exceeded")).toContain("โควต้า");
    expect(describeFetchError("rate limit hit")).toContain("โควต้า");
  });

  it("maps malformed-payload errors", () => {
    expect(describeFetchError("invalid JSON")).toContain("ผิดรูปแบบ");
  });

  it("maps auth errors", () => {
    expect(describeFetchError("HTTP 403 Forbidden")).toContain("ไม่มีสิทธิ์");
  });

  it("passes unknown errors through unchanged", () => {
    expect(describeFetchError("something weird #42")).toBe("something weird #42");
  });

  it("is case-insensitive and tolerates empty input", () => {
    expect(describeFetchError("FAILED TO FETCH")).toContain("เชื่อมต่อเครือข่ายไม่ได้");
    expect(describeFetchError("")).toBe("");
  });
});

describe("applyOptimisticRoomPatches", () => {
  const TTL = 5 * 60_000;
  const patches = (entries: [string, OptimisticRoomPatch][]) =>
    new Map<string, OptimisticRoomPatch>(entries);

  it("returns rooms unchanged when nothing is pending", () => {
    const rooms = [room()];
    const out = applyOptimisticRoomPatches(rooms, new Map(), Date.now(), TTL);
    expect(out).toBe(rooms);
  });

  it("re-applies a pending patch over stale (pre-write) server data", () => {
    const now = Date.now();
    // Server still shows the OLD status (CSV hasn't published the write).
    const server = [room({ status: "ว่าง" })];
    const map = patches([["A|101", { patch: { status: "รอสัญญา", tenant: "พู" }, at: now }]]);
    const [out] = applyOptimisticRoomPatches(server, map, now, TTL);
    expect(out.status).toBe("รอสัญญา");
    expect(out.tenant).toBe("พู");
    // Still pending — server hasn't confirmed yet.
    expect(map.has("A|101")).toBe(true);
  });

  it("drops a patch once the server row reflects every patched field", () => {
    const now = Date.now();
    // Server now matches the optimistic write → write landed.
    const server = [room({ status: "รอสัญญา", tenant: "พู" })];
    const map = patches([["A|101", { patch: { status: "รอสัญญา", tenant: "พู" }, at: now }]]);
    const [out] = applyOptimisticRoomPatches(server, map, now, TTL);
    expect(out.status).toBe("รอสัญญา");
    expect(map.has("A|101")).toBe(false);
  });

  it("drops a patch past the TTL even if unconfirmed (safety net)", () => {
    const now = Date.now();
    const server = [room({ status: "ว่าง" })];
    const map = patches([["A|101", { patch: { status: "รอสัญญา" }, at: now - TTL - 1 }]]);
    const [out] = applyOptimisticRoomPatches(server, map, now, TTL);
    expect(out.status).toBe("ว่าง"); // patch expired → server wins
    expect(map.has("A|101")).toBe(false);
  });

  it("leaves other rooms untouched", () => {
    const now = Date.now();
    const server = [room({ room: "101", status: "ว่าง" }), room({ room: "102", status: "occupied" })];
    const map = patches([["A|101", { patch: { status: "รอสัญญา" }, at: now }]]);
    const out = applyOptimisticRoomPatches(server, map, now, TTL);
    expect(out[0].status).toBe("รอสัญญา");
    expect(out[1].status).toBe("occupied");
  });
});

describe("dedupTasks", () => {
  it("returns the input untouched when nothing is duplicated", () => {
    const a = task({ date: "06/06/2026", room: "407", type: "ย้ายเข้า", customer: "สาธินี" });
    const b = task({ date: "06/06/2026", room: "403", type: "ย้ายเข้า", customer: "ออม" });
    expect(dedupTasks([a, b])).toEqual([a, b]);
  });

  it("drops exact duplicates and preserves order", () => {
    // The screenshot bug: same (date,building,room,type,customer,phone) twice.
    const t = task({
      date: "06/06/2026", building: "มีทอง", room: "407", type: "ย้ายเข้า",
      customer: "สาธินี เทพไชย", phone: "092-3804052",
    });
    const other = task({ date: "10/06/2026", room: "605", type: "ย้ายเข้า" });
    const out = dedupTasks([t, t, other]);
    expect(out.length).toBe(2);
    expect(out[0]).toBe(t);
    expect(out[1]).toBe(other);
  });

  it("prefers the row with richer customer/phone/note when keys collide", () => {
    // Stub row got created first; a later edit filled in customer + phone.
    // We should keep the rich one so the edit isn't erased by the stub.
    const stub = task({
      date: "06/06/2026", building: "มีทอง", room: "407", type: "ย้ายเข้า",
      customer: "", phone: "", note: "",
    });
    const rich = task({
      date: "06/06/2026", building: "มีทอง", room: "407", type: "ย้ายเข้า",
      customer: "สาธินี", phone: "092-3804052", note: "เข้าบ่าย",
    });
    expect(dedupTasks([stub, rich])).toEqual([rich]);
    expect(dedupTasks([rich, stub])).toEqual([rich]);
  });

  it("trims building/room when comparing — matches taskKey semantics", () => {
    const a = task({ date: "06/06/2026", building: "มีทอง", room: "407", type: "ย้ายเข้า" });
    const b = task({ date: "06/06/2026", building: " มีทอง", room: "407 ", type: "ย้ายเข้า" });
    expect(dedupTasks([a, b]).length).toBe(1);
  });
});
