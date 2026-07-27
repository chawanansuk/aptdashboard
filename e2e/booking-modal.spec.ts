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
  await expect(modal.getByRole("button", { name: "📋 คัดลอกโหมดนี้" })).toBeDisabled();

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
  await modal.getByRole("button", { name: "📑 คัดลอก B+C เรียงกัน" }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain("✅ ยืนยันการจองเรียบร้อยค่ะ");
  expect(clip).toContain("📄 สิ่งที่ต้องเตรียม");
});
