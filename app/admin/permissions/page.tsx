import { auth } from "@/auth";
import { redirect } from "next/navigation";
import type { Role } from "@/auth";
import {
  ROUTE_ALLOW,
  ACTION_ALLOW,
  isManagement,
  type Route,
  type Action,
} from "@/lib/permissions";
import Link from "next/link";

/**
 * Permissions matrix viewer — Task 19.
 *
 * Read-only audit page for management. Shows the canonical
 * Route × Role and Action × Role tables straight from
 * `lib/permissions.ts`. The page renders server-side so the
 * matrix is guaranteed to reflect what the server actually enforces
 * (no client-side drift, no stale snapshot).
 *
 * Auth gate: management role only. Other roles get redirected to "/"
 * — preview rather than 403 to avoid leaking the URL.
 *
 * The matrices have ~20 routes + ~13 actions × 3 roles = ~100 cells.
 * Rendering once per page load is fine; if these tables ever grow we
 * can split into a tabs UI.
 */

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["sales", "engineer", "management"];

const ROLE_LABEL: Record<Role, string> = {
  sales: "ฝ่ายขาย",
  engineer: "ฝ่ายช่าง",
  management: "ผู้จัดการ",
};

// Friendly Thai descriptions per route — surface intent next to the
// machine name so non-engineers can read the matrix.
const ROUTE_DESC: Record<Route, string> = {
  overview: "หน้าภาพรวม",
  today: "งานวันนี้",
  calendar: "ปฏิทินรายเดือน",
  ready: "ห้องพร้อมขาย",
  pending: "ห้องรอลูกค้า",
  occupied: "ห้องมีคนอยู่",
  moveout: "ห้องแจ้งย้ายออก",
  tenants: "ทะเบียนผู้เช่า (PII)",
  salespipeline: "Sales Pipeline",
  qc: "ห้องรอตรวจ",
  repair: "ห้องซ่อม",
  inactive: "ห้องไม่ใช้งาน",
  maintenance: "บำรุงรักษาห้อง",
  facilities: "สาธารณูปโภคอาคาร",
  engineerkanban: "Engineer Kanban",
  parts: "อะไหล่ (Inventory)",
  vehicles: "ยานพาหนะ (Vehicles per room)",
  leads: "ผู้สนใจเช่า (Leads)",
  recurring: "งานประจำ (Recurring tasks)",
  income: "รายได้",
  reports: "รายงาน",
};

const ACTION_DESC: Record<Action, string> = {
  "task.add": "เพิ่มงาน (ทั่วไป)",
  "task.add.sales": "เพิ่มงานฝ่ายขาย (ย้ายเข้า/ออก/ชมห้อง)",
  "task.add.clean": "เพิ่มงานทำสะอาด (turnover — ฝ่ายขายนัดได้)",
  "task.add.eng": "เพิ่มงานฝ่ายช่าง (ซ่อม)",
  "task.edit": "แก้ไขงาน",
  "task.delete": "ลบงาน",
  "room.editStatus": "แก้สถานะห้อง",
  "tenant.view": "ดูข้อมูลผู้เช่า (ชื่อ/โทร)",
  "tenant.edit": "แก้ข้อมูลผู้เช่า",
  "equipment.add": "เพิ่มอุปกรณ์ในห้อง",
  "equipment.edit": "แก้อุปกรณ์ในห้อง",
  "facility.add": "เพิ่มสาธารณูปโภคอาคาร",
  "facility.edit": "แก้สาธารณูปโภคอาคาร",
  "part.view": "ดูคลังอะไหล่",
  "part.edit": "เพิ่ม/แก้/ปรับสต๊อกอะไหล่",
  "time.track": "จับเวลาทำงาน (start/stop timer)",
  "vehicle.edit": "เพิ่ม/แก้/ลบยานพาหนะของห้อง",
  "lead.edit": "เพิ่ม/แก้/ลบ ผู้สนใจเช่า",
  "finance.view": "ดูข้อมูลการเงิน",
};

function Cell({ allowed }: { allowed: boolean }) {
  return (
    <span
      className={`ac-perm-cell ${allowed ? "is-yes" : "is-no"}`}
      aria-label={allowed ? "อนุญาต" : "ไม่อนุญาต"}
      title={allowed ? "✓" : "—"}
    >
      {allowed ? "✓" : "—"}
    </span>
  );
}

export default async function PermissionsPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/admin/permissions");
  }
  if (!isManagement(session.user.roles)) {
    redirect("/");
  }

  const routeKeys = Object.keys(ROUTE_ALLOW) as Route[];
  const actionKeys = Object.keys(ACTION_ALLOW) as Action[];

  return (
    <main className="ac-perm-page">
      <header className="ac-perm-head">
        <div>
          <h1>เมทริกซ์สิทธิ์การใช้งาน</h1>
          <p className="ac-perm-sub">
            แสดงสิทธิ์ของแต่ละ role — ข้อมูลซิงค์โดยตรงจาก
            <code>lib/permissions.ts</code> (server-rendered)
          </p>
        </div>
        <Link href="/" className="ac-btn ac-btn-ghost">← กลับหน้าหลัก</Link>
      </header>

      <section className="ac-perm-section">
        <h2>หน้า / Route</h2>
        <div className="ac-perm-table-wrap">
          <table className="ac-perm-table">
            <thead>
              <tr>
                <th scope="col">หน้า</th>
                <th scope="col">คำอธิบาย</th>
                {ROLES.map((r) => (
                  <th scope="col" key={r}>{ROLE_LABEL[r]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {routeKeys.map((route) => (
                <tr key={route}>
                  <td className="ac-perm-key"><code>{route}</code></td>
                  <td className="ac-perm-desc">{ROUTE_DESC[route]}</td>
                  {ROLES.map((r) => (
                    <td key={r}>
                      <Cell allowed={ROUTE_ALLOW[route].includes(r)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ac-perm-section">
        <h2>การกระทำ / Action</h2>
        <div className="ac-perm-table-wrap">
          <table className="ac-perm-table">
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">คำอธิบาย</th>
                {ROLES.map((r) => (
                  <th scope="col" key={r}>{ROLE_LABEL[r]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {actionKeys.map((action) => (
                <tr key={action}>
                  <td className="ac-perm-key"><code>{action}</code></td>
                  <td className="ac-perm-desc">{ACTION_DESC[action]}</td>
                  {ROLES.map((r) => (
                    <td key={r}>
                      <Cell allowed={ACTION_ALLOW[action].includes(r)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="ac-perm-foot">
        <p>
          แก้ไขสิทธิ์ผ่านการ commit ใน <code>lib/permissions.ts</code>{" "}
          (no runtime config) — ทั้ง UI gates และ API guards ใช้ตารางเดียวกันนี้
        </p>
      </footer>
    </main>
  );
}
