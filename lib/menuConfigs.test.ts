import { describe, expect, it, vi } from "vitest";
import { buildQuickActions, buildPaletteCommands } from "./menuConfigs";

const noopHandlers = {
  onQuickAddLead: vi.fn(),
  onAddTaskWithType: vi.fn(),
};

function visibleIds(roles: Parameters<typeof buildQuickActions>[0]): string[] {
  return buildQuickActions(roles, noopHandlers)
    .filter((a) => a.visible)
    .map((a) => a.id);
}

describe("buildQuickActions — per-role visibility", () => {
  it("sales sees lead + sales task types + clean (turnover scheduling), no repair", () => {
    // task.add.clean intentionally includes sales — they schedule the
    // post-moveout clean as part of re-listing (see lib/permissions.ts).
    expect(visibleIds(["sales"])).toEqual(["lead", "viewing", "movein", "moveout", "clean"]);
  });

  it("engineer sees clean + repair only", () => {
    expect(visibleIds(["engineer"])).toEqual(["clean", "repair"]);
  });

  it("management sees everything", () => {
    expect(visibleIds(["management"])).toEqual([
      "lead", "viewing", "movein", "moveout", "clean", "repair",
    ]);
  });

  it("wires the handlers (lead → onQuickAddLead, repair → type ซ่อม)", () => {
    const onQuickAddLead = vi.fn();
    const onAddTaskWithType = vi.fn();
    const actions = buildQuickActions(["management"], { onQuickAddLead, onAddTaskWithType });
    actions.find((a) => a.id === "lead")!.onSelect();
    expect(onQuickAddLead).toHaveBeenCalledTimes(1);
    actions.find((a) => a.id === "repair")!.onSelect();
    expect(onAddTaskWithType).toHaveBeenCalledWith("ซ่อม");
  });
});

describe("buildPaletteCommands", () => {
  const handlers = {
    onAddTask: vi.fn(),
    onRefresh: vi.fn(),
    onToggleTheme: vi.fn(),
    onOpenSummary: vi.fn(),
  };

  it("returns the four static commands with addTask permission-gated", () => {
    const cmds = buildPaletteCommands(false, handlers);
    expect(cmds.map((c) => c.id)).toEqual(["addTask", "refresh", "toggleTheme", "openSummary"]);
    expect(cmds[0].requires).toEqual({ action: "task.add" });
  });

  it("theme label flips with isDark", () => {
    expect(buildPaletteCommands(true, handlers).find((c) => c.id === "toggleTheme")!.label)
      .toContain("สว่าง");
    expect(buildPaletteCommands(false, handlers).find((c) => c.id === "toggleTheme")!.label)
      .toContain("มืด");
  });

  it("run() dispatches to the right handler", () => {
    const cmds = buildPaletteCommands(false, handlers);
    cmds.find((c) => c.id === "refresh")!.run();
    expect(handlers.onRefresh).toHaveBeenCalledTimes(1);
    cmds.find((c) => c.id === "openSummary")!.run();
    expect(handlers.onOpenSummary).toHaveBeenCalledTimes(1);
  });
});
