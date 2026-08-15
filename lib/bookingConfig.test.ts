import { describe, expect, it } from "vitest";
import {
  DEFAULT_BANK,
  DEFAULT_DEPOSIT,
  apartmentNameFor,
  bankFor,
  defaultDepositFor,
} from "./bookingConfig";

describe("bookingConfig", () => {
  it("bankFor falls back to the company account for unknown buildings", () => {
    expect(bankFor("ตึกที่ไม่มีจริง")).toBe(DEFAULT_BANK);
    expect(bankFor("")).toBe(DEFAULT_BANK);
  });

  it("company bank values are the real ones sent to customers", () => {
    expect(DEFAULT_BANK.bank).toBe("กรุงไทย");
    expect(DEFAULT_BANK.accountNo).toBe("017-0-46047-9");
    expect(DEFAULT_BANK.accountName).toBe("บริษัท ม.ทวีทอง จำกัด");
  });

  it("each building resolves its own real account (owner data 2026-07)", () => {
    expect(bankFor("มีทอง")).toMatchObject({ bank: "กรุงไทย", accountNo: "017-0-46047-9" });
    expect(bankFor("มั่งมี")).toMatchObject({ bank: "กสิกร", accountNo: "051-1-88802-6", accountName: "นายชวนันท์ สุขพรชัยรัก" });
    expect(bankFor("มายทรี48")).toMatchObject({ bank: "ไทยพาณิชย์", accountNo: "039-232971-2" });
    expect(bankFor("บ้านคุณหลวง")).toMatchObject({ bank: "ออมสิน", accountNo: "020-2-2690349-8" });
    expect(bankFor("บ้านมีทรัพย์")).toMatchObject({ bank: "อาคารสงเคราะห์", accountNo: "206-1-1000754-2", accountName: "CHAWANAN SUKPORNCHAIRAK" });
  });

  it("matches flexibly when the sheet name is longer/shorter than the key", () => {
    expect(bankFor("หอพักมั่งมีทวีสุข").bank).toBe("กสิกร"); // sheet longer than key
    expect(bankFor("มายทรี").bank).toBe("ไทยพาณิชย์");        // sheet shorter than key
  });

  it("apartmentNameFor maps the full names, falls back to เรสซิเด้นท์", () => {
    expect(apartmentNameFor("มีทอง")).toBe("มีทองเรสซิเด้นท์");
    expect(apartmentNameFor("มั่งมี")).toBe("หอพักมั่งมีทวีสุข");
    expect(apartmentNameFor("มายทรี48")).toBe("หอพักมายทรี48");
    expect(apartmentNameFor("บ้านคุณหลวง")).toBe("หอพักบ้านคุณหลวง");
    expect(apartmentNameFor("บ้านมีทรัพย์")).toBe("หอพักบ้านมีทรัพย์");
    // KL is a REAL building (บ้านคุณหลวง) — use a genuinely unknown one
    // to exercise the fallback.
    expect(apartmentNameFor("ตึกใหม่")).toBe("ตึกใหม่ เรสซิเด้นท์");
  });

  it("defaultDepositFor falls back to 10,000", () => {
    expect(defaultDepositFor("ตึกที่ไม่มีจริง")).toBe(DEFAULT_DEPOSIT);
    expect(DEFAULT_DEPOSIT).toBe(10000);
  });
});

describe("KL / บ้านคุณหลวง (sheet name ≠ display name)", () => {
  it("resolves the ออมสิน account for every spelling of the building", () => {
    for (const name of ["KL", "Kl", "kl", "บ้านคุณหลวง"]) {
      expect(bankFor(name)).toMatchObject({
        bank: "ออมสิน", accountNo: "020-2-2690349-8", accountName: "นายชวนันท์ สุขพรชัยรัก",
      });
    }
  });

  it("shows หอพักบ้านคุณหลวง instead of the old 'KL เรสซิเด้นท์' fallback", () => {
    expect(apartmentNameFor("KL")).toBe("หอพักบ้านคุณหลวง");
    expect(apartmentNameFor("Kl")).toBe("หอพักบ้านคุณหลวง");
  });

  it("every real building resolves a non-default account", () => {
    for (const b of ["KL", "มั่งมี", "มายทรี48", "มีทรัพย์", "มีทอง"]) {
      expect(apartmentNameFor(b)).not.toContain("เรสซิเด้นท์ ");
      expect(bankFor(b).accountNo).toBeTruthy();
    }
    // มีทรัพย์ (sheet) must reach the ธอส. account, not the default
    expect(bankFor("มีทรัพย์").bank).toBe("อาคารสงเคราะห์");
    expect(bankFor("มายทรี48").bank).toBe("ไทยพาณิชย์");
  });
});
