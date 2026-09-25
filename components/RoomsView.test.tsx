import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { RoomView, SheetRow } from "@/types";

/** Phone / desktop switch — RoomsView reads it through useMediaQuery. */
let mobile = false;
vi.mock("@/lib/useMediaQuery", () => ({ useMediaQuery: () => mobile }));

import RoomsView from "./RoomsView";

afterEach(() => { cleanup(); mobile = false; });

function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
const moveIn = (date: string): SheetRow =>
  ({ date, type: "ย้ายเข้า", building: "x", room: "x", customer: "", phone: "", note: "", status: "" } as SheetRow);

function room(over: Partial<RoomView>): RoomView {
  return {
    building: "มั่งมี", room: "101", floor: "1", price: "4500",
    status: "pending", rawStatus: "รอสัญญา", tenant: "", phone: "", contractEnd: "",
    today: false, needsCleaning: false, todayTasks: [], upcomingTasks: [], pastTasks: [],
    ...over,
  };
}

// The screenshot that started this: 5 booked rooms in 4 buildings.
const BOOKED = [
  room({ building: "มั่งมี", room: "307", floor: "3" }),
  room({ building: "มั่งมี", room: "312", floor: "3", upcomingTasks: [moveIn(inDays(6))] }),
  room({ building: "มีทรัพย์", room: "1.2", floor: "1" }),
  room({ building: "มีทอง", room: "204", floor: "2" }),
  room({ building: "มายทรี", room: "110", floor: "1", upcomingTasks: [moveIn(inDays(8))] }),
];

function renderView(rooms: RoomView[], over: Partial<React.ComponentProps<typeof RoomsView>> = {}) {
  return render(
    <RoomsView
      visibleRooms={rooms}
      activeFilter="all"
      onChangeFilter={vi.fn()}
      bulkMode={false}
      bulkSelected={new Set()}
      onToggleBulkMode={vi.fn()}
      onToggleBulkRoom={vi.fn()}
      onSelectRoom={vi.fn()}
      roles={["management"]}
      onRepairRoom={vi.fn()}
      {...over}
    />,
  );
}

describe("RoomsView — phone list for single-status views", () => {
  it("on a phone, one status → rows grouped by building, no floor sections or tiles", () => {
    mobile = true;
    const { container, getAllByRole } = renderView(BOOKED);
    expect(container.querySelector(".ac-rc")).toBeNull();
    expect(container.querySelector(".ac-fs")).toBeNull();
    expect(container.querySelectorAll(".ac-ready-item")).toHaveLength(5);
    const groups = Array.from(container.querySelectorAll(".ac-room-list-group h3")).map((h) => h.textContent);
    expect(groups).toEqual(["มั่งมี (2 ห้อง)", "มีทรัพย์ (1 ห้อง)", "มีทอง (1 ห้อง)", "มายทรี (1 ห้อง)"]);
    // Within a building the room with no move-in date comes first.
    const nums = Array.from(container.querySelectorAll(".ac-ready-num")).map((n) => n.textContent);
    expect(nums.slice(0, 2)).toEqual(["307", "312"]);
    // Rows show the floor, not the building (the group header has it).
    expect(container.textContent).toContain("ชั้น 3");
    // The size toggle means nothing here.
    expect(container.querySelector(".ac-density-toggle")).toBeNull();
    // Unscheduled rooms say so (label — no scheduling callback given).
    expect(getAllByRole("button", { name: /^307/ })[0].textContent).toContain("ยังไม่นัดวันเข้า");
  });

  it("with a scheduling callback the label becomes a button; the row itself opens the room", () => {
    mobile = true;
    const onSchedule = vi.fn();
    const onSelect = vi.fn();
    const { getAllByRole, getByRole } = renderView(BOOKED, { onScheduleMoveIn: onSchedule, onSelectRoom: onSelect });
    expect(getAllByRole("button", { name: /ยังไม่นัดวันเข้า — นัดวันย้ายเข้า/ })).toHaveLength(3);
    fireEvent.click(getByRole("button", { name: /ห้อง 307 ยังไม่นัดวันเข้า/ }));
    expect(onSchedule).toHaveBeenCalledWith(BOOKED[0]);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(getAllByRole("button", { name: /^307/ })[0]);
    expect(onSelect).toHaveBeenCalledWith(BOOKED[0]);
  });

  it("mixed statuses on a phone keep the floor grid (it is a map)", () => {
    mobile = true;
    const { container } = renderView([BOOKED[0], room({ room: "101", status: "ready", rawStatus: "ว่าง" })]);
    expect(container.querySelectorAll(".ac-rc")).toHaveLength(2);
    expect(container.querySelector(".ac-ready-item")).toBeNull();
  });

  it("bulk select keeps the grid even for one status", () => {
    mobile = true;
    const { container } = renderView(BOOKED, { bulkMode: true });
    expect(container.querySelectorAll(".ac-rc")).toHaveLength(5);
  });

  it("desktop keeps the grid; booked tiles with no move-in date say so", () => {
    const { container } = renderView(BOOKED);
    expect(container.querySelectorAll(".ac-rc")).toHaveLength(5);
    expect(container.querySelectorAll(".ac-rc-movein.is-missing")).toHaveLength(3);
    expect(container.querySelectorAll(".ac-rc-movein:not(.is-missing)")).toHaveLength(2);
  });
});
