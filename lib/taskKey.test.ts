import { describe, expect, it } from "vitest";
import { taskKey } from "./taskKey";

describe("taskKey", () => {
  it("joins date|building|room|type", () => {
    expect(
      taskKey({ date: "22/05/2026", building: "Kl", room: "101", type: "ซ่อม" })
    ).toBe("22/05/2026|Kl|101|ซ่อม");
  });

  it("handles empty fields without throwing", () => {
    expect(taskKey({ date: "", building: "", room: "", type: "" })).toBe("|||");
  });

  it("identical inputs produce identical keys (stable)", () => {
    const a = { date: "22/05/2026", building: "Kl", room: "101", type: "ซ่อม" };
    const b = { date: "22/05/2026", building: "Kl", room: "101", type: "ซ่อม" };
    expect(taskKey(a)).toBe(taskKey(b));
  });

  it("different type → different key (used for kanban dedup)", () => {
    const base = { date: "22/05/2026", building: "Kl", room: "101" };
    expect(taskKey({ ...base, type: "ซ่อม" })).not.toBe(taskKey({ ...base, type: "ทำสะอาด" }));
  });

  it("supports common-area room values (Task 38 prefix)", () => {
    expect(
      taskKey({ date: "22/05/2026", building: "Kl", room: "ส่วนกลาง:ลิฟต์", type: "ซ่อม" })
    ).toBe("22/05/2026|Kl|ส่วนกลาง:ลิฟต์|ซ่อม");
  });

  it("preserves Thai characters in building/type", () => {
    expect(
      taskKey({ date: "22/05/2026", building: "มั่งมี", room: "1.1", type: "ทำสะอาด" })
    ).toBe("22/05/2026|มั่งมี|1.1|ทำสะอาด");
  });
});
