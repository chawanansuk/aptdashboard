import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock sonner so the test doesn't try to mount a real Toaster (jsdom +
// portal headaches). We just verify our wrapper forwards the right
// duration/options to each variant.
vi.mock("sonner", () => {
  const success = vi.fn();
  const error = vi.fn();
  const info = vi.fn();
  const dismiss = vi.fn();
  return {
    toast: Object.assign(
      Object.create(null),
      { success, error, info, dismiss },
    ),
  };
});

import { toast as sonner } from "sonner";
import { toast } from "./toast";

beforeEach(() => {
  vi.mocked(sonner.success).mockClear();
  vi.mocked(sonner.error).mockClear();
  vi.mocked(sonner.info).mockClear();
  vi.mocked(sonner.dismiss).mockClear();
});

describe("toast wrapper", () => {
  it("success uses 3000ms duration", () => {
    toast.success("saved");
    expect(sonner.success).toHaveBeenCalledWith("saved", expect.objectContaining({ duration: 3000 }));
  });

  it("error uses 5000ms duration + dismissible + closeButton", () => {
    toast.error("failed");
    const opts = vi.mocked(sonner.error).mock.calls[0][1] as Record<string, unknown>;
    expect(opts.duration).toBe(5000);
    expect(opts.dismissible).toBe(true);
    expect(opts.closeButton).toBe(true);
  });

  it("info uses 4000ms duration", () => {
    toast.info("heads up");
    expect(sonner.info).toHaveBeenCalledWith("heads up", expect.objectContaining({ duration: 4000 }));
  });

  it("forwards an optional description", () => {
    toast.success("saved", { description: "row #42" });
    expect(sonner.success).toHaveBeenCalledWith(
      "saved",
      expect.objectContaining({ description: "row #42" }),
    );
  });

  it("dismiss(id) forwards to sonner.dismiss", () => {
    toast.dismiss("abc");
    expect(sonner.dismiss).toHaveBeenCalledWith("abc");
  });
});
