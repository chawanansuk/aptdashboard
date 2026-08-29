"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";

/**
 * App-wide 404 fallback. Replaces Next.js's default English page with
 * a Thai-friendly card centered on the page.
 *
 * Triggered by:
 *  - Direct URL to a non-existent path (e.g. /tenants for users without
 *    that route, or /random-mistype)
 *  - Calling `notFound()` from a Server Component
 *
 * Note: the Next.js route guard inside app/page.tsx redirects forbidden
 * views to a valid view + toast. This page is for the case where the
 * URL itself doesn't map to any route at all.
 */
export default function NotFound() {
  const router = useRouter();
  return (
    <>
    <title>ไม่พบหน้า · APARTCLOUD</title>
    <main className="ac-notfound" role="main" aria-labelledby="ac-notfound-title">
      <div className="ac-notfound-card">
        <div className="ac-notfound-icon" aria-hidden>
          <Icon name="grid" size={48} />
        </div>
        <div className="ac-notfound-number" aria-hidden>404</div>
        <h1 className="ac-notfound-title" id="ac-notfound-title">ไม่พบหน้านี้</h1>
        <p className="ac-notfound-desc">
          หน้าที่คุณค้นหาอาจถูกย้าย ลบ หรือคุณอาจไม่มีสิทธิ์เข้าถึง
        </p>
        <div className="ac-notfound-actions">
          <button
            type="button"
            className="ac-btn ac-btn-primary"
            onClick={() => router.push("/")}
          >
            กลับหน้าหลัก
          </button>
          <button
            type="button"
            className="ac-btn ac-btn-ghost"
            onClick={() => router.back()}
          >
            ย้อนกลับ
          </button>
        </div>
      </div>
    </main>
    </>
  );
}
