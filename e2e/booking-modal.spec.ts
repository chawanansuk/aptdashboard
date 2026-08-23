import { test, expect } from "@playwright/test";
import { storageStatePath } from "./paths";
import { mockDashboard, room } from "./fixtures";

test.use({ storageState: storageStatePath("management") });

/**
 * Booking modal P0 (hermetic): deposit prefill, live phone formatting,
 * 3 message modes with bank block, per-mode hand-edit overrides that
 * survive field changes + mode switches, ↻ regenerate, copy gating,
 * and the B+C combined copy.
 */
test("booking P0: prefill, modes, dirty edit, phone format, copy gating", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await mockDashboard(page, {
    rooms: [room({ building: "มีทอง", room: "401", status: "ว่าง", price: "5200" })],
    tasks: [],
  });
  await page.goto("/");
  await page.addStyleTag({ content: "nextjs-portal{display:none} .ac-health-banner{display:none}" });
  await page.locator(".ac-rc").filter({ hasText: "401" }).first().click();
  await page.getByRole("button", { name: "📋 รับจอง (มัดจำ)" }).first().click();

  const modal = page.locator(".ac-booking-modal");
  await expect(modal).toBeVisible();

  // P0-1: deposit prefilled 10,000 (not empty placeholder)
  await expect(modal.locator("#ac-bk-deposit")).toHaveValue("10,000");
  // message must NOT say ค่าประกัน: 0
  await expect(modal.locator("#ac-bk-msg")).not.toHaveValue(/ค่าประกัน: 0 บาท/);

  // Copy gated while tenant/phone missing
  await expect(modal.getByRole("button", { name: "📋 คัดลอกข้อความนี้" })).toBeDisabled();

  // P0-3: phone formats live
  await modal.locator("#ac-bk-tenant").fill("กุ๊กไก่");
  await modal.locator("#ac-bk-phone").pressSequentially("0924561642");
  await expect(modal.locator("#ac-bk-phone")).toHaveValue("092-4561642");
  await expect(modal.locator("#ac-bk-msg")).toHaveValue(/คุณ กุ๊กไก่ \| 092-4561642/);

  // = ค่าเช่า 1 เดือน shortcut
  await modal.getByRole("button", { name: "= ค่าเช่า 1 เดือน" }).click();
  await expect(modal.locator("#ac-bk-paid")).toHaveValue("5,200");

  // P0-5: mode A has the bank block
  await modal.getByRole("tab", { name: "ขอมัดจำ" }).click();
  await expect(modal.locator("#ac-bk-msg")).toHaveValue(/เลขบัญชี: 017-0-46047-9/);
  await expect(modal.locator("#ac-bk-msg")).toHaveValue(/📌 จองห้องพัก/);
  // mode C too
  await modal.getByRole("tab", { name: "สิ่งที่ต้องเตรียม" }).click();
  await expect(modal.locator("#ac-bk-msg")).toHaveValue(/🏦 กรุงไทย: 017-0-46047-9/);

  // P0-2: hand edit survives a field change AND a mode switch
  await modal.getByRole("tab", { name: "ยืนยันการจอง" }).click();
  await modal.locator("#ac-bk-msg").fill("ข้อความที่แก้เอง 12345");
  await modal.locator("#ac-bk-time").fill("10:30");
  await expect(modal.locator("#ac-bk-msg")).toHaveValue("ข้อความที่แก้เอง 12345");
  await expect(modal.locator(".ac-booking-dirtybar")).toBeVisible();
  await modal.getByRole("tab", { name: "ขอมัดจำ" }).click();
  await modal.getByRole("tab", { name: "ยืนยันการจอง" }).click();
  await expect(modal.locator("#ac-bk-msg")).toHaveValue("ข้อความที่แก้เอง 12345");
  // ↻ regenerates (confirm dialog)
  page.on("dialog", (d) => void d.accept());
  await modal.getByRole("button", { name: "↻ สร้างใหม่จากข้อมูล" }).click();
  await expect(modal.locator("#ac-bk-msg")).toHaveValue(/✅ ยืนยันการจองเรียบร้อยค่ะ/);
  await expect(modal.locator("#ac-bk-msg")).toHaveValue(/\(10:30\)/);

  // copy now enabled; B+C copies both messages
  await modal.getByRole("button", { name: "📑 ขั้น 3+4 ต่อกัน" }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain("✅ ยืนยันการจองเรียบร้อยค่ะ");
  expect(clip).toContain("📄 สิ่งที่ต้องเตรียม");
});

/**
 * P2: save carries the figures + LINE message into the ย้ายเข้า task
 * note, Ctrl+Enter saves, the footer copy indicator tracks edits, and
 * the dirty-close guard blocks accidental Esc.
 */
test("booking P2: save note, Ctrl+Enter, copy indicator, dirty-close guard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const posted: Record<string, unknown>[] = [];
  await mockDashboard(page, {
    rooms: [room({ building: "มีทอง", room: "401", status: "ว่าง", price: "5200" })],
    tasks: [],
  });
  await page.route("**/api/sheet/update", async (r) => {
    posted.push(r.request().postDataJSON() as Record<string, unknown>);
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.goto("/");
  await page.addStyleTag({ content: "nextjs-portal{display:none} .ac-health-banner{display:none}" });
  await page.locator(".ac-rc").filter({ hasText: "401" }).first().click();
  await page.getByRole("button", { name: "📋 รับจอง (มัดจำ)" }).first().click();

  const modal = page.locator(".ac-booking-modal");
  await modal.locator("#ac-bk-tenant").fill("กุ๊กไก่");
  await modal.locator("#ac-bk-phone").pressSequentially("0924561642");

  // Copy indicator: starts un-copied → ✓ after copy → reverts on edit
  const indicator = modal.locator(".ac-booking-copied");
  await expect(indicator).toHaveText("ยังไม่ได้คัดลอกข้อความ");
  await modal.getByRole("button", { name: "📋 คัดลอกข้อความนี้" }).click();
  await expect(indicator).toHaveText("คัดลอกแล้ว ✓");
  await modal.locator("#ac-bk-msg").fill("ข้อความที่แก้ใหม่");
  await expect(indicator).toHaveText("ยังไม่ได้คัดลอกข้อความ");

  // Dirty-close guard: Esc asks first; dismiss keeps the modal open
  page.once("dialog", (d) => void d.dismiss());
  await page.keyboard.press("Escape");
  await expect(modal).toBeVisible();

  // Ctrl+Enter saves; the addTask note carries figures + the message
  await page.keyboard.press("Control+Enter");
  await expect(modal).toBeHidden();
  const book = posted.find((p) => p.action === "bookRoom");
  expect(book).toMatchObject({ building: "มีทอง", room: "401", status: "รอสัญญา", tenant: "กุ๊กไก่", phone: "0924561642" });
  const task = posted.find((p) => p.action === "addTask");
  expect(task).toBeTruthy();
  const note = String(task!.note);
  expect(note).toContain("ประกัน 10000");
  expect(note).toContain("---");
  expect(note).toContain("ข้อความที่แก้ใหม่"); // hand-edited mode-B message is what gets audited
});

/**
 * P1: deposit-status radio drives mode + save gating, vaccine hint,
 * note chips land in the message, discount flows into totals+message,
 * late-month auto-tick with manual override.
 */
test("booking P1: deposit radio, vaccine, chips, discount, auto-tick", async ({ page }) => {
  await mockDashboard(page, {
    rooms: [room({ building: "มีทอง", room: "401", status: "ว่าง", price: "5200" })],
    tasks: [],
  });
  await page.goto("/");
  await page.addStyleTag({ content: "nextjs-portal{display:none} .ac-health-banner{display:none}" });
  await page.locator(".ac-rc").filter({ hasText: "401" }).first().click();
  await page.getByRole("button", { name: "📋 รับจอง (มัดจำ)" }).first().click();

  const modal = page.locator(".ac-booking-modal");
  await modal.locator("#ac-bk-tenant").fill("กุ๊กไก่");
  await modal.locator("#ac-bk-phone").pressSequentially("0924561642");

  // Radio "ยังไม่โอน" → auto-switch to mode S (สรุปยอด — step ① of the
  // sequence, full amount with no deposit deduction) + save disabled
  await modal.getByRole("radio", { name: "ยังไม่โอน" }).check();
  await expect(modal.getByRole("tab", { name: "สรุปยอด" })).toHaveAttribute("aria-selected", "true");
  await expect(modal.locator("#ac-bk-msg")).toHaveValue(/💰 สรุปยอดวันเข้าพัก/);
  await expect(modal.locator("#ac-bk-msg")).toHaveValue(/รบกวนยืนยันให้แอดมินหน่อยนะคะ/);
  await expect(modal.locator("#ac-bk-msg")).toHaveValue(/• ยอดรวมทั้งหมด: /);
  await expect(modal.locator("#ac-bk-msg")).not.toHaveValue(/มัดจำ/);
  await expect(modal.getByRole("button", { name: /บันทึก & สร้างนัดย้ายเข้า/ })).toBeDisabled();
  await expect(modal.locator(".ac-booking-foot-hint")).toContainText("โอนมัดจำก่อน");
  // back to โอนแล้ว → mode B + save enabled
  await modal.getByRole("radio", { name: "โอนแล้ว (ได้สลิป)" }).check();
  await expect(modal.getByRole("tab", { name: "ยืนยันการจอง" })).toHaveAttribute("aria-selected", "true");
  await expect(modal.getByRole("button", { name: /บันทึก & สร้างนัดย้ายเข้า/ })).toBeEnabled();

  // Vaccine hint appears for a pet without the checkbox; suffix lands when ticked
  await modal.locator("#ac-bk-pet").fill("น้องแมว 1 ตัว");
  await expect(modal.locator(".ac-booking-vaccine-hint")).toHaveText("ยังไม่ได้ยืนยันเอกสารวัคซีน");
  await modal.getByRole("checkbox", { name: /มีเอกสารวัคซีนแล้ว/ }).check();
  await expect(modal.locator(".ac-booking-vaccine-hint")).toBeHidden();
  await expect(modal.locator("#ac-bk-msg")).toHaveValue(/สัตว์เลี้ยง : น้องแมว 1 ตัว มีเอกสารยืนยันการฉีดวัคซีนแล้ว/);

  // Note chip → line in the message
  await modal.getByRole("button", { name: "ที่จอดมอไซค์ในร่ม +200" }).click();
  await expect(modal.locator("#ac-bk-msg")).toHaveValue(/ที่จอดมอเตอร์ไซค์ในร่ม \+200 บาท\/เดือน/);

  // Discount → totals row + message line
  await modal.locator("#ac-bk-discount").fill("500");
  await modal.locator("#ac-bk-discount-reason").fill("โปรเปิดตึก");
  await expect(modal.locator(".ac-booking-totals")).toContainText("ส่วนลด (โปรเปิดตึก)");
  await expect(modal.locator("#ac-bk-msg")).toHaveValue(/• ส่วนลด \(โปรเปิดตึก\): -500 บาท/);

  // Late-month auto-tick + manual untick sticks
  await modal.locator("#ac-bk-date").fill("2026-08-28");
  const chargeNext = modal.locator(".ac-booking-checkbox").first().getByRole("checkbox");
  await expect(chargeNext).toBeChecked();
  await chargeNext.uncheck();
  await modal.locator("#ac-bk-date").fill("2026-08-29");
  await expect(chargeNext).not.toBeChecked(); // touched → auto-tick never overrides
});
