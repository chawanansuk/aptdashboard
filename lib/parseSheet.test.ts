import { describe, it, expect } from "vitest";
import { parseCSV, parseRoomsCSV } from "./parseSheet";

describe("parseCSV (tasks sheet)", () => {
  it("maps Thai headers to English fields", () => {
    const csv = [
      "วันที่,ประเภท,ตึก,ห้อง,ลูกค้า,เบอร์,หมายเหตุ,สถานะ,ผู้สร้าง,วันที่สร้าง",
      "25/05/2026,ทำสะอาด,A,101,คุณเอ,0812345678,ด่วน,รอ,admin,24/05/2026",
    ].join("\n");
    const [row] = parseCSV(csv);
    expect(row).toMatchObject({
      date: "25/05/2026",
      type: "ทำสะอาด",
      building: "A",
      room: "101",
      customer: "คุณเอ",
      phone: "0812345678",
      note: "ด่วน",
      status: "รอ",
      creator: "admin",
      createdAt: "24/05/2026",
    });
  });

  it("trims surrounding whitespace in headers and values", () => {
    const csv = [
      " วันที่ , ประเภท , ตึก , ห้อง ",
      " 01/06/2026 , ซ่อม , B , 202 ",
    ].join("\n");
    const [row] = parseCSV(csv);
    expect(row.date).toBe("01/06/2026");
    expect(row.type).toBe("ซ่อม");
    expect(row.building).toBe("B");
    expect(row.room).toBe("202");
  });

  it("drops rows missing date, type, or building", () => {
    const csv = [
      "วันที่,ประเภท,ตึก,ห้อง",
      "25/05/2026,ทำสะอาด,A,101", // valid
      ",ทำสะอาด,A,102",           // no date
      "25/05/2026,,A,103",        // no type
      "25/05/2026,ทำสะอาด,,104",  // no building
    ].join("\n");
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].room).toBe("101");
  });

  it("defaults missing optional columns to empty string", () => {
    const csv = ["วันที่,ประเภท,ตึก,ห้อง", "25/05/2026,ทำสะอาด,A,101"].join("\n");
    const [row] = parseCSV(csv);
    expect(row.creator).toBe("");
    expect(row.createdAt).toBe("");
    expect(row.note).toBe("");
  });

  it("never sets the numeric `cost` field (not in the header map)", () => {
    const csv = ["วันที่,ประเภท,ตึก,ค่าใช้จ่าย", "25/05/2026,ซ่อม,A,500"].join("\n");
    const [row] = parseCSV(csv);
    expect(row.cost).toBeUndefined();
  });

  it("ignores unknown extra columns", () => {
    const csv = ["วันที่,ประเภท,ตึก,พิเศษ", "25/05/2026,ซ่อม,A,xyz"].join("\n");
    const [row] = parseCSV(csv);
    expect(row.building).toBe("A");
    expect((row as unknown as Record<string, unknown>).พิเศษ).toBeUndefined();
  });
});

describe("parseRoomsCSV (rooms sheet)", () => {
  it("maps canonical headers", () => {
    const csv = [
      "ตึก,ห้อง,ชั้น,ค่าเช่า,สถานะ,ผู้เช่า,เบอร์,สัญญา",
      "A,101,1,5500,ว่าง,คุณบี,0899999999,31/12/2026",
    ].join("\n");
    const [row] = parseRoomsCSV(csv);
    expect(row).toEqual({
      building: "A",
      room: "101",
      floor: "1",
      price: "5500",
      status: "ว่าง",
      tenant: "คุณบี",
      phone: "0899999999",
      contractEnd: "31/12/2026",
      images: "", // #7 — no image column in this fixture → empty
    });
  });

  it("resolves alias headers (อาคาร→building, เลขห้อง→room)", () => {
    const csv = ["อาคาร,เลขห้อง", "C,303"].join("\n");
    const [row] = parseRoomsCSV(csv);
    expect(row.building).toBe("C");
    expect(row.room).toBe("303");
  });

  it("first alias in the list wins when several columns are present", () => {
    // price aliases order: ["ค่าเช่า", "ราคา/เดือน", "ราคา", ...]
    const csv = ["ตึก,ห้อง,ค่าเช่า,ราคา", "A,101,5500,9999"].join("\n");
    const [row] = parseRoomsCSV(csv);
    expect(row.price).toBe("5500"); // ค่าเช่า beats ราคา
  });

  it("skips an empty alias value and falls through to the next", () => {
    const csv = ["ตึก,ห้อง,ค่าเช่า,ราคา", "A,101,,7000"].join("\n");
    const [row] = parseRoomsCSV(csv);
    expect(row.price).toBe("7000"); // ค่าเช่า empty → use ราคา
  });

  it("defaults missing fields to empty string (never undefined)", () => {
    const csv = ["ตึก,ห้อง", "A,101"].join("\n");
    const [row] = parseRoomsCSV(csv);
    expect(row.price).toBe("");
    expect(row.tenant).toBe("");
    expect(row.phone).toBe("");
    expect(row.contractEnd).toBe("");
    expect(row.status).toBe("");
  });

  it("drops rows missing building or room", () => {
    const csv = [
      "ตึก,ห้อง",
      "A,101", // valid
      ",102",  // no building
      "A,",    // no room
    ].join("\n");
    const rows = parseRoomsCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].room).toBe("101");
  });

  it("trims whitespace in values", () => {
    const csv = ["ตึก,ห้อง,ผู้เช่า", " A , 101 , คุณซี "].join("\n");
    const [row] = parseRoomsCSV(csv);
    expect(row.building).toBe("A");
    expect(row.room).toBe("101");
    expect(row.tenant).toBe("คุณซี");
  });
});
