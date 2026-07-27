import { describe, expect, it } from "vitest";
import {
  DEFAULT_BANK,
  DEFAULT_DEPOSIT,
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

  it("defaultDepositFor falls back to 10,000", () => {
    expect(defaultDepositFor("ตึกที่ไม่มีจริง")).toBe(DEFAULT_DEPOSIT);
    expect(DEFAULT_DEPOSIT).toBe(10000);
  });
});
