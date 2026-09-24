import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import type { RoomView, SheetRow } from "@/types";
import ReadyRoomsCard from "./ReadyRoomsCard";
import { nextAppointment, sortPendingByMoveIn } from "@/lib/moveIns";

afterEach(() => cleanup());

/** dd/MM/yyyy `days` from today — tasks in the sheet use this format. */
function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
const task = (type: string, date: string): SheetRow =>
  ({ date, type, building: "มั่งมี", room: "x", customer: "", phone: "", note: "", status: "" } as SheetRow);

function room(over: Partial<RoomView>): RoomView {
  return {
    building: "มั่งมี", room: "101", floor: "1", price: "4500",
    status: "ready", rawStatus: "ว่าง", tenant: "", phone: "", contractEnd: "",
    today: false, needsCleaning: false, todayTasks: [], upcomingTasks: [], pastTasks: [],
    ...over,
  };
}

describe("booked rooms (รอเข้าอยู่)", () => {
  it("nextAppointment picks the nearest move-in of that type only", () => {
    const r = room({ upcomingTasks: [task("ย้ายเข้า", inDays(9)), task("ชมห้อง", inDays(1)), task("ย้ายเข้า", inDays(4))] });
    const d = nextAppointment(r, "ย้ายเข้า")!;
    expect(Math.round((d.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000)).toBe(4);
    expect(nextAppointment(r, "ย้ายออก")).toBeNull();
  });

  it("sorts soonest move-in first and rooms with no move-in appointment last", () => {
    const later  = room({ room: "201", status: "pending", upcomingTasks: [task("ย้ายเข้า", inDays(10))] });
    const none   = room({ room: "102", status: "pending" });
    const sooner = room({ room: "305", status: "pending", upcomingTasks: [task("ย้ายเข้า", inDays(2))] });
    expect(sortPendingByMoveIn([later, none, sooner]).map((r) => r.room)).toEqual(["305", "201", "102"]);
  });

  it("shows who, the note the team wrote, and the move-in date — or flags a missing one", () => {
    const rooms = [
      room({ room: "104", status: "pending", tenant: "คุณเอ", note: "โอนมัดจำแล้ว",
        upcomingTasks: [task("ย้ายเข้า", inDays(3))] }),
      room({ room: "103", status: "pending", tenant: "คุณบี", note: "" }),
    ];
    const { getByText, getByRole } = render(
      <ReadyRoomsCard rooms={rooms} activeBuilding="ทั้งหมด" onSelectRoom={vi.fn()} roles={["management"]} />,
    );
    expect(getByText("รอเข้าอยู่")).toBeTruthy();
    const booked = within(getByRole("button", { name: /ห้อง 104/ }));
    expect(booked.getByText("คุณเอ")).toBeTruthy();
    expect(booked.getByText("โอนมัดจำแล้ว")).toBeTruthy();
    expect(booked.getByText(/^เข้า \d{2}\/\d{2}$/)).toBeTruthy();
    const unscheduled = within(getByRole("button", { name: /ห้อง 103/ }));
    expect(unscheduled.getByText("ยังไม่นัดวันเข้า")).toBeTruthy();
  });

  it("turns the missing move-in marker into a scheduling button when allowed", () => {
    const onSchedule = vi.fn();
    const onSelect = vi.fn();
    const r = room({ room: "103", status: "pending", tenant: "คุณบี" });
    const { getByRole, queryByText } = render(
      <ReadyRoomsCard rooms={[r]} activeBuilding="ทั้งหมด" onSelectRoom={onSelect} roles={["management"]} onScheduleMoveIn={onSchedule} />,
    );
    fireEvent.click(getByRole("button", { name: /ยังไม่นัดวันเข้า — นัดวันย้ายเข้า/ }));
    expect(onSchedule).toHaveBeenCalledWith(r);
    expect(onSelect).not.toHaveBeenCalled(); // not nested in the row button
    expect(queryByText("ยังไม่นัดวันเข้า")).toBeNull(); // the plain label is replaced, not duplicated
  });

  it("does not invent a name for roles that can't see tenants", () => {
    const rooms = [room({ room: "104", status: "pending", tenant: "" })];
    const { getByText } = render(
      <ReadyRoomsCard rooms={rooms} activeBuilding="ทั้งหมด" onSelectRoom={vi.fn()} roles={["sales"]} />,
    );
    expect(getByText("จองแล้ว")).toBeTruthy();
  });
});
