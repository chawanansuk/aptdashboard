import { test, expect } from "@playwright/test";
import { storageStatePath } from "./paths";
import { mockDashboard, room } from "./fixtures";

test.use({ storageState: storageStatePath("sales") });

/**
 * Audit r36 — the room note is sent ONLY when this user edited it.
 * Apps Script writes whatever note it receives, so re-sending the text
 * the window opened with overwrote a note someone else saved meanwhile.
 */
test("editing the note sends it; a status-only change leaves the note alone", async ({ page }) => {
  await mockDashboard(page, {
    rooms: [room({ building: "มั่งมี", room: "104", status: "รอสัญญา", note: "โอนมัดจำแล้ว" })],
    tasks: [],
  });
  const posts: Record<string, unknown>[] = [];
  await page.route("**/api/sheet/update", (r) => {
    posts.push(r.request().postDataJSON());
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.goto("/?view=pending");
  await page.addStyleTag({ content: "nextjs-portal{display:none} .ac-health-banner{display:none}" });

  const open = async () => {
    await page.locator(".ac-rc").filter({ hasText: "104" }).first().click();
    await expect(page.locator("#ac-room-status")).toBeVisible();
  };

  // 1) Edit the note → it is sent.
  await open();
  await page.locator("textarea[placeholder='บันทึกเพิ่มเติม...']").fill("เข้า 1 ต.ค.");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ action: "updateRoomStatus", building: "มั่งมี", room: "104", note: "เข้า 1 ต.ค." });

  // 2) Reopen, change only the status → no note in the request, so a note
  //    someone else saved in between would survive.
  await open();
  await page.locator("#ac-room-status").selectOption("ว่าง");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1]).toMatchObject({ action: "updateRoomStatus", status: "ว่าง" });
  expect(posts[1]).not.toHaveProperty("note");
});
