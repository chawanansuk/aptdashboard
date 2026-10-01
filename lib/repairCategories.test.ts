import { describe, expect, it } from "vitest";
import { REPAIR_CATEGORIES, categoryForEquipment, isRepairCategory, suggestRepairCategory } from "./repairCategories";

describe("suggestRepairCategory", () => {
  it("reads the usual small repairs the way a technician would", () => {
    const cases: [string, string][] = [
      ["เปลี่ยนหลอดไฟห้องน้ำ 2 หลอด", "ไฟฟ้า"],       // "น้ำ" inside ห้องน้ำ must not pull it to ประปา
      ["ไฟห้องนอนดับ เช็คเบรกเกอร์", "ไฟฟ้า"],
      ["ก๊อกอ่างล้างหน้ารั่ว เปลี่ยนวาล์ว", "ประปา"],
      ["ชักโครกน้ำไหลไม่หยุด", "ประปา"],
      ["ท่อน้ำทิ้งตัน ลอกท่อ", "ประปา"],
      ["แอร์ไม่เย็น เติมน้ำยา ล้างคอยล์", "แอร์"],    // น้ำยา + แอร์ beat ประปา's น้ำ
      ["ล้างแอร์ประจำ 3 เดือน", "แอร์"],
      ["เครื่องทำน้ำอุ่นไม่ร้อน", "เครื่องใช้ไฟฟ้า"],
      ["ตู้เย็นไม่เย็น", "เครื่องใช้ไฟฟ้า"],
      ["ลูกบิดประตูหลวม", "ประตู-หน้าต่าง"],
      ["มุ้งลวดหน้าต่างขาด", "ประตู-หน้าต่าง"],
      ["ขาเตียงหัก", "เฟอร์นิเจอร์"],
      ["ราวม่านหลุด", "เฟอร์นิเจอร์"],
      ["ผนังขึ้นรา ทาสีใหม่", "ผนัง-พื้น-เพดาน"],
      ["ฝ้าเพดานเป็นรา", "ผนัง-พื้น-เพดาน"],
    ];
    for (const [text, want] of cases) expect(suggestRepairCategory(text), text).toBe(want);
  });

  it("returns null for text it can't place, and never for blank", () => {
    expect(suggestRepairCategory("ช่วยดูหน่อย")).toBeNull();
    expect(suggestRepairCategory("")).toBeNull();
    expect(suggestRepairCategory("   ")).toBeNull();
  });

  it("every suggestion is a real category", () => {
    for (const t of ["แอร์", "ก๊อก", "เตียง", "ประตู", "หลอด", "ตู้เย็น", "ผนัง"]) {
      expect(isRepairCategory(suggestRepairCategory(t))).toBe(true);
    }
    expect(isRepairCategory("ซ่อม")).toBe(false);
    expect(REPAIR_CATEGORIES[REPAIR_CATEGORIES.length - 1]).toBe("อื่นๆ");
  });

  it("equipment records map to a category, unknown kinds to appliances", () => {
    expect(categoryForEquipment("แอร์")).toBe("แอร์");
    expect(categoryForEquipment("ปั๊มน้ำ")).toBe("ประปา");
    expect(categoryForEquipment("เครื่องซักผ้า")).toBe("เครื่องใช้ไฟฟ้า");
    expect(categoryForEquipment("ลิฟต์")).toBe("เครื่องใช้ไฟฟ้า");
  });
});
