import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { RoomView } from "@/types";
import type { MeterRow } from "@/lib/billing";
import { currentMonthKey } from "@/lib/billing";
import { bangkokTodayYmd } from "@/lib/dateUtils";

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), dismiss: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: toastMock, default: toastMock }));

import BillingView from "./BillingView";

const MONTH = currentMonthKey();

function room(over: Partial<RoomView>): RoomView {
  return {
    building: "มั่งมี", room: "101", floor: "1", price: "4,500",
    status: "occupied", rawStatus: "มีคนอยู่", tenant: "คุณเอ", phone: "", contractEnd: "",
    today: false, needsCleaning: false, todayTasks: [], upcomingTasks: [], pastTasks: [],
    ...over,
  };
}
const ROOMS = [
  room({ room: "101" }),
  room({ room: "102", tenant: "คุณบี" }),
  room({ room: "103", status: "ready", tenant: "" }), // empty room — nothing to bill
];
const row = (o: Partial<MeterRow>): MeterRow => ({
  month: MONTH, building: "มั่งมี", room: "101",
  elecPrev: null, elecCur: null, elecUnits: null, elecCost: null,
  waterPrev: null, waterCur: null, waterUnits: null, waterCost: null,
  rent: null, keyFee: null, parking: null, other: null, total: null, paidDate: "", note: "", ...o,
});
const RATE = { building: "มั่งมี", elecRate: 8, waterRate: 18, waterMin: 100, dueDay: 5 };

function mockApi(finance: boolean, rows: MeterRow[] = []) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (!init || init.method !== "POST") {
      const month = new URL(url, "http://t").searchParams.get("month");
      return { ok: true, status: 200, json: async () => ({
        ok: true, finance, month,
        rows: finance ? rows : rows.map((r) => ({ ...r, total: null, rent: null, elecCost: null, waterCost: null, paidDate: "" })),
        prevRows: [{ building: "มั่งมี", room: "101", elecCur: 1234, waterCur: 50 }],
        rates: finance ? [RATE] : [],
      }) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, saved: 1, results: [] }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const posts = (f: ReturnType<typeof mockApi>) =>
  f.mock.calls.filter((c) => c[1]?.method === "POST").map((c) => JSON.parse(String(c[1]!.body)));

beforeEach(() => { Object.values(toastMock).forEach((m) => m.mockReset()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("<BillingView> จดมิเตอร์", () => {
  it("an engineer sees occupied rooms only, units as they type, no baht — and saves only what changed", async () => {
    const f = mockApi(false);
    render(<BillingView rooms={ROOMS} roles={["engineer"]} activeBuilding="ทั้งหมด" />);
    await screen.findByText("ห้อง 101");
    expect(screen.getByText("ห้อง 102")).toBeTruthy();
    expect(screen.queryByText("ห้อง 103")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull(); // no บิล / อัตรา tabs for non-managers

    // last month's 1234 is this month's starting point
    expect(screen.getByRole("button", { name: /ห้อง 101 มิเตอร์ไฟเดิม 1,234/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("ห้อง 101 มิเตอร์ไฟใหม่"), { target: { value: "1290" } });
    expect(screen.getByText("56 หน่วย")).toBeTruthy();
    expect(document.body.textContent).not.toContain("฿");

    fireEvent.click(screen.getByRole("button", { name: "บันทึก 1 ห้อง" }));
    await waitFor(() => expect(posts(f)).toHaveLength(1));
    expect(posts(f)[0]).toEqual({
      action: "saveReadings", month: MONTH,
      items: [{ building: "มั่งมี", room: "101", roomPrice: 4500, elecCur: 1290 }],
    });
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("บันทึกมิเตอร์ 1 ห้องแล้ว"));
  });

  it("a typo is caught before anything is sent", async () => {
    const f = mockApi(false);
    render(<BillingView rooms={ROOMS} roles={["engineer"]} activeBuilding="ทั้งหมด" />);
    fireEvent.change(await screen.findByLabelText("ห้อง 102 มิเตอร์น้ำใหม่"), { target: { value: "12a" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึก 1 ห้อง" }));
    expect(toastMock.error).toHaveBeenCalled();
    expect(posts(f)).toHaveLength(0);
  });

  it("the previous reading can be corrected (meter replaced)", async () => {
    const f = mockApi(false);
    render(<BillingView rooms={ROOMS} roles={["engineer"]} activeBuilding="ทั้งหมด" />);
    fireEvent.click(await screen.findByRole("button", { name: /ห้อง 101 มิเตอร์ไฟเดิม/ }));
    fireEvent.change(screen.getByLabelText("ห้อง 101 มิเตอร์ไฟเดิม"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("ห้อง 101 มิเตอร์ไฟใหม่"), { target: { value: "15" } });
    expect(screen.getByText("15 หน่วย")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "บันทึก 1 ห้อง" }));
    await waitFor(() => expect(posts(f)[0].items[0]).toMatchObject({ elecPrev: 0, elecCur: 15 }));
  });

  it("a manager sees the bill preview while typing", async () => {
    mockApi(true);
    render(<BillingView rooms={ROOMS} roles={["management"]} activeBuilding="ทั้งหมด" />);
    fireEvent.change(await screen.findByLabelText("ห้อง 101 มิเตอร์ไฟใหม่"), { target: { value: "1290" } });
    fireEvent.change(screen.getByLabelText("ห้อง 101 มิเตอร์น้ำใหม่"), { target: { value: "56" } });
    expect(screen.getByText("≈ 5,056 ฿")).toBeTruthy(); // 4500 + 56×8 + max(100, 6×18)
  });
});

describe("<BillingView> บิล & การจ่าย", () => {
  const ROWS = [
    row({ room: "101", elecPrev: 1234, elecCur: 1290, elecUnits: 56, elecCost: 448, waterPrev: 50, waterCur: 56, waterUnits: 6, waterCost: 108, rent: 4500, total: 5056 }),
    row({ room: "102", elecPrev: 100, elecCur: 150, waterPrev: 1, waterCur: 3, rent: 4000, total: 4600, paidDate: "2026-10-03" }),
  ];

  it("totals, a copyable LINE bill, and marking a room paid", async () => {
    const f = mockApi(true, ROWS);
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<BillingView rooms={ROOMS} roles={["management"]} activeBuilding="ทั้งหมด" />);
    fireEvent.click(await screen.findByRole("tab", { name: /บิล & การจ่าย/ }));

    const billed = screen.getByText("เรียกเก็บ").parentElement!;
    expect(billed.textContent).toContain("9,656 ฿");
    const owed = screen.getByText("ยังค้าง").parentElement!;
    expect(owed.textContent).toContain("5,056 ฿");

    const r101 = screen.getByText("มั่งมี · ห้อง 101").closest("li")!;
    fireEvent.click(within(r101).getByRole("button", { name: /คัดลอกบิล/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const text = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(text).toContain("ห้อง 101");
    expect(text).toContain("รวม 5,056 บาท");

    fireEvent.click(within(r101).getByRole("button", { name: /รับเงินแล้ว/ }));
    await waitFor(() => expect(posts(f).at(-1)).toEqual({
      action: "setPaid", month: MONTH, building: "มั่งมี", room: "101", paidDate: bangkokTodayYmd(),
    }));
    await waitFor(() => expect(within(r101).getByRole("button", { name: /ยกเลิกรับเงิน/ })).toBeTruthy());
    expect(screen.getByText("ยังค้าง").parentElement!.textContent).toContain("0 ฿");
  });

  it("a room that can be billed now but has no total in the sheet offers to save it", async () => {
    const f = mockApi(true, [row({ room: "101", elecPrev: 1234, elecCur: 1290, waterPrev: 50, waterCur: 56, rent: 4500 })]);
    render(<BillingView rooms={ROOMS} roles={["management"]} activeBuilding="ทั้งหมด" />);
    fireEvent.click(await screen.findByRole("tab", { name: /บิล & การจ่าย/ }));
    fireEvent.click(screen.getByRole("button", { name: "บันทึกยอดลงชีต" }));
    await waitFor(() => expect(posts(f)[0]).toEqual({
      action: "saveReadings", month: MONTH, items: [{ building: "มั่งมี", room: "101", roomPrice: 4500 }],
    }));
  });
});
