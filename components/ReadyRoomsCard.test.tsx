import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import type { RoomView, SheetRow } from "@/types";
import ReadyRoomsCard from "./ReadyRoomsCard";
import { isBooked, nextAppointment, sortPendingByMoveIn, unscheduledMoveIns } from "@/lib/moveIns";

afterEach(() => cleanup());

/** dd/MM/yyyy `days` from today — tasks in the sheet use this format. */
function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
const task = (type: string, date: string, status = ""): SheetRow =>
  ({ date, type, building: "มั่งมี", room: "x", customer: "", phone: "", note: "", status } as SheetRow);

function room(over: Partial<RoomView>): RoomView {
  return {
    building: "มั่งมี", room: "101", floor: "1", price: "4500",
    status: "ready", rawStatus: "ว่าง", tenant: "", phone: "", contractEnd: "",
    today: false, needsCleaning: false, todayTasks: [], upcomingTasks: [], pastTasks: [],
    ...over,
  };
}
/** A room the sheet marks รอสัญญา. */
const booked = (over: Partial<RoomView>) => room({ status: "pending", rawStatus: "รอสัญญา", ...over });

describe("booked rooms (รอเข้าอยู่)", () => {
  it("nextAppointment picks the nearest move-in of that type only", () => {
    const r = room({ upcomingTasks: [task("ย้ายเข้า", inDays(9)), task("ชมห้อง", inDays(1)), task("ย้ายเข้า", inDays(4))] });
    const d = nextAppointment(r, "ย้ายเข้า")!;
    expect(Math.round((d.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000)).toBe(4);
    expect(nextAppointment(r, "ย้ายออก")).toBeNull();
  });

  it("sorts rooms with no move-in appointment FIRST, then soonest move-in", () => {
    const later  = booked({ room: "201", upcomingTasks: [task("ย้ายเข้า", inDays(10))] });
    const none   = booked({ room: "102" });
    const sooner = booked({ room: "305", upcomingTasks: [task("ย้ายเข้า", inDays(2))] });
    // The bell sends people to this list for the undated ones — they must
    // not fall below the row limit (audit r36).
    expect(sortPendingByMoveIn([later, none, sooner]).map((r) => r.room)).toEqual(["102", "305", "201"]);
  });

  it("an overdue move-in nobody closed is still the appointment — not 'no date'", () => {
    const r = booked({ room: "104", pastTasks: [task("ย้ายเข้า", inDays(-2))] });
    expect(nextAppointment(r, "ย้ายเข้า")).not.toBeNull();
    expect(unscheduledMoveIns([r])).toEqual([]);
    const closed = booked({ room: "105", pastTasks: [task("ย้ายเข้า", inDays(-2), "เสร็จ")] });
    expect(unscheduledMoveIns([closed]).map((x) => x.room)).toEqual(["105"]);
  });

  it("a vacant room with only a viewing is not a booking", () => {
    const viewing = room({ room: "101", status: "pending", rawStatus: "ว่าง", upcomingTasks: [task("ชมห้อง", inDays(1))] });
    expect(isBooked(viewing)).toBe(false);
    expect(unscheduledMoveIns([viewing])).toEqual([]);
    const { queryByText } = render(
      <ReadyRoomsCard rooms={[viewing]} activeBuilding="ทั้งหมด" onSelectRoom={vi.fn()} roles={["management"]} />,
    );
    expect(queryByText("รอเข้าอยู่")).toBeNull();
    // …but a vacant room that already has a ย้ายเข้า is taken.
    expect(isBooked(room({ status: "pending", rawStatus: "ว่าง", upcomingTasks: [task("ย้ายเข้า", inDays(3))] }))).toBe(true);
  });

  it("shows who, the note the team wrote, and the move-in date — or flags a missing one", () => {
    const rooms = [
      booked({ room: "104", tenant: "คุณเอ", note: "โอนมัดจำแล้ว",
        upcomingTasks: [task("ย้ายเข้า", inDays(3))] }),
      booked({ room: "103", tenant: "คุณบี", note: "" }),
    ];
    const { getByText, getByRole } = render(
      <ReadyRoomsCard rooms={rooms} activeBuilding="ทั้งหมด" onSelectRoom={vi.fn()} roles={["management"]} />,
    );
    expect(getByText("รอเข้าอยู่")).toBeTruthy();
    // The row's accessible name is its visible text (who, note, date) —
    // an aria-label used to hide all of that from screen readers.
    const row104 = getByRole("button", { name: /^104/ });
    expect(row104.textContent).toContain("คุณเอ");
    const scheduled = within(row104);
    expect(scheduled.getByText("โอนมัดจำแล้ว")).toBeTruthy();
    expect(scheduled.getByText(/^เข้า \d{2}\/\d{2}$/)).toBeTruthy();
    const unscheduled = within(getByRole("button", { name: /^103/ }));
    expect(unscheduled.getByText("ยังไม่นัดวันเข้า")).toBeTruthy();
  });

  it("turns the missing move-in marker into a scheduling button when allowed", () => {
    const onSchedule = vi.fn();
    const onSelect = vi.fn();
    const r = booked({ room: "103", tenant: "คุณบี" });
    const { getByRole, queryByText } = render(
      <ReadyRoomsCard rooms={[r]} activeBuilding="ทั้งหมด" onSelectRoom={onSelect} roles={["management"]} onScheduleMoveIn={onSchedule} />,
    );
    fireEvent.click(getByRole("button", { name: /ยังไม่นัดวันเข้า — นัดวันย้ายเข้า/ }));
    expect(onSchedule).toHaveBeenCalledWith(r);
    expect(onSelect).not.toHaveBeenCalled(); // not nested in the row button
    expect(queryByText("ยังไม่นัดวันเข้า")).toBeNull(); // the plain label is replaced, not duplicated
  });

  it("does not invent a name for roles that can't see tenants", () => {
    const rooms = [booked({ room: "104", tenant: "" })];
    const { getByText } = render(
      <ReadyRoomsCard rooms={rooms} activeBuilding="ทั้งหมด" onSelectRoom={vi.fn()} roles={["sales"]} />,
    );
    expect(getByText("จองแล้ว")).toBeTruthy();
  });

  it("View-as sales hides a name the manager's session still received", () => {
    const rooms = [booked({ room: "104", tenant: "คุณเอ" })];
    const { queryByText, getByText } = render(
      <ReadyRoomsCard rooms={rooms} activeBuilding="ทั้งหมด" onSelectRoom={vi.fn()} roles={["sales"]} />,
    );
    expect(queryByText("คุณเอ")).toBeNull();
    expect(getByText("จองแล้ว")).toBeTruthy();
  });
});

describe("see-all links", () => {
  const rooms = [
    room({ room: "101" }),
    booked({ room: "104" }),
    room({ room: "201", status: "moveout", rawStatus: "แจ้งย้ายออก" }),
  ];

  it("every section links to its own view", () => {
    const onSeeAll = vi.fn();
    const { getAllByRole } = render(
      <ReadyRoomsCard rooms={rooms} activeBuilding="ทั้งหมด" onSelectRoom={vi.fn()} roles={["management"]} onSeeAll={onSeeAll} />,
    );
    const links = getAllByRole("button", { name: /ดูทั้งหมด/ });
    expect(links).toHaveLength(3);
    links.forEach((b) => fireEvent.click(b));
    expect(onSeeAll.mock.calls.map((c) => c[0])).toEqual(["ready", "pending", "moveout"]);
  });

  it("no links to views the role can't open (engineer)", () => {
    const { queryByRole } = render(
      <ReadyRoomsCard rooms={rooms} activeBuilding="ทั้งหมด" onSelectRoom={vi.fn()} roles={["engineer"]} onSeeAll={vi.fn()} />,
    );
    expect(queryByRole("button", { name: /ดูทั้งหมด/ })).toBeNull();
  });
});
