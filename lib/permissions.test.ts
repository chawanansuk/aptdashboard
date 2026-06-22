import { describe, expect, it } from "vitest";
import {
  canAccess, canPerform, getDefaultRoute,
  isSales, isEngineer, isManagement,
  canDeleteTask, canEditTenant, canViewFinancials,
  canAddSalesTask, canAddEngTask, canAddCleanTask, canViewTaskCustomer,
} from "./permissions";

describe("permissions: canViewTaskCustomer", () => {
  it("sales and management can see task customer contact", () => {
    expect(canViewTaskCustomer("sales")).toBe(true);
    expect(canViewTaskCustomer("management")).toBe(true);
    expect(canViewTaskCustomer(["sales", "engineer"])).toBe(true); // sales wins
  });
  it("engineer-only cannot", () => {
    expect(canViewTaskCustomer("engineer")).toBe(false);
    expect(canViewTaskCustomer(["engineer"])).toBe(false);
  });
  it("empty / nullish roles cannot", () => {
    expect(canViewTaskCustomer([])).toBe(false);
    expect(canViewTaskCustomer(null)).toBe(false);
    expect(canViewTaskCustomer(undefined)).toBe(false);
  });
});

describe("permissions: canAccess", () => {
  it("management can access every route", () => {
    const routes = [
      "overview", "today", "calendar",
      "ready", "pending", "occupied", "moveout", "tenants",
      "qc", "repair", "inactive", "maintenance", "facilities",
      "income",
    ] as const;
    for (const r of routes) {
      expect(canAccess(["management"], r)).toBe(true);
    }
  });

  it("sales sees rooms + calendar but NOT tenants (PII) / engineer routes / income", () => {
    expect(canAccess(["sales"], "ready")).toBe(true);
    expect(canAccess(["sales"], "moveout")).toBe(true);
    // tenants route restricted to management only (PII protection — 2026-05)
    expect(canAccess(["sales"], "tenants")).toBe(false);
    expect(canAccess(["sales"], "calendar")).toBe(true);
    // Engineer-side rooms opened up to sales — engineers don't use the
    // app in practice, so sales has to progress qc/repair/inactive too.
    expect(canAccess(["sales"], "qc")).toBe(true);
    expect(canAccess(["sales"], "repair")).toBe(true);
    expect(canAccess(["sales"], "inactive")).toBe(true);
    // Asset/inventory routes stay engineer-side (sales doesn't manage stock).
    expect(canAccess(["sales"], "maintenance")).toBe(false);
    expect(canAccess(["sales"], "parts")).toBe(false);
    expect(canAccess(["sales"], "engineerkanban")).toBe(false);
    expect(canAccess(["sales"], "income")).toBe(false);
  });

  it("engineer sees jobs + assets but NOT tenants or income", () => {
    expect(canAccess(["engineer"], "qc")).toBe(true);
    expect(canAccess(["engineer"], "repair")).toBe(true);
    expect(canAccess(["engineer"], "maintenance")).toBe(true);
    expect(canAccess(["engineer"], "facilities")).toBe(true);
    expect(canAccess(["engineer"], "tenants")).toBe(false);
    expect(canAccess(["engineer"], "ready")).toBe(false);
    expect(canAccess(["engineer"], "income")).toBe(false);
  });

  it("multi-role sales+engineer sees union (still NO tenants — PII / no income)", () => {
    const roles = ["sales", "engineer"] as const;
    expect(canAccess([...roles], "tenants")).toBe(false);    // management-only
    expect(canAccess([...roles], "maintenance")).toBe(true); // engineer side
    expect(canAccess([...roles], "income")).toBe(false);     // mgmt only
  });

  it("management can access tenants (the only role that can)", () => {
    expect(canAccess(["management"], "tenants")).toBe(true);
    expect(canAccess(["sales", "management"], "tenants")).toBe(true);
  });

  it("undefined / empty roles → only nothing", () => {
    expect(canAccess(undefined, "overview")).toBe(false);
    expect(canAccess(null, "overview")).toBe(false);
    expect(canAccess([], "overview")).toBe(false);
  });

  it("accepts legacy single-Role input (backward compat)", () => {
    expect(canAccess("sales", "ready")).toBe(true);
    expect(canAccess("management", "income")).toBe(true);
    expect(canAccess("engineer", "tenants")).toBe(false);
  });
});

describe("permissions: canPerform", () => {
  it("only management can delete tasks", () => {
    expect(canPerform(["management"], "task.delete")).toBe(true);
    expect(canPerform(["sales"], "task.delete")).toBe(false);
    expect(canPerform(["engineer"], "task.delete")).toBe(false);
    expect(canPerform(["sales", "engineer"], "task.delete")).toBe(false);
  });

  it("sales+engineer can add BOTH sales-side and engineer-side tasks", () => {
    const roles = ["sales", "engineer"] as const;
    expect(canPerform([...roles], "task.add.sales")).toBe(true);
    expect(canPerform([...roles], "task.add.eng")).toBe(true);
  });

  it("sales alone cannot add engineer tasks (and vice versa)", () => {
    expect(canPerform(["sales"], "task.add.eng")).toBe(false);
    expect(canPerform(["engineer"], "task.add.sales")).toBe(false);
  });

  it("all staff roles can add cleaning tasks (sales schedule the post-moveout clean)", () => {
    expect(canPerform(["sales"], "task.add.clean")).toBe(true);
    expect(canPerform(["engineer"], "task.add.clean")).toBe(true);
    expect(canPerform(["management"], "task.add.clean")).toBe(true);
  });

  it("only management can view financials or read/edit tenants", () => {
    expect(canPerform(["management"], "finance.view")).toBe(true);
    expect(canPerform(["management"], "tenant.view")).toBe(true);
    expect(canPerform(["management"], "tenant.edit")).toBe(true);
    expect(canPerform(["sales", "engineer"], "finance.view")).toBe(false);
    // PII protection: even read access is mgmt-only (2026-05)
    expect(canPerform(["sales"], "tenant.view")).toBe(false);
    expect(canPerform(["sales"], "tenant.edit")).toBe(false);
    expect(canPerform(["engineer"], "tenant.view")).toBe(false);
  });

  it("equipment + facility ops are engineer or management", () => {
    expect(canPerform(["engineer"], "equipment.add")).toBe(true);
    expect(canPerform(["engineer"], "facility.add")).toBe(true);
    expect(canPerform(["management"], "equipment.edit")).toBe(true);
    expect(canPerform(["sales"], "equipment.add")).toBe(false);
    expect(canPerform(["sales"], "facility.edit")).toBe(false);
  });

  it("empty / null roles cannot perform anything", () => {
    expect(canPerform(null, "task.add")).toBe(false);
    expect(canPerform([], "task.add")).toBe(false);
    expect(canPerform(undefined, "finance.view")).toBe(false);
  });
});

describe("permissions: legacy helpers delegate to canPerform", () => {
  it("canDeleteTask matches canPerform('task.delete')", () => {
    const cases = [
      ["sales"], ["engineer"], ["management"],
      ["sales", "engineer"], [], null, undefined,
    ] as const;
    for (const r of cases) {
      expect(canDeleteTask(r as never)).toBe(canPerform(r as never, "task.delete"));
    }
  });

  it("canEditTenant + canViewFinancials match canPerform", () => {
    expect(canEditTenant(["sales"])).toBe(false);
    expect(canEditTenant(["management"])).toBe(true);
    expect(canViewFinancials(["sales", "engineer"])).toBe(false);
    expect(canViewFinancials(["management"])).toBe(true);
  });

  it("canAddSalesTask + canAddEngTask delegate correctly", () => {
    expect(canAddSalesTask(["sales"])).toBe(true);
    expect(canAddSalesTask(["engineer"])).toBe(false);
    expect(canAddSalesTask(["sales", "engineer"])).toBe(true);
    expect(canAddEngTask(["engineer"])).toBe(true);
    expect(canAddEngTask(["sales"])).toBe(false);
    expect(canAddEngTask(["sales", "engineer"])).toBe(true);
  });

  it("canAddCleanTask allows sales (turnover clean after moveout)", () => {
    expect(canAddCleanTask(["sales"])).toBe(true);
    expect(canAddCleanTask(["engineer"])).toBe(true);
    expect(canAddCleanTask(["management"])).toBe(true);
    expect(canAddCleanTask(null)).toBe(false);
  });
});

describe("permissions: role identity helpers", () => {
  it("isSales / isEngineer / isManagement check role membership", () => {
    expect(isSales(["sales"])).toBe(true);
    expect(isSales(["sales", "engineer"])).toBe(true);
    expect(isSales(["engineer"])).toBe(false);
    expect(isEngineer(["engineer", "management"])).toBe(true);
    expect(isManagement(["management"])).toBe(true);
    expect(isManagement(["sales", "engineer"])).toBe(false);
  });
});

describe("permissions: getDefaultRoute", () => {
  it("returns overview for any role we have today", () => {
    expect(getDefaultRoute(["sales"])).toBe("overview");
    expect(getDefaultRoute(["engineer"])).toBe("overview");
    expect(getDefaultRoute(["management"])).toBe("overview");
    expect(getDefaultRoute(["sales", "engineer"])).toBe("overview");
  });

  it("returns a routable view even for empty roles (no crash)", () => {
    // No role can access overview → falls through to today → calendar
    // But all of overview/today/calendar require some role, so for [] it
    // ultimately returns "calendar" as a safe fallback even though the
    // user can't actually render it. The route guard then handles it.
    expect(["overview", "today", "calendar"]).toContain(getDefaultRoute([]));
  });
});
