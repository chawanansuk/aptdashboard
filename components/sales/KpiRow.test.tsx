import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import KpiRow from "./KpiRow";

afterEach(cleanup);

const KPIS = { available: 3, appointmentsThisWeek: 2, pending: 4, moveout: 1 };

describe("<KpiRow>", () => {
  it("draws a sparkline only for cards with a real series", () => {
    const { container } = render(<KpiRow kpis={KPIS} trends={{ appointments: [0, 1, 1, 2, 0, 3, 2] }} />);
    // Only นัดหมาย has data; the three room-status cards used to draw an
    // invented wave here.
    expect(container.querySelectorAll("svg polyline, svg path[d]").length).toBeGreaterThan(0);
    const cards = Array.from(container.querySelectorAll("[class*='kpiCard']"));
    expect(cards).toHaveLength(4);
    const withSpark = cards.filter((c) => c.querySelector("[class*='kpiSpark']"));
    expect(withSpark).toHaveLength(1);
    expect(withSpark[0].textContent).toContain("นัดหมายสัปดาห์นี้");
  });

  it("with no trends at all, no card shows a line — just the numbers", () => {
    const { container } = render(<KpiRow kpis={KPIS} />);
    expect(container.querySelector("[class*='kpiSpark']")).toBeNull();
    expect(container.textContent).toContain("ห้องว่างพร้อมขาย");
    expect(container.textContent).toContain("3");
  });
});
