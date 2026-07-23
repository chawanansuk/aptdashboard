import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, act } from "@testing-library/react";
import { useViewRouting, VALID_VIEWS, type ActiveView } from "./useViewRouting";
import type { Role } from "@/auth";

// Capture toasts — the guard's "ไม่มีสิทธิ์" is part of the contract.
const toastError = vi.fn();
vi.mock("@/lib/toast", () => ({
  toast: {
    error: (...a: unknown[]) => toastError(...a),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

beforeEach(() => {
  window.localStorage.clear();
  toastError.mockClear();
});

afterEach(() => cleanup());

interface HookProps {
  role: Role | undefined;
  roles: Role[];
  effectiveRoles: Role[];
  mode: string;
  defaultLandingView: string;
}

function setup(initial: HookProps) {
  return renderHook((p: HookProps) => useViewRouting(p), { initialProps: initial });
}

const MGMT: HookProps = {
  role: "management", roles: ["management"], effectiveRoles: ["management"],
  mode: "management", defaultLandingView: "overview",
};
const SALES: HookProps = {
  role: "sales", roles: ["sales"], effectiveRoles: ["sales"],
  mode: "sales", defaultLandingView: "salespipeline",
};
const ENG: HookProps = {
  role: "engineer", roles: ["engineer"], effectiveRoles: ["engineer"],
  mode: "engineer", defaultLandingView: "engineerkanban",
};

describe("useViewRouting — basics", () => {
  it("defaults to overview and exposes a working setter", () => {
    const { result } = setup(MGMT);
    expect(result.current.activeView).toBe("overview");
    act(() => result.current.setActiveView("calendar"));
    expect(result.current.activeView).toBe("calendar");
  });

  it("VALID_VIEWS covers every ActiveView the sidebar can navigate to", () => {
    expect(VALID_VIEWS).toContain("salespipeline");
    expect(VALID_VIEWS).toContain("engineerkanban");
    expect(VALID_VIEWS).toContain("maintlog");
    expect(VALID_VIEWS.length).toBe(22);
  });
});

describe("useViewRouting — mode landing", () => {
  it("lands a sales user on salespipeline on first mount", () => {
    const { result } = setup(SALES);
    expect(result.current.activeView).toBe("salespipeline");
  });

  it("re-lands when the mode changes (View-as switch)", () => {
    const { result, rerender } = setup(MGMT);
    expect(result.current.activeView).toBe("overview");
    // Management views-as engineer → engineer landing applies. The
    // effective set becomes ["engineer"]; actual role stays management.
    rerender(ENG);
    expect(result.current.activeView).toBe("engineerkanban");
  });

  it("does NOT re-land while staying in the same mode (free navigation)", () => {
    const { result, rerender } = setup(MGMT);
    act(() => result.current.setActiveView("calendar"));
    rerender({ ...MGMT }); // same mode, new render
    expect(result.current.activeView).toBe("calendar");
  });

  it("resets the landing latch when roles empty out (sign-out → new user)", () => {
    const { result, rerender } = setup(SALES);
    expect(result.current.activeView).toBe("salespipeline");
    // Signed out — roles vanish.
    rerender({ ...SALES, role: undefined, roles: [], effectiveRoles: [] });
    // New session, same mode string as before — must land again.
    act(() => result.current.setActiveView("calendar" as ActiveView));
    rerender(SALES);
    expect(result.current.activeView).toBe("salespipeline");
  });
});

describe("useViewRouting — route guard", () => {
  it("redirects an engineer away from a sales-only view with a toast", () => {
    const { result } = setup(ENG);
    expect(result.current.activeView).toBe("engineerkanban");
    // Try to force a forbidden view (e.g. via cmdk in the real app).
    act(() => result.current.setActiveView("salespipeline"));
    // Guard kicks the user back to their landing + toasts (same mode, so
    // the mode-switch suppression must NOT apply).
    expect(result.current.activeView).toBe("engineerkanban");
    expect(toastError).toHaveBeenCalledWith("ไม่มีสิทธิ์เข้าถึงหน้านี้");
  });

  it("suppresses the toast when the redirect is caused by a mode switch", () => {
    const { result, rerender } = setup(SALES);
    expect(result.current.activeView).toBe("salespipeline");
    toastError.mockClear();
    // View-as engineer: landing effect moves the view; guard sees a
    // mode flip and stays quiet.
    rerender(ENG);
    expect(result.current.activeView).toBe("engineerkanban");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("waits for the session before guarding (no redirect on blank role)", () => {
    const { result } = setup({ ...SALES, role: undefined, roles: [], effectiveRoles: [] });
    // No roles yet — view stays put, no toast.
    expect(result.current.activeView).toBe("overview");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("management can sit on any view without redirects", () => {
    const { result } = setup(MGMT);
    for (const v of ["salespipeline", "engineerkanban", "reports"] as ActiveView[]) {
      act(() => result.current.setActiveView(v));
      expect(result.current.activeView).toBe(v);
    }
    expect(toastError).not.toHaveBeenCalled();
  });
});
