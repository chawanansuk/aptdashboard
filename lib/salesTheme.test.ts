import { describe, expect, it } from "vitest";
import {
  toSalesStatus, salesMeta, SALES_STATUS_META, statusVars,
  apptKindFromType, APPT_KIND_META,
} from "./salesTheme";
import type { RoomStatus } from "@/types";

describe("toSalesStatus", () => {
  it("maps the four headline statuses 1:1", () => {
    expect(toSalesStatus("ready")).toBe("available");
    expect(toSalesStatus("pending")).toBe("pending");
    expect(toSalesStatus("moveout")).toBe("moveout");
    expect(toSalesStatus("occupied")).toBe("occupied");
  });

  it("collapses qc/repair/inactive to occupied (not sellable)", () => {
    (["qc", "repair", "inactive"] as RoomStatus[]).forEach((s) => {
      expect(toSalesStatus(s)).toBe("occupied");
    });
  });
});

describe("salesMeta / SALES_STATUS_META", () => {
  it("returns the design palette verbatim for available", () => {
    const m = salesMeta("ready");
    expect(m.base).toBe("#34D399");
    expect(m.tint).toBe("rgba(52,211,153,.12)");
    expect(m.border).toBe("rgba(52,211,153,.30)");
    expect(m.label).toBe("พร้อมขาย");
  });

  it("uses the lower-alpha grey border for occupied", () => {
    expect(SALES_STATUS_META.occupied.border).toBe("rgba(124,138,163,.18)");
  });
});

describe("statusVars", () => {
  it("exposes the three CSS custom properties", () => {
    expect(statusVars("moveout")).toEqual({
      "--st-base": "#FB7185",
      "--st-tint": "rgba(251,113,133,.12)",
      "--st-border": "rgba(251,113,133,.30)",
    });
  });
});

describe("apptKindFromType", () => {
  it("maps sales task types to appointment kinds", () => {
    expect(apptKindFromType("ชมห้อง")).toBe("view");
    expect(apptKindFromType("ย้ายเข้า")).toBe("movein");
    expect(apptKindFromType("ย้ายออก")).toBe("moveout");
  });
  it("returns null for non-sales types", () => {
    expect(apptKindFromType("ซ่อม")).toBeNull();
    expect(apptKindFromType("")).toBeNull();
  });
  it("view kind is the amber palette", () => {
    expect(APPT_KIND_META.view.base).toBe("#FBBF24");
  });
});
