import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Skeleton, SkeletonText, SkeletonCard } from "./Skeleton";

// vitest doesn't auto-cleanup between tests in this project (no global
// setup file). Without this, getByRole/querySelector see leftover DOM
// from earlier renders.
afterEach(() => cleanup());

describe("<Skeleton>", () => {
  it("renders with role=status + aria-busy for screen readers", () => {
    const { container } = render(<Skeleton />);
    const el = container.querySelector('[role="status"]') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.getAttribute("aria-busy")).toBe("true");
    expect(el.getAttribute("aria-label")).toBe("กำลังโหลด");
  });

  it("attaches the ac-skel class so the existing shimmer animation runs", () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector(".ac-skel")).not.toBeNull();
  });

  it("applies shape-specific border-radius", () => {
    const { container, rerender } = render(<Skeleton shape="circle" width={40} height={40} />);
    let el = container.querySelector(".ac-skel") as HTMLElement;
    expect(el.style.borderRadius).toBe("50%");
    rerender(<Skeleton shape="card" />);
    el = container.querySelector(".ac-skel") as HTMLElement;
    expect(el.style.borderRadius).toBe("12px");
  });

  it("number width/height become pixel strings", () => {
    const { container } = render(<Skeleton width={120} height={24} />);
    const el = container.querySelector(".ac-skel") as HTMLElement;
    expect(el.style.width).toBe("120px");
    expect(el.style.height).toBe("24px");
  });

  it("string width/height pass through unchanged", () => {
    const { container } = render(<Skeleton width="60%" height="2rem" />);
    const el = container.querySelector(".ac-skel") as HTMLElement;
    expect(el.style.width).toBe("60%");
    expect(el.style.height).toBe("2rem");
  });

  it("circle defaults width to match height when only height given", () => {
    const { container } = render(<Skeleton shape="circle" height={32} />);
    const el = container.querySelector(".ac-skel") as HTMLElement;
    expect(el.style.width).toBe("32px");
    expect(el.style.height).toBe("32px");
  });

  it("custom className merges with ac-skel", () => {
    const { container } = render(<Skeleton className="my-extra" />);
    const el = container.querySelector(".ac-skel") as HTMLElement;
    expect(el.className).toContain("ac-skel");
    expect(el.className).toContain("my-extra");
  });
});

describe("<SkeletonText>", () => {
  it("renders the requested number of lines", () => {
    const { container } = render(<SkeletonText lines={4} />);
    expect(container.querySelectorAll(".ac-skel-shape-text").length).toBe(4);
  });

  it("makes the last line shorter to feel natural", () => {
    const { container } = render(<SkeletonText lines={3} lastLineWidth="50%" />);
    const lines = container.querySelectorAll(".ac-skel-shape-text");
    expect(lines.length).toBe(3);
    expect((lines[lines.length - 1] as HTMLElement).style.width).toBe("50%");
  });

  it("single-line skeleton uses full width (no 'last-line' trick)", () => {
    const { container } = render(<SkeletonText lines={1} />);
    const line = container.querySelector(".ac-skel-shape-text") as HTMLElement;
    expect(line.style.width).toBe("100%");
  });
});

describe("<SkeletonCard>", () => {
  it("renders an icon circle + 3 text lines (mimics overview card layout)", () => {
    const { container } = render(<SkeletonCard />);
    expect(container.querySelector(".ac-skel-shape-circle")).not.toBeNull();
    expect(container.querySelectorAll(".ac-skel-shape-text").length).toBe(3);
  });

  it("has an aria-busy wrapper so AT announces a single loading region", () => {
    const { container } = render(<SkeletonCard />);
    const wrap = container.querySelector(".ac-skel-card-block") as HTMLElement;
    expect(wrap.getAttribute("aria-busy")).toBe("true");
  });
});
