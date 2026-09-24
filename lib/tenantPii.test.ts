import { describe, expect, it } from "vitest";
import { maskPhones, stripTenantPii } from "./tenantPii";
import type { RoomRow } from "@/types";

describe("maskPhones", () => {
  it("masks Thai phone numbers however they are written", () => {
    expect(maskPhones("โทร 0812345678 ก่อนเข้า")).toBe("โทร 081-xxx-xxxx ก่อนเข้า");
    expect(maskPhones("081-234-5678")).toBe("081-xxx-xxxx");
    expect(maskPhones("081 234 5678")).toBe("081-xxx-xxxx");
    expect(maskPhones("+66 81 234 5678")).toBe("668-xxx-xxxx");
    expect(maskPhones("ออฟฟิศ 02-123-4567")).toBe("ออฟฟิศ 021-xxx-xxxx");
    expect(maskPhones("คุณเอ 0891112222 / คุณบี 0893334444")).toBe("คุณเอ 089-xxx-xxxx / คุณบี 089-xxx-xxxx");
  });

  it("leaves prices, dates, room numbers and short numbers alone", () => {
    for (const t of ["ค่าเช่า 4500", "4,500 บาท", "เข้า 1/10/2026", "ห้อง 104 ชั้น 1", "มัดจำ 10000", "เลขที่ 12345678901"]) {
      expect(maskPhones(t)).toBe(t);
    }
    expect(maskPhones("")).toBe("");
  });
});

describe("stripTenantPii", () => {
  const row: RoomRow = {
    building: "มั่งมี", room: "104", floor: "1", price: "4500", status: "รอสัญญา",
    tenant: "คุณเอ", phone: "0812345678", contractEnd: "31/12/2026",
    note: "คุณเอ เข้า 1 ต.ค. โทร 0812345678",
  };

  it("blanks tenant/phone, keeps the note with its phone masked, keeps contractEnd", () => {
    const [out] = stripTenantPii([row]);
    expect(out.tenant).toBe("");
    expect(out.phone).toBe("");
    expect(out.contractEnd).toBe("31/12/2026");
    expect(out.note).toBe("คุณเอ เข้า 1 ต.ค. โทร 081-xxx-xxxx");
  });

  it("does not invent a note field on rows that have none", () => {
    const { note: _n, ...noNote } = row;
    void _n;
    const [out] = stripTenantPii([noNote as RoomRow]);
    expect(out).not.toHaveProperty("note");
  });
});
