import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  Icon, ICON_REGISTRY, EQUIPMENT_TYPE_ICON, FACILITY_TYPE_ICON,
  JOURNEY_ACTION_ICON, equipmentIcon, facilityIcon,
} from "./icons";
import { EQUIPMENT_TYPES, FACILITY_TYPES } from "./constants";

afterEach(() => cleanup());

describe("<Icon>", () => {
  // V2 regression: passing fill={undefined} through to lucide overrode its
  // own fill="none" default (lucide spreads props last), and every outline
  // icon in the app rendered as a solid black shape.
  it("stays an outline icon unless a fill is asked for", () => {
    const { container } = render(<Icon name="close" />);
    expect(container.querySelector("svg")?.getAttribute("fill")).toBe("none");
  });

  it("applies an explicit fill (pinned star)", () => {
    const { container } = render(<Icon name="star" fill="currentColor" />);
    expect(container.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
  });

  it("is decorative by default, labelled when given a label", () => {
    const { container, rerender } = render(<Icon name="check" />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    rerender(<Icon name="check" label="อนุญาต" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toBe("อนุญาต");
    expect(svg?.getAttribute("role")).toBe("img");
  });
});

describe("domain icon maps", () => {
  it("every equipment and facility type has a registered icon", () => {
    for (const t of EQUIPMENT_TYPES) expect(ICON_REGISTRY[EQUIPMENT_TYPE_ICON[t]], t).toBeTruthy();
    for (const t of FACILITY_TYPES) expect(ICON_REGISTRY[FACILITY_TYPE_ICON[t]], t).toBeTruthy();
  });

  it("unknown types fall back instead of rendering nothing", () => {
    expect(equipmentIcon("เครื่องใหม่ที่ยังไม่มีในรายการ")).toBe("maintenance");
    expect(facilityIcon("พื้นที่ใหม่")).toBe("facilities");
  });

  it("every journey action has a registered icon", () => {
    for (const [id, name] of Object.entries(JOURNEY_ACTION_ICON)) {
      expect(ICON_REGISTRY[name], id).toBeTruthy();
    }
  });
});
