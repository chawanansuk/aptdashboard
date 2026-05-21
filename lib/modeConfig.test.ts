import { describe, expect, it } from "vitest";
import { deriveMode, getModeConfig, MODE_CONFIG } from "./modeConfig";

describe("deriveMode", () => {
  it("returns the role itself for single-role users", () => {
    expect(deriveMode(["sales"])).toBe("sales");
    expect(deriveMode(["engineer"])).toBe("engineer");
    expect(deriveMode(["management"])).toBe("management");
  });

  it("uses the primary (first) role for multi-role", () => {
    expect(deriveMode(["sales", "engineer"])).toBe("sales");
    expect(deriveMode(["engineer", "sales"])).toBe("engineer");
    expect(deriveMode(["engineer", "management"])).toBe("engineer");
  });

  it("falls back to 'management' for empty/undefined/null", () => {
    expect(deriveMode([])).toBe("management");
    expect(deriveMode(undefined)).toBe("management");
    expect(deriveMode(null)).toBe("management");
  });
});

describe("MODE_CONFIG", () => {
  it("each mode has all required fields", () => {
    for (const m of ["sales", "engineer", "management"] as const) {
      const c = MODE_CONFIG[m];
      expect(c.mode).toBe(m);
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.defaultLandingView.length).toBeGreaterThan(0);
      expect(c.defaultTaskType.length).toBeGreaterThan(0);
      expect(c.addButtonLabel.length).toBeGreaterThan(0);
      expect(["info", "equipment"]).toContain(c.roomModalDefaultTab);
      expect(c.accentHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(Array.isArray(c.sidebarGroupOrder)).toBe(true);
      expect(typeof c.greetingSubtitle).toBe("function");
    }
  });

  it("accent colors are visually distinct from each other AND status colors", () => {
    const accents = [
      MODE_CONFIG.sales.accentHex,
      MODE_CONFIG.engineer.accentHex,
      MODE_CONFIG.management.accentHex,
    ];
    // Distinct from each other
    expect(new Set(accents).size).toBe(3);
    // Distinct from status colors (status tokens — not green/yellow/red/orange)
    const statusReds = ["#DC2626", "#EF4444"];
    const statusOranges = ["#F97316"];
    const statusYellows = ["#EAB308"];
    const statusGreens = ["#16A34A", "#22C55E"];
    const forbidden = [...statusReds, ...statusOranges, ...statusYellows, ...statusGreens];
    for (const accent of accents) {
      expect(forbidden).not.toContain(accent);
    }
  });

  it("default landing view differs per mode (sales/engineer differ from management)", () => {
    expect(MODE_CONFIG.sales.defaultLandingView).not.toBe(
      MODE_CONFIG.management.defaultLandingView
    );
    expect(MODE_CONFIG.engineer.defaultLandingView).not.toBe(
      MODE_CONFIG.management.defaultLandingView
    );
  });

  it("sales lands on salespipeline (the role-specific home view)", () => {
    expect(MODE_CONFIG.sales.defaultLandingView).toBe("salespipeline");
  });

  it("engineer lands on engineerkanban (the role-specific home view)", () => {
    expect(MODE_CONFIG.engineer.defaultLandingView).toBe("engineerkanban");
  });

  it("default task type matches role-appropriate work", () => {
    expect(MODE_CONFIG.sales.defaultTaskType).toBe("ชมห้อง");
    expect(MODE_CONFIG.engineer.defaultTaskType).toBe("ซ่อม");
  });

  it("roomModalDefaultTab is mode-appropriate", () => {
    expect(MODE_CONFIG.sales.roomModalDefaultTab).toBe("info");      // customer focus
    expect(MODE_CONFIG.engineer.roomModalDefaultTab).toBe("equipment"); // asset focus
  });
});

describe("greetingSubtitle outputs", () => {
  const baseStats = {
    vacant: 0, occupied: 0, total: 0, occupancyRate: 0,
    tasksToday: 0, moveoutCount: 0, expiringContractsThisMonth: 0,
    maintenanceOverdue: 0, maintenanceDueSoon: 0, monthlyIncome: 0,
  };

  it("sales mentions vacant + moveout pipeline when present", () => {
    const out = MODE_CONFIG.sales.greetingSubtitle({
      ...baseStats, vacant: 23, moveoutCount: 3, tasksToday: 2,
    });
    expect(out).toContain("23");
    expect(out).toContain("รอย้ายออก 3");
    expect(out).toContain("2");
  });

  it("sales does NOT show expiring contracts (contracts auto-renew here)", () => {
    const out = MODE_CONFIG.sales.greetingSubtitle({
      ...baseStats, vacant: 0, expiringContractsThisMonth: 7, tasksToday: 0,
    });
    expect(out).not.toContain("สัญญาหมด");
    expect(out).not.toContain("7");
  });

  it("engineer mentions overdue maintenance + today tasks", () => {
    const out = MODE_CONFIG.engineer.greetingSubtitle({
      ...baseStats, maintenanceOverdue: 2, tasksToday: 5, maintenanceDueSoon: 1,
    });
    expect(out).toContain("2");
    expect(out).toContain("5");
    expect(out).toContain("1");
  });

  it("management always shows occupancy rate", () => {
    const out = MODE_CONFIG.management.greetingSubtitle({
      ...baseStats, occupancyRate: 0.92, monthlyIncome: 1200000,
    });
    expect(out).toContain("92%");
    expect(out).toContain("1,200,000");
  });

  it("sales returns fallback when nothing urgent", () => {
    const out = MODE_CONFIG.sales.greetingSubtitle(baseStats);
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("getModeConfig", () => {
  it("returns the right config object for a role", () => {
    expect(getModeConfig(["sales"])).toBe(MODE_CONFIG.sales);
    expect(getModeConfig(["engineer", "management"])).toBe(MODE_CONFIG.engineer);
    expect(getModeConfig(null)).toBe(MODE_CONFIG.management);
  });
});
