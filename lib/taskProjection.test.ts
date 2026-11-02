import { describe, expect, it } from "vitest";
import type { SheetRow } from "@/types";
import { projectTasksForRoles } from "./taskProjection";

const T: SheetRow = {
  date: "2026-11-01", type: "ซ่อม", building: "มั่งมี", room: "101", customer: "คุณเอ", phone: "0812345678",
  note: "เปลี่ยนก๊อก", status: "เสร็จ", cost: 350,
};

describe("projectTasksForRoles (audit r38)", () => {
  it("managers get everything", () => {
    expect(projectTasksForRoles([T], ["management"])[0]).toEqual(T);
  });
  it("sales keep the customer but not the repair cost", () => {
    const [t] = projectTasksForRoles([T], ["sales"]);
    expect(t).toMatchObject({ customer: "คุณเอ", phone: "0812345678" });
    expect(t).not.toHaveProperty("cost");
  });
  it("engineers get neither customer nor cost", () => {
    const [t] = projectTasksForRoles([T], ["engineer"]);
    expect(t).toMatchObject({ customer: "", phone: "", note: "เปลี่ยนก๊อก" });
    expect(t).not.toHaveProperty("cost");
  });
});
