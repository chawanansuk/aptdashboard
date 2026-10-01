import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { RoomView, SheetRow } from "@/types";
import type { Role } from "@/auth";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { email: "chang@apt.test", name: "สมชาย", roles: ["engineer"] } } }),
}));
// The parts picker talks to /api/parts — not what these tests are about.
vi.mock("@/components/RoomRepairParts", () => ({
  RepairPartsPicker: () => null,
  RoomPartsUsed: () => null,
}));
const postMock = vi.fn();
vi.mock("@/lib/resilientWrite", () => ({ resilientPost: (...a: unknown[]) => postMock(...a) }));
vi.mock("@/lib/partsRequisition", () => ({ fileRequisitionLines: vi.fn() }));

import { RepairLogForm, findRecentDuplicate, RECENT_DUP_MINUTES } from "./RepairLogModal";

function room(over: Partial<RoomView>): RoomView {
  return {
    building: "มั่งมี", room: "101", floor: "1", price: "4500",
    status: "occupied", rawStatus: "มีคนอยู่", tenant: "", phone: "", contractEnd: "",
    today: false, needsCleaning: false, todayTasks: [], upcomingTasks: [], pastTasks: [],
    ...over,
  };
}
const ROOMS = [
  room({ room: "101", floor: "1" }), room({ room: "102", floor: "1" }),
  room({ room: "201", floor: "2" }), room({ building: "KL", room: "301", floor: "3" }),
];
/** createdAt in the device's wall clock, like the sheet writes it. */
function createdAgo(minutes: number): string {
  const d = new Date(Date.now() - minutes * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const task = (over: Partial<SheetRow>): SheetRow => ({
  date: "2026-10-01", type: "ซ่อม", building: "มั่งมี", room: "101", customer: "", phone: "",
  note: "เปลี่ยนหลอดไฟ", status: "เสร็จ", ...over,
});

beforeEach(() => { postMock.mockReset().mockResolvedValue({ res: { status: 200 }, data: { ok: true } }); });
afterEach(cleanup);

describe("findRecentDuplicate", () => {
  it("same room, same text, within 10 minutes → a duplicate; otherwise not", () => {
    const q = { building: "มั่งมี", room: "101", type: "ซ่อม", note: "เปลี่ยนหลอดไฟ" };
    const hit = findRecentDuplicate([task({ createdAt: createdAgo(3) })], q);
    expect(hit?.minutesAgo).toBeGreaterThanOrEqual(3); // createdAt has no seconds → 3 or 4
    expect(hit?.minutesAgo).toBeLessThanOrEqual(4);
    expect(findRecentDuplicate([task({ createdAt: createdAgo(RECENT_DUP_MINUTES + 5) })], q)).toBeNull();
    expect(findRecentDuplicate([task({ createdAt: createdAgo(3), room: "102" })], q)).toBeNull();
    expect(findRecentDuplicate([task({ createdAt: createdAgo(3), note: "เปลี่ยนหลอดไฟ 2 หลอด" })], q)).toBeNull();
    expect(findRecentDuplicate([task({})], q)).toBeNull(); // no createdAt → can't tell → not a dup
    // surrounding / doubled whitespace is the same text
    expect(findRecentDuplicate([task({ createdAt: createdAgo(1), note: "  เปลี่ยนหลอดไฟ  " })], q)).not.toBeNull();
  });
});

describe("<RepairLogForm>", () => {
  const base = { rooms: ROOMS, tasks: [] as SheetRow[], roles: ["engineer"] as Role[], refresh: vi.fn(), optimisticAddTask: vi.fn() };

  it("rooms are tapped, not typed; the category is guessed from the text; the engineer is 'who'", async () => {
    const { getByRole, getByText, queryByText } = render(<RepairLogForm {...base} />);
    // building chips → room chips of that building only
    fireEvent.click(getByRole("button", { name: "KL" }));
    expect(getByRole("button", { name: "301" })).toBeTruthy();
    expect(queryByText("101")).toBeNull();
    fireEvent.click(getByRole("button", { name: "มั่งมี" }));
    fireEvent.click(getByRole("button", { name: "102" }));
    expect(getByRole("button", { name: "102" }).getAttribute("aria-pressed")).toBe("true");
    // category follows the note
    fireEvent.change(getByRole("textbox", { name: /ทำอะไรไป/ }), { target: { value: "ก๊อกอ่างล้างหน้ารั่ว" } });
    await waitFor(() => expect(getByRole("button", { name: "ประปา" }).getAttribute("aria-pressed")).toBe("true"));
    expect(getByText(/เดาจากข้อความ/)).toBeTruthy();
    // who: the signed-in engineer, pre-selected
    expect(getByRole("button", { name: /สมชาย/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("saves a finished job with category and who, as one addTask with status เสร็จ", async () => {
    const onSaved = vi.fn();
    const { getByRole } = render(<RepairLogForm {...base} onSaved={onSaved} />);
    fireEvent.click(getByRole("button", { name: "102" }));
    fireEvent.change(getByRole("textbox", { name: /ทำอะไรไป/ }), { target: { value: "เปลี่ยนหลอดไฟห้องน้ำ" } });
    fireEvent.click(getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(postMock).toHaveBeenCalledTimes(1);
    const body = postMock.mock.calls[0][1] as Record<string, unknown>;
    expect(body).toMatchObject({
      action: "addTask", type: "ซ่อม", building: "มั่งมี", room: "102", status: "เสร็จ",
      note: "เปลี่ยนหลอดไฟห้องน้ำ", category: "ไฟฟ้า", doneBy: "สมชาย",
    });
    expect(postMock.mock.calls[0][2]).toMatchObject({ retries: 0 }); // never auto-retry a done row
    expect(base.optimisticAddTask).toHaveBeenCalledWith(expect.objectContaining({ category: "ไฟฟ้า", doneBy: "สมชาย", status: "เสร็จ" }));
  });

  it("the same text on the same room minutes ago asks before writing a second row", async () => {
    const tasks = [task({ room: "102", note: "เปลี่ยนหลอดไฟ", createdAt: createdAgo(2) })];
    const { getByRole, getByText } = render(<RepairLogForm {...base} tasks={tasks} />);
    fireEvent.click(getByRole("button", { name: "102" }));
    fireEvent.change(getByRole("textbox", { name: /ทำอะไรไป/ }), { target: { value: "เปลี่ยนหลอดไฟ" } });
    fireEvent.click(getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(getByText(/เพิ่งบันทึกข้อความเดียวกัน/)).toBeTruthy());
    expect(postMock).not.toHaveBeenCalled();
    fireEvent.click(getByRole("button", { name: /บันทึกอีกรายการ/ }));
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
  });

  it("an open job skipped as a duplicate writes nothing: no parts withdrawn, the form stays", async () => {
    const { fileRequisitionLines } = await import("@/lib/partsRequisition");
    const partsCallsBefore = vi.mocked(fileRequisitionLines).mock.calls.length; // module mock, shared across tests
    postMock.mockResolvedValue({ res: { status: 200 }, data: { ok: true, skipped: "duplicate-open" } });
    const onSaved = vi.fn();
    const { getByRole, getByText } = render(<RepairLogForm {...base} onSaved={onSaved} />);
    fireEvent.click(getByRole("button", { name: "102" }));
    fireEvent.change(getByRole("textbox", { name: /ทำอะไรไป/ }), { target: { value: "ก๊อกรั่ว" } });
    // "ยังไม่เสร็จ" → an OPEN task, the server's own dedup applies
    fireEvent.click(getByText("ลงย้อนหลัง / ยังไม่เสร็จ"));
    fireEvent.click(getByRole("checkbox"));
    fireEvent.click(getByRole("button", { name: "เพิ่มงานค้าง" }));
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(base.refresh).toHaveBeenCalled());
    expect(vi.mocked(fileRequisitionLines).mock.calls.length).toBe(partsCallsBefore);
    expect(onSaved).not.toHaveBeenCalled();
    expect((getByRole("textbox", { name: /ทำอะไรไป/ }) as HTMLTextAreaElement).value).toBe("ก๊อกรั่ว"); // still here
  });

  it("a room window knows its room: no pickers, the category chips are still there", () => {
    const { queryByRole, getByRole } = render(
      <RepairLogForm {...base} fixedRoom={{ building: "มั่งมี", room: "101" }} embedded />,
    );
    expect(queryByRole("button", { name: "102" })).toBeNull();
    expect(queryByRole("radiogroup", { name: "ตึก" })).toBeNull();
    expect(getByRole("button", { name: "แอร์" })).toBeTruthy();
  });
});
