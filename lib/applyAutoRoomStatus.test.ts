import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RoomView } from "@/types";

// Mock the side-effecting deps so these tests exercise applyAutoRoomStatus's
// own orchestration (branching + the fetch body it builds), not the deps.
vi.mock("@/lib/toast", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/permissions", () => ({ canPerform: vi.fn() }));
vi.mock("@/lib/autoRoomStatus", () => ({ suggestRoomStatusAfterTaskDone: vi.fn() }));

import { applyAutoRoomStatus } from "./applyAutoRoomStatus";
import { toast } from "@/lib/toast";
import { canPerform } from "@/lib/permissions";
import { suggestRoomStatusAfterTaskDone } from "@/lib/autoRoomStatus";

const mInfo = toast.info as ReturnType<typeof vi.fn>;
const mSuccess = toast.success as ReturnType<typeof vi.fn>;
const mCanPerform = canPerform as unknown as ReturnType<typeof vi.fn>;
const mSuggest = suggestRoomStatusAfterTaskDone as unknown as ReturnType<typeof vi.fn>;

function room(over: Partial<RoomView> = {}): RoomView {
  return {
    building: "A", room: "101", floor: "1", price: "5000",
    status: "occupied", rawStatus: "มีผู้เช่า", tenant: "", phone: "",
    contractEnd: "", today: false, needsCleaning: false,
    todayTasks: [], upcomingTasks: [], pastTasks: [], ...over,
  };
}

const baseTask = { type: "ทำสะอาด", building: "A", room: "101" };

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

describe("applyAutoRoomStatus", () => {
  it("skips common-area (ส่วนกลาง:) tasks before doing anything", async () => {
    await applyAutoRoomStatus({
      task: { type: "ทำสะอาด", building: "A", room: "ส่วนกลาง:ลิฟต์" },
      newTaskStatus: "เสร็จ", rooms: [room()], roles: ["management"],
    });
    expect(mSuggest).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mInfo).not.toHaveBeenCalled();
  });

  it("does nothing when the linked room isn't found", async () => {
    await applyAutoRoomStatus({
      task: { ...baseTask, room: "999" }, newTaskStatus: "เสร็จ",
      rooms: [room()], roles: ["management"],
    });
    expect(mSuggest).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does nothing when there's no suggested transition", async () => {
    mSuggest.mockReturnValue(null);
    await applyAutoRoomStatus({
      task: baseTask, newTaskStatus: "เสร็จ", rooms: [room()], roles: ["management"],
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mInfo).not.toHaveBeenCalled();
    expect(mSuccess).not.toHaveBeenCalled();
  });

  it("shows a passive info toast (no write) when the user lacks room.editStatus", async () => {
    mSuggest.mockReturnValue({ rawStatus: "ว่าง", label: "พร้อมขาย" });
    mCanPerform.mockReturnValue(false);
    await applyAutoRoomStatus({
      task: baseTask, newTaskStatus: "เสร็จ", rooms: [room()], roles: ["engineer"],
    });
    expect(mInfo).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mSuccess).not.toHaveBeenCalled();
  });

  it("writes the room status + success toast when permitted and the write succeeds", async () => {
    mSuggest.mockReturnValue({ rawStatus: "ว่าง", label: "พร้อมขาย" });
    mCanPerform.mockReturnValue(true);
    global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) });

    await applyAutoRoomStatus({
      task: baseTask, newTaskStatus: "เสร็จ", rooms: [room()], roles: ["management"],
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/sheet/update");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({
      action: "updateRoomStatus", building: "A", room: "101", status: "ว่าง",
    });
    expect(mSuccess).toHaveBeenCalledTimes(1);
  });

  it("does not show success when the write returns ok:false", async () => {
    mSuggest.mockReturnValue({ rawStatus: "ว่าง", label: "พร้อมขาย" });
    mCanPerform.mockReturnValue(true);
    global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ ok: false }) });

    await applyAutoRoomStatus({
      task: baseTask, newTaskStatus: "เสร็จ", rooms: [room()], roles: ["management"],
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mSuccess).not.toHaveBeenCalled();
  });

  it("swallows fetch errors (non-critical side effect)", async () => {
    mSuggest.mockReturnValue({ rawStatus: "ว่าง", label: "พร้อมขาย" });
    mCanPerform.mockReturnValue(true);
    global.fetch = vi.fn().mockRejectedValue(new Error("network"));

    await expect(
      applyAutoRoomStatus({
        task: baseTask, newTaskStatus: "เสร็จ", rooms: [room()], roles: ["management"],
      }),
    ).resolves.toBeUndefined();
    expect(mSuccess).not.toHaveBeenCalled();
  });
});
