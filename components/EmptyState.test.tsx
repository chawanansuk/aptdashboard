import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import EmptyState from "./EmptyState";

afterEach(() => cleanup());

describe("<EmptyState>", () => {
  it("renders title + description", () => {
    const { getByText } = render(
      <EmptyState title="ไม่มีข้อมูล" description="ลองอีกครั้ง" />,
    );
    expect(getByText("ไม่มีข้อมูล")).toBeTruthy();
    expect(getByText("ลองอีกครั้ง")).toBeTruthy();
  });

  it("renders primary action button and fires onClick", () => {
    const onClick = vi.fn();
    const { getByText } = render(
      <EmptyState title="x" action={{ label: "+ เพิ่ม", onClick }} />,
    );
    fireEvent.click(getByText("+ เพิ่ม"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders secondary action alongside primary", () => {
    const { getByText } = render(
      <EmptyState
        title="x"
        action={{ label: "เพิ่ม", onClick: () => {} }}
        secondaryAction={{ label: "ดูตัวอย่าง", onClick: () => {} }}
      />,
    );
    expect(getByText("เพิ่ม")).toBeTruthy();
    expect(getByText("ดูตัวอย่าง")).toBeTruthy();
  });

  it("applies tone class when not neutral", () => {
    const { container, rerender } = render(<EmptyState title="x" tone="celebration" />);
    expect(container.querySelector(".ac-empty-state-celebration")).not.toBeNull();
    rerender(<EmptyState title="x" tone="warning" />);
    expect(container.querySelector(".ac-empty-state-warning")).not.toBeNull();
  });

  it("omits tone class on neutral (default)", () => {
    const { container } = render(<EmptyState title="x" />);
    expect(container.querySelector(".ac-empty-state-celebration")).toBeNull();
    expect(container.querySelector(".ac-empty-state-warning")).toBeNull();
  });

  it("applies compact class when compact=true", () => {
    const { container } = render(<EmptyState title="x" compact />);
    expect(container.querySelector(".ac-empty-state-compact")).not.toBeNull();
  });

  it("recognises all new icon variants without throwing", () => {
    // Smoke test that all icon keys resolve to SVG markup
    const icons = ["equipment", "facility", "maintenance", "celebration"] as const;
    for (const i of icons) {
      const { container, unmount } = render(<EmptyState icon={i} title={i} />);
      expect(container.querySelector(".ac-empty-icon svg")).not.toBeNull();
      unmount();
    }
  });

  it("has role=status for accessibility", () => {
    const { container } = render(<EmptyState title="x" />);
    const el = container.querySelector('[role="status"]') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.getAttribute("aria-live")).toBe("polite");
  });
});
