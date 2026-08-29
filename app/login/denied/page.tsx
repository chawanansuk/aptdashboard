import type { Metadata } from "next";
import { signOut } from "@/auth";

// title หลุดจาก layout กลาง (แดชบอร์ดตั้ง <title> ต่อหน้าเอง — audit r22)
export const metadata: Metadata = { title: "ไม่มีสิทธิ์เข้าใช้งาน · APARTCLOUD" };

export default function DeniedPage() {
  return (
    <div className="ac-login-shell">
      <div className="ac-login-card">
        <div className="ac-login-logo">
          <div className="ac-login-logo-icon ac-login-logo-icon-warn">!</div>
          <div className="ac-login-brand">APARTCLOUD</div>
        </div>

        <h1 className="ac-login-title">ไม่มีสิทธิ์เข้าใช้งาน</h1>
        <p className="ac-login-sub">
          อีเมลนี้ไม่มีสิทธิ์เข้าใช้งานระบบ
          <br />
          กรุณาติดต่อผู้ดูแลเพื่อขอสิทธิ์
        </p>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className="ac-login-btn ac-login-btn-ghost">
            ออกจากระบบ
          </button>
        </form>
      </div>
    </div>
  );
}
