import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ContractInput } from "@/lib/contractDraft";

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), dismiss: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: toastMock, default: toastMock }));

import ContractDraftPanel from "./ContractDraftPanel";

const INPUT: ContractInput = {
  building: "มีทอง", room: "401", apartmentName: "มีทองเรสซิเด้นท์", tenant: "สมใจ", phone: "0812345678",
  rent: 5200, deposit: 10000, bookingPaid: 5200, moveInIso: "2026-11-01", contractTerms: "ขั้นต่ำ 6 เดือนขึ้นไป", pet: "",
};

function mockApi(opts: { template?: boolean; manage?: boolean; sample?: boolean } = {}) {
  const { template = true, manage = false, sample = false } = opts;
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    if (!init || init.method !== "POST") {
      return { ok: true, status: 200, json: async () => ({ ok: true, pilot: true, manage, template: template ? (manage ? { docUrl: "https://docs.google.com/document/d/abc/edit" } : {}) : null }) };
    }
    const body = JSON.parse(String(init.body));
    if (body.action === "createTemplate") {
      return { ok: true, status: 200, json: async () => ({ ok: true, docUrl: "https://docs.google.com/document/d/new/edit", created: true }) };
    }
    return {
      ok: true, status: 200,
      headers: new Headers({ "X-Contract-Sample": sample ? "1" : "0" }),
      blob: async () => new Blob(["%PDF-1.4"], { type: "application/pdf" }),
      json: async () => ({}),
    };
  });
  vi.stubGlobal("fetch", f);
  return f;
}
const posts = (f: ReturnType<typeof mockApi>) =>
  f.mock.calls.filter((c) => c[1]?.method === "POST").map((c) => JSON.parse(String(c[1]!.body)));

beforeEach(() => {
  Object.values(toastMock).forEach((m) => m.mockReset());
  URL.createObjectURL = vi.fn(() => "blob:draft");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("<ContractDraftPanel>", () => {
  it("renders nothing (and asks nothing) outside the pilot buildings", () => {
    const f = mockApi();
    const { container } = render(<ContractDraftPanel building="มั่งมี" input={INPUT} />);
    expect(container.innerHTML).toBe("");
    expect(f).not.toHaveBeenCalled();
  });

  it("makes the PDF from the form and shares it to LINE", async () => {
    const f = mockApi();
    const share = vi.fn(async () => {});
    Object.assign(navigator, { share, canShare: () => true });
    render(<ContractDraftPanel building="มีทอง" input={INPUT} />);
    fireEvent.click(await screen.findByRole("button", { name: "ทำร่างสัญญา (PDF)" }));
    await screen.findByText("ร่างสัญญา มีทอง 401 สมใจ.pdf");
    expect(posts(f)[0]).toEqual({ action: "draft", ...INPUT });
    fireEvent.click(screen.getByRole("button", { name: "ส่งเข้า LINE" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    const arg = (share.mock.calls[0] as unknown as [{ files: File[] }])[0];
    expect(arg.files[0].name).toBe("ร่างสัญญา มีทอง 401 สมใจ.pdf");
    expect(arg.files[0].type).toBe("application/pdf");
  });

  it("a draft from the SAMPLE wording can be read but not sent", async () => {
    mockApi({ sample: true });
    render(<ContractDraftPanel building="มีทอง" input={INPUT} />);
    fireEvent.click(await screen.findByRole("button", { name: "ทำร่างสัญญา (PDF)" }));
    await screen.findByText(/ห้ามส่งลูกค้าจริง/);
    expect(screen.queryByRole("button", { name: "ส่งเข้า LINE" })).toBeNull();
    expect(screen.getByRole("link", { name: "เปิดดู" })).toBeTruthy();
    expect(toastMock.warning).toHaveBeenCalled();
  });

  it("a changed form makes the draft stale until it is made again", async () => {
    mockApi();
    const { rerender } = render(<ContractDraftPanel building="มีทอง" input={INPUT} />);
    fireEvent.click(await screen.findByRole("button", { name: "ทำร่างสัญญา (PDF)" }));
    await screen.findByRole("button", { name: "ส่งเข้า LINE" });
    rerender(<ContractDraftPanel building="มีทอง" input={{ ...INPUT, rent: 5500 }} />);
    expect(screen.queryByRole("button", { name: "ส่งเข้า LINE" })).toBeNull();
    expect(screen.getByText(/ข้อมูลในฟอร์มเปลี่ยนหลังทำร่าง/)).toBeTruthy();
  });

  it("waits for the required fields", async () => {
    mockApi();
    render(<ContractDraftPanel building="มีทอง" input={null} />);
    expect((await screen.findByRole("button", { name: "ทำร่างสัญญา (PDF)" })).hasAttribute("disabled")).toBe(true);
  });

  it("no template: a manager creates it and gets the Docs link; others are told who can", async () => {
    const f = mockApi({ template: false, manage: true });
    render(<ContractDraftPanel building="มีทอง" input={INPUT} />);
    fireEvent.click(await screen.findByRole("button", { name: "สร้างแม่แบบสัญญา" }));
    const link = await screen.findByRole("link", { name: /แก้ถ้อยคำ/ });
    expect(link.getAttribute("href")).toBe("https://docs.google.com/document/d/new/edit");
    expect(posts(f)[0]).toEqual({ action: "createTemplate", building: "มีทอง" });
    cleanup();
    mockApi({ template: false, manage: false });
    render(<ContractDraftPanel building="มีทอง" input={INPUT} />);
    await screen.findByText(/ให้ผู้จัดการกด/);
    expect(screen.queryByRole("button", { name: "สร้างแม่แบบสัญญา" })).toBeNull();
  });
});
