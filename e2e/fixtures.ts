import type { Page } from "@playwright/test";

/**
 * Hermetic data mocking for e2e. The dashboard fetches
 * /api/dashboard/rooms and /api/dashboard/tasks; everything else
 * (CSV, other /api/*) is stubbed empty so a run never touches a real
 * network. Call inside test.beforeEach BEFORE page.goto.
 */

export interface MockRoom {
  building: string;
  room: string;
  floor: string;
  price: string;
  status: string; // raw Thai status e.g. "ว่าง" | "มีคนอยู่"
  tenant: string;
  phone: string;
  contractEnd: string;
}

export interface MockTask {
  date: string; // dd/MM/yyyy or yyyy-MM-dd
  type: string;
  building: string;
  room: string;
  customer: string;
  phone: string;
  note: string;
  status: string;
}

export async function mockDashboard(
  page: Page,
  data: { rooms?: MockRoom[]; tasks?: MockTask[] } = {},
): Promise<void> {
  const rooms = data.rooms ?? [];
  const tasks = data.tasks ?? [];
  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

  // Single /api/** handler — order-independent. Auth routes are passed
  // through to NextAuth; dashboard slices return the fixtures; anything
  // else returns an empty rows payload so views render their empty state.
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    if (/\/api\/auth\//.test(url)) return route.fallback();
    if (/\/api\/dashboard\/rooms/.test(url)) return route.fulfill(json({ rooms }));
    if (/\/api\/dashboard\/tasks/.test(url)) return route.fulfill(json({ tasks }));
    return route.fulfill(json({ rows: [] }));
  });
  await page.route("**/*.csv", (route) =>
    route.fulfill({ status: 200, contentType: "text/csv", body: "" }),
  );
}

export function room(over: Partial<MockRoom> & Pick<MockRoom, "building" | "room">): MockRoom {
  return {
    floor: "1",
    price: "5000",
    status: "ว่าง",
    tenant: "",
    phone: "",
    contractEnd: "",
    ...over,
  };
}
