import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import { storageStatePath } from "./paths";
import { mockDashboard, type MockRoom, type MockTask } from "./fixtures";

/** TEMPORARY QA sweep — delete after the run. */

const OUT = "/tmp/claude-0/-home-user-aptdashboard/57051fd4-72e5-5151-bc2d-bf8eeb93d9d9/scratchpad/qa";
fs.mkdirSync(OUT, { recursive: true });

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function d(offsetDays: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + offsetDays);
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
}
function iso(offsetDays: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + offsetDays);
  return dt.toISOString().slice(0, 10);
}
function mk(building: string, floor: string, num: string, status: string, over: Partial<MockRoom> = {}): MockRoom {
  return { building, room: num, floor, price: "4500", status, tenant: "", phone: "", contractEnd: "", ...over };
}

const ROOMS: MockRoom[] = [
  mk("มั่งมี", "1", "101", "ว่าง"),
  mk("มั่งมี", "1", "102", "มีคนอยู่", { tenant: "คุณสมชาย ใจดี", phone: "0812345678", contractEnd: d(90) }),
  mk("มั่งมี", "1", "103", "มีคนอยู่", { tenant: "คุณวันดี มีสุข", phone: "0898765432", contractEnd: d(12) }),
  mk("มั่งมี", "1", "104", "รอสัญญา", { tenant: "คุณจองไว้ รอเซ็น", phone: "0801112222" }),
  mk("มั่งมี", "2", "201", "แจ้งย้ายออก", { tenant: "คุณกำลังย้าย ออกแล้ว", phone: "0833334444" }),
  mk("มั่งมี", "2", "202", "ซ่อม"),
  mk("มั่งมี", "2", "203", "ปรับปรุง"),
  mk("มั่งมี", "2", "204", "ทำความสะอาด"),
  mk("มั่งมี", "2", "205", "ไม่ได้ใช้งาน"),
  mk("กลางเมือง", "1", "101", "มีคนอยู่", { tenant: "คุณเมือง กลางใจ", phone: "0866667777", contractEnd: d(30) }),
  mk("กลางเมือง", "1", "102", "ว่าง"),
  mk("กลางเมือง", "1", "103", "รอสัญญา", { tenant: "คุณใหม่ เพิ่งจอง" }),
  mk("กลางเมือง", "2", "201", "มีคนอยู่", { tenant: "คุณสองศูนย์ หนึ่ง", contractEnd: d(5) }),
  mk("กลางเมือง", "2", "202", "แจ้งย้ายออก", { tenant: "คุณลาก่อน บ้านเก่า" }),
];

const TASKS: MockTask[] = [
  { date: d(0), type: "ซ่อม", building: "มั่งมี", room: "202", customer: "", phone: "", note: "แอร์ไม่เย็น เติมน้ำยา", status: "กำลังทำ" },
  { date: d(0), type: "ทำสะอาด", building: "มั่งมี", room: "204", customer: "", phone: "", note: "ทำสะอาดหลังย้ายออก", status: "" },
  { date: d(0), type: "ชมห้อง", building: "กลางเมือง", room: "102", customer: "คุณผู้สนใจ เช่าด่วน", phone: "0877778888", note: "นัดบ่ายสอง", status: "" },
  { date: d(-3), type: "ซ่อม", building: "กลางเมือง", room: "201", customer: "", phone: "", note: "ก๊อกอ่างล้างหน้ารั่ว", status: "" },
  { date: d(-1), type: "อื่นๆ", building: "มั่งมี", room: "201", customer: "", phone: "", note: "ตรวจห้องก่อนคืนมัดจำ", status: "" },
  { date: d(2), type: "ย้ายเข้า", building: "มั่งมี", room: "104", customer: "คุณจองไว้ รอเซ็น", phone: "0801112222", note: "นัดเซ็นสัญญา", status: "" },
  { date: d(1), type: "ย้ายออก", building: "กลางเมือง", room: "202", customer: "คุณลาก่อน บ้านเก่า", phone: "", note: "", status: "" },
  { date: d(5), type: "ชมห้อง", building: "มั่งมี", room: "101", customer: "คุณนัดหน้า มาแน่", phone: "0844445555", note: "", status: "" },
  { date: d(-2), type: "ทำสะอาด", building: "มั่งมี", room: "201", customer: "", phone: "", note: "ทำสะอาดหลังย้ายออก", status: "เสร็จ" },
  { date: d(-7), type: "ซ่อม", building: "มั่งมี", room: "102", customer: "", phone: "", note: "เปลี่ยนหลอดไฟห้องน้ำ", status: "เสร็จ" },
  { date: d(-40), type: "ซ่อม", building: "มั่งมี", room: "102", customer: "", phone: "", note: "ซ่อมฝักบัว", status: "เสร็จ" },
];

const PARTS = [
  { id: "p1", name: "หลอดไฟ LED 9W", category: "ไฟฟ้า", stock: 2, threshold: 5, unit: "หลอด", price: 89, note: "", creator: "e2e", createdAt: "2026-07-01 09:00", updatedAt: "2026-08-20 09:00" },
  { id: "p2", name: "ก๊อกน้ำอ่างล้างหน้า", category: "ประปา", stock: 12, threshold: 3, unit: "ชิ้น", price: 350, note: "รุ่นสแตนเลส", creator: "e2e", createdAt: "2026-07-01 09:00", updatedAt: "2026-08-20 09:00" },
  { id: "p3", name: "ทิชชู่ม้วนใหญ่", category: "ของสิ้นเปลือง", stock: 4, threshold: 6, unit: "แพ็ค", price: 189, note: "", creator: "e2e", createdAt: "2026-07-01 09:00", updatedAt: "2026-08-20 09:00" },
];
const REQUISITIONS = [
  { id: "r1", partId: "p1", partName: "หลอดไฟ LED 9W", quantity: 2, building: "มั่งมี", room: "102", taskKey: `${iso(-7)}|มั่งมี|102|ซ่อม`, user: "e2e-eng@test.local", note: "", createdAt: `${iso(-7)} 10:00` },
  { id: "r2", partId: "p2", partName: "ก๊อกน้ำอ่างล้างหน้า", quantity: 1, building: "กลางเมือง", room: "201", taskKey: `${iso(-3)}|กลางเมือง|201|ซ่อม`, user: "e2e-eng@test.local", note: "", createdAt: `${iso(-3)} 10:00` },
];
const PURCHASES = [
  { id: "b1", partId: "p3", partName: "ทิชชู่ม้วนใหญ่", quantity: 6, totalPrice: 1134, unitPrice: 189, store: "แมคโคร", creator: "e2e", date: iso(-5), createdAt: `${iso(-5)} 10:00` },
  { id: "b2", partId: "p1", partName: "หลอดไฟ LED 9W", quantity: 10, totalPrice: 890, unitPrice: 89, store: "โฮมโปร", creator: "e2e", date: iso(-20), createdAt: `${iso(-20)} 10:00` },
];
const FACILITIES = [
  { id: "f1", building: "มั่งมี", type: "ปั๊มน้ำ", name: "ปั๊มหน้าตึก", installDate: "2025-01-10", lastService: "2026-03-20", status: "ใช้งานได้", note: "", creator: "a@b.c", createdAt: "", intervalDays: 120 },
  { id: "f2", building: "กลางเมือง", type: "ลิฟต์", name: "ลิฟต์ตัวหลัก", installDate: "2024-02-14", lastService: iso(-10), status: "ใช้งานได้", note: "", creator: "a@b.c", createdAt: "", intervalDays: 30 },
];
const EQUIPMENT = [
  { id: "e1", building: "มั่งมี", room: "102", type: "แอร์", brand: "Daikin", installDate: "2024-05-01", lastService: "2025-12-20", status: "ปกติ", note: "", creator: "a@b.c", createdAt: "", intervalDays: 180 },
  { id: "e2", building: "มั่งมี", room: "102", type: "เครื่องทำน้ำอุ่น", brand: "Stiebel", installDate: "2024-05-01", lastService: iso(-20), status: "ปกติ", note: "", creator: "a@b.c", createdAt: "", intervalDays: 365 },
  { id: "e3", building: "กลางเมือง", room: "201", type: "ตู้เย็น", brand: "Toshiba", installDate: "2023-01-01", lastService: "", status: "เสีย", note: "รอช่าง", creator: "a@b.c", createdAt: "", intervalDays: 0 },
];
const VEHICLES = [
  { id: "v1", building: "มั่งมี", room: "102", plate: "กข 1234", model: "Honda Click 125", color: "ดำ", note: "", creator: "e2e", createdAt: "2026-07-01 09:00", updatedAt: "2026-07-01 09:00" },
  { id: "v2", building: "กลางเมือง", room: "201", plate: "1กก 5678", model: "Toyota Vios", color: "ขาว", note: "จอดหน้าตึก", creator: "e2e", createdAt: "2026-07-01 09:00", updatedAt: "2026-07-01 09:00" },
];
const LEADS = [
  { id: "l1", name: "คุณเอ", phone: "0811111111", source: "Facebook", interest: "มั่งมี 4,500", stage: "ใหม่", note: "", creator: "e2e", createdAt: `${iso(-1)} 10:00`, updatedAt: `${iso(-1)} 10:00` },
  { id: "l2", name: "คุณบี", phone: "0822222222", source: "LINE", interest: "กลางเมือง", stage: "นัดดูแล้ว", note: "นัดพรุ่งนี้", creator: "e2e", createdAt: `${iso(-3)} 10:00`, updatedAt: `${iso(-2)} 10:00` },
  { id: "l3", name: "คุณซี", phone: "", source: "Walk-in", interest: "", stage: "ปิดดีล", note: "", creator: "e2e", createdAt: `${iso(-10)} 10:00`, updatedAt: `${iso(-5)} 10:00` },
];
const RECURRING = [
  { id: "rc1", name: "ล้างแอร์ส่วนกลาง", type: "ทำสะอาด", building: "มั่งมี", room: "", intervalDays: 90, lastRunDate: iso(-60), nextRunDate: iso(30), active: true, note: "", creator: "e2e", createdAt: "2026-01-01 09:00" },
  { id: "rc2", name: "เช็คปั๊มน้ำ", type: "ซ่อม", building: "กลางเมือง", room: "", intervalDays: 30, lastRunDate: iso(-35), nextRunDate: iso(-5), active: true, note: "", creator: "e2e", createdAt: "2026-01-01 09:00" },
];
const PHOTOS = [
  { id: "ph1", building: "มั่งมี", room: "102", fileId: "f1", note: "รอยขีดผนัง", creator: "a@b.c", createdAt: "2026-07-01 09:00" },
  { id: "ph2", building: "มั่งมี", room: "201", fileId: "f2", note: "", creator: "a@b.c", createdAt: "2026-07-02 09:00" },
];
const PETS = [
  { id: "c1", building: "มั่งมี", room: "102", fileId: "f3", note: "ส้มจุด", creator: "a@b.c", createdAt: "2026-07-01 09:00", category: "สัตว์เลี้ยง" },
  { id: "c2", building: "กลางเมือง", room: "201", fileId: "f4", note: "ดำทั้งตัว", creator: "a@b.c", createdAt: "2026-07-02 09:00", category: "สัตว์เลี้ยง" },
];
const TIMELOGS = [
  { id: "t1", taskKey: `${iso(-7)}|มั่งมี|102|ซ่อม`, startedAt: `${iso(-7)} 10:00:00`, endedAt: `${iso(-7)} 10:45:00`, durationMin: 45, user: "e2e-eng@test.local", note: "", createdAt: `${iso(-7)} 10:00:00` },
];
const AUDIT = [
  { id: "a1", timestamp: `${iso(-1)} 10:00:00`, user: "e2e-mgmt@test.local", action: "updateRoomStatus", entity: "room", entityId: "มั่งมี|101", details: "ว่าง → รอสัญญา" },
];
const ROOM_TASKS = [
  { id: "x1", date: d(-7), type: "ซ่อม", building: "มั่งมี", room: "102", customer: "", phone: "", note: "เปลี่ยนหลอดไฟห้องน้ำ", status: "เสร็จ", cost: 150 },
  { id: "x2", date: d(-40), type: "ซ่อม", building: "มั่งมี", room: "102", customer: "", phone: "", note: "ซ่อมฝักบัว", status: "เสร็จ", cost: 0 },
];

type Mode = "rich" | "empty";

async function mockApis(page: Page, mode: Mode): Promise<void> {
  const rich = mode === "rich";
  const j = (b: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
  const rows = (arr: unknown[]) => j({ ok: true, rows: rich ? arr : [] });
  const getOr = (arr: unknown[]) => (r: Parameters<Parameters<Page["route"]>[1]>[0]) =>
    r.request().method() === "GET" ? r.fulfill(rows(arr)) : r.fulfill(j({ ok: true }));

  await mockDashboard(page, { rooms: rich ? ROOMS : [], tasks: rich ? TASKS : [] });
  // Registered AFTER mockDashboard → take precedence.
  await page.route("**/api/parts**", getOr(PARTS));
  await page.route("**/api/part-requisitions**", getOr(REQUISITIONS));
  await page.route("**/api/part-purchases**", getOr(PURCHASES));
  await page.route("**/api/facilities**", getOr(FACILITIES));
  await page.route("**/api/maintenance-plan**", getOr(EQUIPMENT));
  await page.route("**/api/room-equipment**", getOr(EQUIPMENT));
  await page.route("**/api/vehicles**", getOr(VEHICLES));
  await page.route("**/api/leads**", getOr(LEADS));
  await page.route("**/api/recurring**", getOr(RECURRING));
  await page.route("**/api/audit**", getOr(AUDIT));
  await page.route("**/api/room-photos**", (r) => {
    if (r.request().method() !== "GET") return r.fulfill(j({ ok: true, id: "n1", fileId: "fx", createdAt: "2026-07-25 10:00" }));
    const pets = r.request().url().includes("scope=pets");
    return r.fulfill(rows(pets ? PETS : PHOTOS));
  });
  await page.route("**/api/room-tasks**", (r) => r.fulfill(j({ ok: true, rows: rich ? ROOM_TASKS : [] })));
  await page.route("**/api/time-logs**", (r) => {
    if (r.request().method() !== "GET") return r.fulfill(j({ ok: true }));
    if (r.request().url().includes("active=1")) return r.fulfill(j({ active: null }));
    return r.fulfill(j({ rows: rich ? TIMELOGS : [] }));
  });
  await page.route("**/api/sheet/health**", (r) => r.fulfill(j({ ok: true, status: "ok" })));
  await page.route("**/api/version**", (r) => r.fulfill(j({ version: "e2e" })));
  await page.route("**://drive.google.com/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG }));
  await page.route("**://lh3.googleusercontent.com/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG }));
}

interface Finding {
  role: string; mode: Mode; step: string;
  errorBoundary?: number; mainTextLen?: number; errText?: boolean;
  overflow?: { scrollWidth: number; innerWidth: number };
  note?: string; screenshot?: string;
}
interface ErrRec { role: string; mode: Mode; step: string; kind: string; text: string }

class Sweep {
  findings: Finding[] = [];
  errors: ErrRec[] = [];
  step = "boot";
  constructor(public page: Page, public role: string, public mode: Mode) {
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") {
        this.errors.push({ role, mode, step: this.step, kind: `console.${m.type()}`, text: m.text().slice(0, 1200) });
      }
    });
    page.on("pageerror", (e) => this.errors.push({ role, mode, step: this.step, kind: "pageerror", text: String(e.message).slice(0, 1200) }));
    page.on("dialog", (dlg) => void dlg.dismiss().catch(() => {}));
  }
  file(name: string): string {
    return `${OUT}/${this.role}${this.mode === "empty" ? "-empty" : ""}-${name.replace(/[\/\s:]+/g, "_")}.png`;
  }
  async shot(name: string): Promise<string> {
    const p = this.file(name);
    await this.page.screenshot({ path: p, fullPage: false }).catch(() => {});
    return p;
  }
  async check(step: string, extra: Partial<Finding> = {}): Promise<Finding> {
    const page = this.page;
    const eb = await page.locator(".ac-error-boundary").count();
    const main = await page.locator("main#main-content").innerText().catch(() => "");
    const body = await page.locator("body").innerText().catch(() => "");
    const errText = /เกิดข้อผิดพลาด|Something went wrong|ErrorBoundary/.test(body);
    const shot = await this.shot(step);
    const f: Finding = { role: this.role, mode: this.mode, step, errorBoundary: eb, mainTextLen: main.trim().length, errText, screenshot: shot, ...extra };
    this.findings.push(f);
    expect.soft(eb, `${step}: error boundary rendered`).toBe(0);
    expect.soft(errText, `${step}: error copy in DOM`).toBe(false);
    expect.soft(main.trim().length, `${step}: main content blank`).toBeGreaterThan(0);
    return f;
  }
  note(step: string, note: string) { this.findings.push({ role: this.role, mode: this.mode, step, note }); }
  save() {
    fs.writeFileSync(`${OUT}/findings-${this.role}-${this.mode}.json`, JSON.stringify({ findings: this.findings, errors: this.errors }, null, 2));
  }
}

async function boot(page: Page, mode: Mode, opts: { dark?: boolean } = {}): Promise<void> {
  await page.addInitScript((dark) => localStorage.setItem("theme", dark ? "dark" : "light"), !!opts.dark);
  await mockApis(page, mode);
  await page.goto("/", { timeout: 120_000 });
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole("banner")).toBeVisible({ timeout: 30_000 });
  await page.addStyleTag({ content: "nextjs-portal{display:none} .ac-health-banner{display:none} .ac-rc,.ac-kanban-card,.ac-task{content-visibility:visible!important}" });
  await page.waitForTimeout(1500);
}

async function sidebarLabels(page: Page): Promise<string[]> {
  return page.locator(".ac-side-item[aria-label]").evaluateAll((els) =>
    els.map((e) => e.getAttribute("aria-label") || "").filter((l) => l && !l.startsWith("เปิดห้อง")));
}

async function goView(page: Page, label: string): Promise<boolean> {
  const btn = page.locator(`button[aria-label="${label}"]`).first();
  if ((await btn.count()) === 0) return false;
  await btn.evaluate((el) => (el as HTMLElement).click());
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(900);
  return true;
}

async function escape(page: Page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

async function walkViews(s: Sweep): Promise<string[]> {
  const labels = await sidebarLabels(s.page);
  s.note("sidebar", `labels: ${labels.join(" | ")}`);
  for (const label of labels) {
    s.step = `view:${label}`;
    await goView(s.page, label);
    await s.check(`view-${label}`);
    // Also check any secondary tabs within hub / maintenance
    if (label === "ซ่อมบำรุง") {
      for (const tab of ["🏢 ส่วนกลาง", "❄️ อุปกรณ์ในห้อง", "🔁 งานประจำ", "🔔 ถึงรอบ"]) {
        const t = s.page.getByRole("tab", { name: tab });
        if ((await t.count()) > 0) {
          s.step = `view:ซ่อมบำรุง/${tab}`;
          await t.first().evaluate((el) => (el as HTMLElement).click());
          await s.page.waitForTimeout(700);
          await s.check(`view-ซ่อมบำรุง-${tab.replace(/^\S+\s/, "")}`);
        }
      }
    }
  }
  return labels;
}

async function interactions(s: Sweep, labels: string[]) {
  const page = s.page;
  const has = (l: string) => labels.includes(l);

  // --- room modal + tabs ---
  s.step = "room-modal";
  await goView(page, "ภาพรวม");
  const card = page.locator(".ac-rc").filter({ hasText: "102" }).first();
  if ((await card.count()) > 0) {
    await card.click();
    const dlg = page.locator('[role="dialog"].ac-modal');
    await expect.soft(dlg, "room modal opens").toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(800);
    await s.check("room-modal-info");
    for (const tab of ["อุปกรณ์", "ยานพาหนะ", "บันทึกซ่อม"]) {
      const t = dlg.getByRole("tab", { name: new RegExp(tab) });
      if ((await t.count()) === 0) { s.note(`room-modal-tab-${tab}`, "tab absent"); continue; }
      s.step = `room-modal:${tab}`;
      await t.first().click();
      await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(700);
      await s.check(`room-modal-${tab}`);
    }
    await escape(page);
    await expect.soft(dlg, "room modal closes on Escape").toBeHidden({ timeout: 3000 }).catch(() => {});
    // Another room: moveout journey panel
    s.step = "room-modal:moveout";
    const mo = page.locator(".ac-rc").filter({ hasText: "201" }).first();
    if ((await mo.count()) > 0) {
      await mo.click();
      await page.waitForTimeout(900);
      await s.check("room-modal-moveout-201");
      await escape(page);
    }
    // Repair room
    s.step = "room-modal:repair";
    const rp = page.locator(".ac-rc").filter({ hasText: "202" }).first();
    if ((await rp.count()) > 0) {
      await rp.click();
      await page.waitForTimeout(900);
      await s.check("room-modal-repair-202");
      await escape(page);
    }
  } else {
    s.note("room-modal", "no room card present (expected in empty mode)");
  }
  await escape(page);

  // --- quick add / add-task modal ---
  s.step = "add-task";
  const quick = page.locator('button[aria-label="เพิ่มรายการใหม่"]').first();
  if ((await quick.count()) > 0 && await quick.isVisible()) {
    await quick.click();
    await page.waitForTimeout(400);
    await s.shot("quick-menu");
    const item = page.getByRole("menuitem").first().or(page.locator(".ac-quick-menu button").first());
    if ((await item.count()) > 0) {
      await item.first().click();
      await page.waitForTimeout(700);
      await s.check("add-task-modal");
      await escape(page);
    } else s.note("add-task", "quick menu has no items");
  } else {
    // direct add button
    const add = page.locator(".ac-nav button, header button").filter({ hasText: /เพิ่มงาน|เพิ่ม|นัดลูกค้า/ }).first();
    if ((await add.count()) > 0 && await add.isVisible()) {
      await add.click();
      await page.waitForTimeout(700);
      await s.check("add-task-modal");
      await escape(page);
    } else s.note("add-task", "no add button found");
  }
  await escape(page);

  // --- parts add ---
  if (has("อะไหล่")) {
    s.step = "parts-add";
    await goView(page, "อะไหล่");
    const b = page.locator("main .ac-btn-primary").filter({ hasText: "เพิ่มอะไหล่" }).first();
    if ((await b.count()) > 0) {
      await b.click(); await page.waitForTimeout(600);
      await s.check("parts-add-modal");
      await escape(page);
    } else s.note("parts-add", "no เพิ่มอะไหล่ button");
    // requisition / history buttons on first row
    const row = page.locator(".ac-parts button").filter({ hasText: /เบิก/ }).first();
    if ((await row.count()) > 0) {
      s.step = "parts-requisition";
      await row.click(); await page.waitForTimeout(600);
      await s.check("parts-requisition-modal");
      await escape(page);
    }
    const hist = page.locator(".ac-parts button").filter({ hasText: /ประวัติ/ }).first();
    if ((await hist.count()) > 0) {
      s.step = "parts-history";
      await hist.click(); await page.waitForTimeout(800);
      await s.check("parts-history-modal");
      await escape(page);
    }
    const buy = page.locator(".ac-parts button").filter({ hasText: /^เติม$|เติม/ }).first();
    if ((await buy.count()) > 0) {
      s.step = "parts-purchase";
      await buy.click(); await page.waitForTimeout(600);
      await s.check("parts-purchase-modal");
      await escape(page);
    }
  }

  // --- vehicles add ---
  if (has("ยานพาหนะ")) {
    s.step = "vehicles-add";
    await goView(page, "ยานพาหนะ");
    const b = page.locator("main .ac-btn-primary").filter({ hasText: /^\s*เพิ่ม/ }).first();
    if ((await b.count()) > 0) {
      await b.click(); await page.waitForTimeout(600);
      await s.check("vehicles-add-modal");
      await escape(page);
    } else s.note("vehicles-add", "no เพิ่ม button");
  }

  // --- facilities add (inside hub) ---
  if (has("ซ่อมบำรุง")) {
    s.step = "facilities-add";
    await goView(page, "ซ่อมบำรุง");
    const t = page.getByRole("tab", { name: "🏢 ส่วนกลาง" });
    if ((await t.count()) > 0) {
      await t.first().evaluate((el) => (el as HTMLElement).click());
      await page.waitForTimeout(600);
      const b = page.locator("main .ac-btn-primary").filter({ hasText: /เพิ่ม/ }).first();
      if ((await b.count()) > 0) {
        await b.click(); await page.waitForTimeout(600);
        await s.check("facilities-add-modal");
        await escape(page);
      } else s.note("facilities-add", "no + เพิ่ม button");
    }
    // equipment add
    const te = page.getByRole("tab", { name: "❄️ อุปกรณ์ในห้อง" });
    if ((await te.count()) > 0) {
      s.step = "equipment-add";
      await te.first().evaluate((el) => (el as HTMLElement).click());
      await page.waitForTimeout(600);
      const b = page.locator("main .ac-btn-primary").filter({ hasText: /เพิ่ม/ }).first();
      if ((await b.count()) > 0) {
        await b.click(); await page.waitForTimeout(600);
        await s.check("equipment-add-modal");
        await escape(page);
      }
    }
    // recurring add
    const tr = page.getByRole("tab", { name: "🔁 งานประจำ" });
    if ((await tr.count()) > 0) {
      s.step = "recurring-add";
      await tr.first().evaluate((el) => (el as HTMLElement).click());
      await page.waitForTimeout(600);
      const b = page.locator("main button").filter({ hasText: /\+ เพิ่มเทมเพลต/ }).first();
      if ((await b.count()) > 0) {
        await b.click(); await page.waitForTimeout(600);
        await s.check("recurring-add-form");
      }
    }
  }

  // --- leads add ---
  if (has("ผู้สนใจเช่า")) {
    s.step = "leads-add";
    await goView(page, "ผู้สนใจเช่า");
    const b = page.locator("main button").filter({ hasText: /\+ เพิ่ม Lead/ }).first();
    if ((await b.count()) > 0) {
      await b.click(); await page.waitForTimeout(600);
      await s.check("leads-add-modal");
      await escape(page);
    }
  }

  // --- maintlog add ---
  if (has("บันทึกซ่อมบำรุง")) {
    s.step = "maintlog-add";
    await goView(page, "บันทึกซ่อมบำรุง");
    const b = page.locator(".ac-mlog").getByRole("button", { name: "+ ลงบันทึกงาน", exact: true });
    if ((await b.count()) > 0) {
      await b.click(); await page.waitForTimeout(600);
      await s.check("maintlog-add-modal");
      await escape(page);
    }
  }

  // --- today tasks: open a task detail ---
  s.step = "task-detail";
  await goView(page, "งานวันนี้");
  const task = page.locator(".ac-task").first();
  if ((await task.count()) > 0) {
    await task.click(); await page.waitForTimeout(700);
    await s.check("task-detail-drawer");
    await escape(page);
  }

  // --- summary drawer ---
  s.step = "summary-drawer";
  await goView(page, "ภาพรวม");
  const sum = page.locator("button").filter({ hasText: /^สรุปวันนี้$/ }).first();
  if ((await sum.count()) > 0 && await sum.isVisible()) {
    await sum.click();
    await page.waitForTimeout(800);
    await expect.soft(page.locator(".ac-summary-drawer.is-open"), "summary drawer opens").toBeVisible({ timeout: 3000 }).catch(() => {});
    await s.check("summary-drawer");
    const close = page.locator('.ac-summary-drawer button[aria-label="ปิด"]');
    if ((await close.count()) > 0) await close.click(); else await escape(page);
    await page.waitForTimeout(300);
  } else s.note("summary-drawer", "no สรุปวันนี้ button visible");

  // --- command palette ---
  s.step = "cmdk";
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(500);
  const cmdk = page.locator('[role="dialog"][aria-label="ค้นหา"]');
  if ((await cmdk.count()) === 0) {
    const btn = page.locator('button[aria-label="ค้นหา (Ctrl+K)"], button[aria-label="ค้นหา"]').first();
    if ((await btn.count()) > 0) await btn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
  }
  await expect.soft(cmdk, "command palette opens on Ctrl+K").toBeVisible({ timeout: 3000 }).catch(() => {});
  if (await cmdk.isVisible().catch(() => false)) {
    await cmdk.locator("input").fill("102");
    await page.waitForTimeout(600);
    const n = await cmdk.locator('[role="listbox"] li, .ac-cmdk-item').count();
    s.note("cmdk", `results for "102": ${n}`);
    await s.check("cmdk-102");
    if (n > 0 && s.mode === "rich") {
      await page.keyboard.press("Enter");
      await page.waitForTimeout(800);
      await s.check("cmdk-enter-result");
      await escape(page);
    }
    await escape(page);
  }

  // --- theme toggle ---
  s.step = "theme";
  const tt = page.locator(".ac-theme-toggle").first();
  if ((await tt.count()) > 0 && await tt.isVisible()) {
    await tt.click(); await page.waitForTimeout(500);
    const cls = await page.evaluate(() => `${document.documentElement.className} ${document.documentElement.getAttribute("data-theme")} ${document.body.className}`);
    s.note("theme", `after toggle: ${cls}`);
    await s.check("theme-dark-overview");
    if (labels.includes("งานวันนี้")) { await goView(page, "งานวันนี้"); await s.check("theme-dark-today"); }
    await tt.click(); await page.waitForTimeout(300);
  } else s.note("theme", "theme toggle not visible");
}

async function mobilePass(s: Sweep, labels: string[]) {
  const page = s.page;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);
  for (const label of labels) {
    s.step = `mobile:${label}`;
    await goView(page, label);
    // close sidebar overlay if it opened
    const bd = page.locator(".ac-side-backdrop");
    if ((await bd.count()) > 0) await bd.click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    const ov = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    const f = await s.check(`mobile-${label}`, { overflow: ov });
    expect.soft(ov.scrollWidth, `${f.step}: horizontal overflow ${ov.scrollWidth}>${ov.innerWidth}`).toBeLessThanOrEqual(ov.innerWidth);
  }
  // mobile room modal
  s.step = "mobile:room-modal";
  await goView(page, "ภาพรวม");
  const card = page.locator(".ac-rc").filter({ hasText: "102" }).first();
  if ((await card.count()) > 0) {
    await card.click(); await page.waitForTimeout(800);
    const ov = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    await s.check("mobile-room-modal", { overflow: ov });
    await escape(page);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

for (const role of ["management", "sales", "engineer"] as const) {
  for (const mode of ["rich", "empty"] as const) {
    test.describe(`${role} / ${mode}`, () => {
      test.use({ storageState: storageStatePath(role), viewport: { width: 1440, height: 900 } });
      test(`sweep ${role} ${mode}`, async ({ page }) => {
        test.setTimeout(600_000);
        page.setDefaultTimeout(8000);
        const s = new Sweep(page, role, mode);
        try {
          await boot(page, mode);
          s.step = "boot";
          await s.check("boot");
          const labels = await walkViews(s);
          await interactions(s, labels);
          await mobilePass(s, labels);
        } finally {
          s.save();
        }
      });
    });
  }
}
