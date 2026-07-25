import { test, expect } from "@playwright/test";
import { storageStatePath } from "./paths";
import { mockDashboard, room } from "./fixtures";

/**
 * Defect photos (v3.25) — hermetic coverage for the RoomModal section:
 * gallery fetch, client-side compress→upload POST shape, the Phase-2
 * turnover compare banner, lightbox Escape scoping, and the manual-retry
 * (never auto-retry — uploads are not idempotent) failure path.
 */
// 1x1 transparent PNG — the browser decodes it, the compressor re-encodes JPEG.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("defect photos", () => {
  test.use({ storageState: storageStatePath("management") });

  test("gallery renders, upload posts compressed base64, turnover banner shows", async ({ page }) => {
    const posted: Record<string, unknown>[] = [];
    let uploadSeq = 0;

    await mockDashboard(page, {
      rooms: [
        room({ building: "มีทอง", room: "204", status: "แจ้งย้ายออก", tenant: "คุณเอ" }),
      ],
      tasks: [],
    });

    // Registered AFTER mockDashboard → takes precedence over its catch-all.
    await page.route("**/api/room-photos**", async (route) => {
      const req = route.request();
      if (req.method() === "POST") {
        const body = req.postDataJSON() as Record<string, unknown>;
        posted.push(body);
        if (body.action === "setNote") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true, id: body.id, note: body.note }),
          });
        }
        if (body.action === "delete") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true, id: body.id }),
          });
        }
        uploadSeq++;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, id: `new${uploadSeq}`, fileId: `file-new${uploadSeq}`, createdAt: "2026-07-25 10:00" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          rows: [
            { id: "p1", building: "มีทอง", room: "204", fileId: "f1", note: "รอยขีดผนัง", creator: "a@b.c", createdAt: "2026-07-01 09:00" },
            { id: "p2", building: "มีทอง", room: "204", fileId: "f2", note: "", creator: "a@b.c", createdAt: "2026-07-02 09:00" },
            { id: "cat1", building: "มีทอง", room: "204", fileId: "f3", note: "ส้มจุด", creator: "a@b.c", createdAt: "2026-07-03 09:00", category: "สัตว์เลี้ยง" },
          ],
        }),
      });
    });
    // Thumbnails point at Google — stub them so <img> loads offline.
    await page.route("**://drive.google.com/**", (r) =>
      r.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG }),
    );
    await page.route("**://lh3.googleusercontent.com/**", (r) =>
      r.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG }),
    );

    await page.goto("/");
    await expect(page).not.toHaveURL(/\/login/);
    await page.addStyleTag({ content: "nextjs-portal{display:none} .ac-health-banner{display:none}" });

    await page.locator(".ac-rc").filter({ hasText: "204" }).first().click();

    // Two sections share the class since v3.25.4 — scope by aria-label.
    const section = page.locator('section[aria-label="รูปตำหนิสภาพห้อง"]');
    const petSection = page.locator('section[aria-label="สัตว์เลี้ยงประจำห้อง"]');
    await expect(section).toBeVisible();
    // Existing photos rendered newest-first; the pet row stays OUT of
    // the defect strip and lands in its own section.
    await expect(section.locator(".ac-room-gallery-thumb")).toHaveCount(2);
    await expect(petSection.locator(".ac-room-gallery-thumb")).toHaveCount(1);
    await expect(petSection.locator(".ac-defect-caption")).toContainText("ส้มจุด");
    // Phase-2 turnover banner (room is แจ้งย้ายออก and photos exist)
    await expect(section.locator(".ac-defect-compare-banner")).toContainText("2 รูป");

    // Upload path: file picker only — descriptions are added AFTER
    // upload via "+ คำอธิบาย" (the pre-type note box was removed;
    // two competing note flows confused users).
    await section.locator('input[type="file"]').setInputFiles({
      name: "defect.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });

    await expect(section.locator(".ac-room-gallery-thumb")).toHaveCount(3);
    expect(posted).toHaveLength(1);
    expect(posted[0].building).toBe("มีทอง");
    expect(posted[0].room).toBe("204");
    expect(posted[0].mimeType).toBe("image/jpeg");
    expect(String(posted[0].dataBase64).length).toBeGreaterThan(50);
    // bare base64, no data: prefix
    expect(String(posted[0].dataBase64)).not.toContain(",");

    // Pet upload (v3.25.4): the 🐱 button routes the same picker into
    // the pet category — POST must carry category:"pet".
    await petSection.getByRole("button", { name: "🐱 เพิ่มรูปสัตว์เลี้ยง" }).click();
    await section.locator('input[type="file"]').setInputFiles({
      name: "cat.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    await expect(petSection.locator(".ac-room-gallery-thumb")).toHaveCount(2);
    const petPost = posted.find((p) => p.category === "pet");
    expect(petPost).toBeTruthy();
    expect(petPost!.room).toBe("204");

    // Notes are VISIBLY captioned under thumbnails (v3.25.1) — a saved
    // note that only shows on hover reads as "ลงบันทึกไม่ได้".
    await expect(section.locator(".ac-defect-caption").filter({ hasText: "รอยขีดผนัง" })).toBeVisible();

    // The just-uploaded photo has no note → "+ คำอธิบาย" (first cell =
    // newest) opens the fill-once editor. This is the real user flow:
    // snap first, describe right after.
    await section.getByRole("button", { name: "+ คำอธิบาย" }).first().click();
    await section.locator(".ac-defect-caption-edit input").fill("คราบน้ำเพดาน");
    await section.locator(".ac-defect-caption-edit input").press("Enter");
    await expect(section.locator(".ac-defect-caption").filter({ hasText: "คราบน้ำเพดาน" })).toBeVisible();
    const notePost = posted.find((p) => p.action === "setNote");
    expect(notePost).toMatchObject({ action: "setNote", id: "new1", note: "คราบน้ำเพดาน" });

    // Lightbox opens with the full-size URL
    await section.locator(".ac-room-gallery-thumb").first().click();
    await expect(page.locator(".ac-room-lightbox-img")).toBeVisible();
    // Escape closes the lightbox ONLY — the room modal must stay open.
    await page.keyboard.press("Escape");
    await expect(page.locator(".ac-room-lightbox-img")).toBeHidden();
    await expect(section).toBeVisible();

    // Management-only delete (v3.25.3): reopen the lightbox, confirm the
    // dialog, photo leaves the strip and the POST carries action:delete.
    await section.locator(".ac-room-gallery-thumb").first().click();
    page.on("dialog", (d) => void d.accept());
    await page.locator(".ac-defect-delete-btn").click();
    await expect(page.locator(".ac-room-lightbox-img")).toBeHidden();
    await expect(section.locator(".ac-room-gallery-thumb")).toHaveCount(2);
    const delPost = posted.find((p) => p.action === "delete");
    expect(delPost).toMatchObject({ action: "delete", id: "new1" });
  });

  test("PetsView: property-wide grid, building filter, call-owner link", async ({ page }) => {
    await mockDashboard(page, {
      rooms: [
        room({ building: "มีทอง", room: "204", status: "มีคนอยู่", tenant: "คุณนก", phone: "0812345678" }),
        room({ building: "KL", room: "101", status: "มีคนอยู่" }),
      ],
      tasks: [],
    });
    await page.route("**/api/room-photos**", (r) => {
      const url = r.request().url();
      const rows = url.includes("scope=pets")
        ? [
            { id: "c1", building: "มีทอง", room: "204", fileId: "f1", note: "ส้มจุด หางงอ", creator: "a@b.c", createdAt: "2026-07-01 09:00", category: "สัตว์เลี้ยง" },
            { id: "c2", building: "KL", room: "101", fileId: "f2", note: "ดำทั้งตัว", creator: "a@b.c", createdAt: "2026-07-02 09:00", category: "สัตว์เลี้ยง" },
          ]
        : [];
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, rows }) });
    });
    await page.route("**://drive.google.com/**", (r) =>
      r.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG }),
    );
    await page.route("**://lh3.googleusercontent.com/**", (r) =>
      r.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG }),
    );

    await page.goto("/");
    await page.addStyleTag({ content: "nextjs-portal{display:none} .ac-health-banner{display:none}" });

    await page.getByRole("button", { name: "สัตว์เลี้ยง" }).click();
    const view = page.locator(".ac-pets-view");
    await expect(view).toBeVisible();
    await expect(view.locator(".ac-pets-card")).toHaveCount(2);
    await expect(view.locator(".ac-pets-note").filter({ hasText: "ส้มจุด" })).toBeVisible();

    // Building filter narrows the grid
    await view.locator(".ac-pets-filters").getByRole("tab", { name: "มีทอง" }).click();
    await expect(view.locator(".ac-pets-card")).toHaveCount(1);

    // Lightbox: room + (management can see) tenant + tap-to-call
    await view.locator(".ac-pets-thumb").first().click();
    const info = page.locator(".ac-pets-lightbox-info");
    await expect(info).toContainText("มีทอง 204");
    await expect(info).toContainText("คุณนก");
    await expect(info.locator("a.ac-pets-call")).toHaveAttribute("href", "tel:0812345678");
    await page.keyboard.press("Escape");
    await expect(page.locator(".ac-room-lightbox-img")).toBeHidden();
  });

  test("upload failure shows manual retry, retry succeeds", async ({ page }) => {
    let postCount = 0;
    await mockDashboard(page, {
      rooms: [room({ building: "มีทอง", room: "305" })],
      tasks: [],
    });
    await page.route("**/api/room-photos**", async (route) => {
      const req = route.request();
      if (req.method() === "POST") {
        postCount++;
        if (postCount === 1) {
          return route.fulfill({
            status: 502,
            contentType: "application/json",
            body: JSON.stringify({ ok: false, error: "อัปโหลดรูปไม่สำเร็จ: upstream HTTP 502" }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, id: "n1", fileId: "file-ok", createdAt: "2026-07-25 11:00" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, rows: [] }),
      });
    });
    await page.route("**://drive.google.com/**", (r) =>
      r.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG }),
    );

    await page.goto("/");
    await page.addStyleTag({ content: "nextjs-portal{display:none} .ac-health-banner{display:none}" });
    await page.locator(".ac-rc").filter({ hasText: "305" }).first().click();

    const section = page.locator(".ac-defect-photos");
    await section.locator('input[type="file"]').setInputFiles({
      name: "defect.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });

    // Failure → item stays in the strip with a manual retry (no auto-retry)
    const retryBtn = section.getByRole("button", { name: "ลองอีกครั้ง" });
    await expect(retryBtn).toBeVisible();
    expect(postCount).toBe(1);

    await retryBtn.click();
    await expect(section.locator(".ac-room-gallery-thumb")).toHaveCount(1);
    expect(postCount).toBe(2);
  });
});
