/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("next-auth/react", () => ({ useSession: vi.fn() }));
import { useSession } from "next-auth/react";
import { useEffectiveRoles } from "./useEffectiveRoles";

const mockUseSession = useSession as unknown as ReturnType<typeof vi.fn>;
const STORAGE_KEY = "aptdash:viewAsRole";

function setRoles(roles: string[]) {
  mockUseSession.mockReturnValue({ data: { user: { roles } } });
}

beforeEach(() => {
  localStorage.clear();
  mockUseSession.mockReset();
});

describe("useEffectiveRoles", () => {
  it("defaults to 'all' → effectiveRoles equals actualRoles", () => {
    setRoles(["sales", "management"]);
    const { result } = renderHook(() => useEffectiveRoles());
    expect(result.current.viewAs).toBe("all");
    expect(result.current.effectiveRoles).toEqual(["sales", "management"]);
    expect(result.current.isMultiRole).toBe(true);
  });

  it("isMultiRole is false for a single role", () => {
    setRoles(["sales"]);
    const { result } = renderHook(() => useEffectiveRoles());
    expect(result.current.isMultiRole).toBe(false);
  });

  it("setViewAs narrows effectiveRoles and persists", () => {
    setRoles(["sales", "management"]);
    const { result } = renderHook(() => useEffectiveRoles());
    act(() => result.current.setViewAs("sales"));
    expect(result.current.viewAs).toBe("sales");
    expect(result.current.effectiveRoles).toEqual(["sales"]);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("sales");
  });

  it("setViewAs('all') resets and clears persistence", () => {
    setRoles(["sales", "management"]);
    const { result } = renderHook(() => useEffectiveRoles());
    act(() => result.current.setViewAs("management"));
    act(() => result.current.setViewAs("all"));
    expect(result.current.viewAs).toBe("all");
    expect(result.current.effectiveRoles).toEqual(["sales", "management"]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("hydrates a valid stored view on mount", () => {
    localStorage.setItem(STORAGE_KEY, "management");
    setRoles(["sales", "management"]);
    const { result } = renderHook(() => useEffectiveRoles());
    expect(result.current.viewAs).toBe("management");
    expect(result.current.effectiveRoles).toEqual(["management"]);
  });

  it("drops a stale stored view the user no longer has", () => {
    localStorage.setItem(STORAGE_KEY, "engineer"); // not granted below
    setRoles(["sales", "management"]);
    const { result } = renderHook(() => useEffectiveRoles());
    expect(result.current.viewAs).toBe("all");
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("effectiveRoles falls back to actualRoles if viewAs role isn't granted", () => {
    setRoles(["sales"]);
    const { result } = renderHook(() => useEffectiveRoles());
    act(() => result.current.setViewAs("management")); // not in actualRoles
    expect(result.current.effectiveRoles).toEqual(["sales"]);
  });
});
