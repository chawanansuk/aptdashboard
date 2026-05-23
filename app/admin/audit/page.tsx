import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isManagement } from "@/lib/permissions";
import AuditViewer from "@/components/AuditViewer";
import Link from "next/link";

/**
 * Audit log viewer — Task 18.
 *
 * Reads the `audit_log` sheet (newest first) and displays in a
 * filterable table. Management-only because the log contains user
 * emails + history of every privileged op.
 *
 * Data fetching happens client-side (AuditViewer) so the user can
 * filter / re-fetch without a page reload.
 */

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/admin/audit");
  }
  if (!isManagement(session.user.roles)) {
    redirect("/");
  }

  return (
    <main className="ac-audit-page">
      <header className="ac-perm-head">
        <div>
          <h1>Audit log</h1>
          <p className="ac-perm-sub">
            บันทึกการเปลี่ยนแปลงทุกอย่าง — append-only, อ่านได้เฉพาะผู้จัดการ
          </p>
        </div>
        <Link href="/" className="ac-btn ac-btn-ghost">← กลับหน้าหลัก</Link>
      </header>
      <AuditViewer />
    </main>
  );
}
