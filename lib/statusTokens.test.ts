import { describe, expect, it } from "vitest";
import { TOKEN } from "./statusTokens";
import {
  STATUS_DOT, EQUIPMENT_STATUS_COLOR,
  FACILITY_STATUS_COLOR, MAINTENANCE_STATUS_COLOR,
} from "./constants";

/**
 * Visual-diff = 0 guarantee.
 *
 * If anyone tweaks TOKEN values, these tests force them to also update
 * the expected hex below — preventing accidental visual regression
 * across every status badge in the app.
 */

describe("statusTokens: exported palette", () => {
  it("has the expected base hex values", () => {
    expect(TOKEN.ok).toBe("#16A34A");
    expect(TOKEN.okBright).toBe("#22C55E");
    expect(TOKEN.warn).toBe("#EAB308");
    expect(TOKEN.action).toBe("#F97316");
    expect(TOKEN.danger).toBe("#DC2626");
    expect(TOKEN.alert).toBe("#EF4444");
    expect(TOKEN.info).toBe("#A855F7");
    expect(TOKEN.occupied).toBe("#1E293B");
    expect(TOKEN.neutral).toBe("#94A3B8");
    expect(TOKEN.inactive).toBe("#E2E8F0");
  });
});

describe("statusTokens: STATUS_DOT (rooms) preserves prior values", () => {
  it("each room status renders the exact same hex as before tokens", () => {
    expect(STATUS_DOT.occupied).toBe("#1E293B");
    expect(STATUS_DOT.ready).toBe("#22C55E");
    expect(STATUS_DOT.pending).toBe("#A855F7");
    expect(STATUS_DOT.moveout).toBe("#EF4444");
    expect(STATUS_DOT.qc).toBe("#F97316");
    expect(STATUS_DOT.repair).toBe("#EAB308");
    expect(STATUS_DOT.inactive).toBe("#E2E8F0");
  });
});

describe("statusTokens: EQUIPMENT_STATUS_COLOR preserves prior values", () => {
  it("each equipment status renders the exact same hex", () => {
    expect(EQUIPMENT_STATUS_COLOR["ปกติ"]).toBe("#16A34A");
    expect(EQUIPMENT_STATUS_COLOR["ต้องซ่อม"]).toBe("#EAB308");
    expect(EQUIPMENT_STATUS_COLOR["กำลังซ่อม"]).toBe("#F97316");
    expect(EQUIPMENT_STATUS_COLOR["ใช้ไม่ได้"]).toBe("#DC2626");
  });
});

describe("statusTokens: FACILITY_STATUS_COLOR preserves prior values", () => {
  it("each facility status renders the exact same hex", () => {
    expect(FACILITY_STATUS_COLOR["ใช้งานได้"]).toBe("#16A34A");
    expect(FACILITY_STATUS_COLOR["ต้องซ่อม"]).toBe("#EAB308");
    expect(FACILITY_STATUS_COLOR["กำลังซ่อม"]).toBe("#F97316");
    expect(FACILITY_STATUS_COLOR["ปิดใช้งาน"]).toBe("#DC2626");
  });
});

describe("statusTokens: MAINTENANCE_STATUS_COLOR preserves prior values", () => {
  it("each maintenance status renders the exact same hex", () => {
    expect(MAINTENANCE_STATUS_COLOR["ok"]).toBe("#16A34A");
    expect(MAINTENANCE_STATUS_COLOR["due-soon"]).toBe("#EAB308");
    expect(MAINTENANCE_STATUS_COLOR["overdue"]).toBe("#DC2626");
    expect(MAINTENANCE_STATUS_COLOR["unknown"]).toBe("#94A3B8");
  });
});
