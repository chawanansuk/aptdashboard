import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTRACT_PILOT_BUILDINGS, CONTRACT_PLACEHOLDERS, buildContractFields, contractFileName,
  isContractPilot, thaiLongDate,
} from "./contractDraft";
import { bankFor } from "./bookingConfig";

const INPUT = {
  building: "มีทอง", room: "401", apartmentName: "มีทองเรสซิเด้นท์",
  tenant: "สมใจ {{เบอร์โทร}}", phone: "0812345678", rent: 5200, deposit: 10000, bookingPaid: 5200,
  moveInIso: "2026-11-01", contractTerms: "ขั้นต่ำ 6 เดือนขึ้นไป", pet: "",
};

describe("isContractPilot", () => {
  it("only the pilot building(s), any case/spacing", () => {
    expect(CONTRACT_PILOT_BUILDINGS).toEqual(["มีทอง"]);
    expect(isContractPilot("มีทอง")).toBe(true);
    expect(isContractPilot(" มีทอง ")).toBe(true);
    expect(isContractPilot("มั่งมี")).toBe(false);
    expect(isContractPilot("")).toBe(false);
  });
});

describe("buildContractFields", () => {
  const f = buildContractFields(INPUT, new Date(2026, 9, 28));

  it("fills every app-side blank from the booking form", () => {
    const appKeys = CONTRACT_PLACEHOLDERS.filter((p) => p.source === "app").map((p) => p.key).sort();
    expect(Object.keys(f).sort()).toEqual(appKeys);
    expect(f).toMatchObject({
      "ชื่อหอ": "มีทองเรสซิเด้นท์", "ห้อง": "401", "เบอร์โทร": "081-2345678",
      "ค่าเช่า": "5,200", "ค่าเช่าตัวอักษร": "ห้าพันสองร้อยบาทถ้วน",
      "เงินประกัน": "10,000", "เงินประกันตัวอักษร": "หนึ่งหมื่นบาทถ้วน", "มัดจำที่รับแล้ว": "5,200",
      "วันเริ่มสัญญา": "1 พฤศจิกายน 2569", "วันที่ทำร่าง": "28 ตุลาคม 2569",
      "สัตว์เลี้ยง": "ไม่มี",
    });
  });

  it("bank details come from the building's config, not from the form", () => {
    expect(f["เลขบัญชี"]).toBe(bankFor("มีทอง").accountNo);
    expect(f["ชื่อบัญชี"]).toBe(bankFor("มีทอง").accountName);
  });

  it("typed text can't smuggle in another blank", () => {
    expect(f["ชื่อผู้เช่า"]).toBe("สมใจ เบอร์โทร");
  });

  it("falls back to the building name when the apartment name is empty", () => {
    expect(buildContractFields({ ...INPUT, apartmentName: "  " })["ชื่อหอ"]).toBe("มีทอง");
  });
});

describe("helpers", () => {
  it("thaiLongDate", () => {
    expect(thaiLongDate(new Date(2027, 0, 5))).toBe("5 มกราคม 2570");
  });
  it("contractFileName strips characters a share sheet chokes on", () => {
    expect(contractFileName({ building: "มีทอง", room: "401", tenant: 'สมใจ / "ใจดี"' })).toBe("ร่างสัญญา มีทอง 401 สมใจ ใจดี.pdf");
  });
});

describe("contract with Code.gs", () => {
  const code = readFileSync(join(__dirname, "..", "apps-script", "Code.gs"), "utf8");
  it("the starter template offers every blank the app knows, and only those", () => {
    const starter = code.slice(code.indexOf("function contractStarterParagraphs_"), code.indexOf("function writeStarterContract_"));
    const used = new Set([...starter.matchAll(/\{\{([^{}]+)\}\}/g)].map((m) => m[1]));
    expect([...used].sort()).toEqual(CONTRACT_PLACEHOLDERS.map((p) => p.key).sort());
  });
  it("the rate blanks are the ones Code.gs fills from the sheet", () => {
    for (const p of CONTRACT_PLACEHOLDERS.filter((x) => x.source === "sheet")) {
      expect(code).toContain(`fields['${p.key}']`);
    }
  });
});
