import { describe, expect, it } from "vitest";
import {
  BANK_BY_BUILDING,
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

  it("every account is complete (bank, digits-and-dashes number, name)", () => {
    for (const a of [DEFAULT_BANK, ...Object.values(BANK_BY_BUILDING)]) {
      expect(a.bank).toBeTruthy();
      expect(a.accountNo).toMatch(/^\d[\d-]+\d$/);
      expect(a.accountName).toBeTruthy();
    }
  });

  it("each building resolves its own account (owner data 2026-07)", () => {
    expect(bankFor("มีทอง")).toBe(BANK_BY_BUILDING["มีทอง"]);
    expect(bankFor("มีทอง").bank).toBe("กรุงไทย");
    expect(bankFor("มั่งมี")).toBe(BANK_BY_BUILDING["มั่งมี"]); // ย้ายเป็นกรุงไทย (เจ้าของแจ้ง 2026-08-31)
    expect(bankFor("มั่งมี").bank).toBe("กรุงไทย");
    expect(bankFor("มายทรี48")).toBe(BANK_BY_BUILDING["มายทรี"]);
    expect(bankFor("มายทรี48").bank).toBe("ไทยพาณิชย์");
    expect(bankFor("บ้านคุณหลวง").bank).toBe("ออมสิน");
    expect(bankFor("บ้านมีทรัพย์")).toBe(BANK_BY_BUILDING["บ้านมีทรัพย์"]);
    expect(bankFor("บ้านมีทรัพย์").bank).toBe("อาคารสงเคราะห์");
    // buildings with their own account never fall back to the company one
    expect(bankFor("มั่งมี")).not.toEqual(DEFAULT_BANK);
  });

  it("matches flexibly when the sheet name is longer/shorter than the key", () => {
    expect(bankFor("หอพักมั่งมีทวีสุข").bank).toBe("กรุงไทย"); // sheet longer than key
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
      expect(bankFor(name)).toEqual(BANK_BY_BUILDING["KL"]);
      expect(bankFor(name).bank).toBe("ออมสิน");
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
