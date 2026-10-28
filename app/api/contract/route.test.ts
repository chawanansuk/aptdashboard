import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const authMock = vi.fn();
const callMock = vi.fn();

vi.mock("@/auth", () => ({ auth: () => authMock() }));
vi.mock("@/lib/appsScriptFetch", () => ({
  appsScriptCall: (...args: unknown[]) => callMock(...args),
  AppsScriptError: class AppsScriptError extends Error { status = 502; },
}));

import { GET, POST } from "./route";

const as = (...roles: string[]) => authMock.mockResolvedValue({ user: { email: "u@apt.test", roles } });
const post = (body: unknown) => POST(new Request("http://t/api/contract", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}));
const DRAFT = {
  action: "draft", building: "มีทอง", room: "401", apartmentName: "มีทองเรสซิเด้นท์",
  tenant: "สมใจ", phone: "0812345678", rent: 5200, deposit: 10000, bookingPaid: 5200,
  moveInIso: "2026-11-01", contractTerms: "ขั้นต่ำ 6 เดือนขึ้นไป", pet: "",
};
const PDF_B64 = Buffer.from("%PDF-1.4 fake").toString("base64");

beforeEach(() => {
  authMock.mockReset();
  callMock.mockReset().mockImplementation(async (action: string) => {
    if (action === "draftContract") return { ok: true, result: { pdfBase64: PDF_B64, sample: true } };
    if (action === "getContractTemplate") return { ok: true, result: { building: "มีทอง", docUrl: "https://docs.google.com/document/d/abc/edit" } };
    if (action === "createContractTemplate") return { ok: true, result: { docUrl: "https://docs.google.com/document/d/new/edit", created: true } };
    return { ok: false, error: "unknown" };
  });
});

describe("POST draft", () => {
  it("returns the PDF, flags a sample template, sends the filled blanks", async () => {
    as("sales");
    const res = await post(DRAFT);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("X-Contract-Sample")).toBe("1");
    expect(decodeURIComponent(res.headers.get("Content-Disposition")!)).toContain("ร่างสัญญา มีทอง 401 สมใจ.pdf");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("%PDF-1.4 fake");
    const [action, body] = callMock.mock.calls[0] as [string, { fields: Record<string, string> }];
    expect(action).toBe("draftContract");
    expect(body.fields).toMatchObject({ "ชื่อผู้เช่า": "สมใจ", "ค่าเช่า": "5,200", "ค่าเช่าตัวอักษร": "ห้าพันสองร้อยบาทถ้วน" });
  });

  it("no template yet → 404 with a code the screen understands", async () => {
    as("sales");
    callMock.mockResolvedValueOnce({ ok: false, error: "NO_TEMPLATE: ยังไม่มีแม่แบบสัญญาของตึก มีทอง" });
    const res = await post(DRAFT);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "no_template", error: "ยังไม่มีแม่แบบสัญญาของตึก มีทอง" });
  });

  it("only booking roles, only pilot buildings, valid input", async () => {
    as("engineer");
    expect((await post(DRAFT)).status).toBe(403);
    as("sales");
    expect((await post({ ...DRAFT, building: "มั่งมี" })).status).toBe(403);
    expect((await post({ ...DRAFT, moveInIso: "1/11/2026" })).status).toBe(400);
    expect((await post({ ...DRAFT, rent: -1 })).status).toBe(400);
    authMock.mockResolvedValue(null);
    expect((await post(DRAFT)).status).toBe(401);
    expect(callMock).not.toHaveBeenCalled();
  });
});

describe("POST createTemplate", () => {
  it("managers only; the starter names the building's account holder as lessor", async () => {
    as("sales");
    expect((await post({ action: "createTemplate", building: "มีทอง" })).status).toBe(403);
    as("management");
    const res = await post({ action: "createTemplate", building: "มีทอง" });
    expect(await res.json()).toMatchObject({ ok: true, docUrl: "https://docs.google.com/document/d/new/edit", created: true });
    expect(callMock).toHaveBeenCalledWith("createContractTemplate",
      expect.objectContaining({ building: "มีทอง", creator: "u@apt.test", lessor: expect.any(String) }), expect.anything());
  });
});

describe("GET", () => {
  it("managers get the Doc link to edit; sales only learn that it exists", async () => {
    as("management");
    expect(await (await GET(new Request("http://t/api/contract?building=มีทอง"))).json())
      .toMatchObject({ ok: true, pilot: true, manage: true, template: { docUrl: "https://docs.google.com/document/d/abc/edit" } });
    as("sales");
    const j = await (await GET(new Request("http://t/api/contract?building=มีทอง"))).json();
    expect(j).toMatchObject({ pilot: true, manage: false, template: {} });
    expect(j.template).not.toHaveProperty("docUrl");
  });

  it("a building outside the pilot answers without calling Google", async () => {
    as("management");
    expect(await (await GET(new Request("http://t/api/contract?building=มั่งมี"))).json()).toMatchObject({ pilot: false });
    expect(callMock).not.toHaveBeenCalled();
  });
});

describe("contract with Code.gs", () => {
  it("every Apps Script action this route calls exists in Code.gs", async () => {
    const code = readFileSync(join(__dirname, "..", "..", "..", "apps-script", "Code.gs"), "utf8");
    as("management");
    await GET(new Request("http://t/api/contract?building=มีทอง"));
    await post(DRAFT);
    await post({ action: "createTemplate", building: "มีทอง" });
    const actions = new Set(callMock.mock.calls.map((c) => c[0] as string));
    expect([...actions].sort()).toEqual(["createContractTemplate", "draftContract", "getContractTemplate"]);
    for (const a of actions) expect(code, a).toContain(`case '${a}':`);
  });
});
