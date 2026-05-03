"use client";

import { useMemo } from "react";
import type { RoomView } from "@/types";

interface Props {
  rooms: RoomView[];
  activeBuilding: string;
}

function priceNum(s: string): number {
  if (!s) return 0;
  const n = parseInt(String(s).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function fmtBaht(n: number): string {
  return n.toLocaleString("th-TH") + " ฿";
}

export default function IncomeView({ rooms, activeBuilding }: Props) {
  const data = useMemo(() => {
    const scope = activeBuilding === "ทั้งหมด" ? rooms : rooms.filter((r) => r.building === activeBuilding);

    let total = 0;
    let occupied = 0;
    let vacant = 0;
    let potential = 0;
    let actual = 0;
    let lost = 0;

    const byBuilding = new Map<string, { total: number; occupied: number; potential: number; actual: number; lost: number }>();

    scope.forEach((r) => {
      const p = priceNum(r.price);
      total++;
      potential += p;

      const b = byBuilding.get(r.building) || { total: 0, occupied: 0, potential: 0, actual: 0, lost: 0 };
      b.total++;
      b.potential += p;

      if (r.status === "occupied" || r.status === "moveout") {
        occupied++;
        actual += p;
        b.occupied++;
        b.actual += p;
      } else if (r.status === "ready" || r.status === "pending" || r.status === "qc" || r.status === "repair") {
        vacant++;
        lost += p;
        b.lost += p;
      }
      byBuilding.set(r.building, b);
    });

    const occupancyRate = total ? (occupied / total) * 100 : 0;
    const collectRate = potential ? (actual / potential) * 100 : 0;

    return {
      total,
      occupied,
      vacant,
      potential,
      actual,
      lost,
      occupancyRate,
      collectRate,
      byBuilding: Array.from(byBuilding.entries()).map(([b, v]) => ({ building: b, ...v })).sort((a, b) => b.potential - a.potential),
    };
  }, [rooms, activeBuilding]);

  return (
    <div className="ac-income">
      <header className="ac-page-head">
        <h2 className="ac-page-title">สรุปรายได้ {activeBuilding !== "ทั้งหมด" && `· ${activeBuilding}`}</h2>
        <p className="ac-page-sub">ตัวเลขนี้คือ <strong>ศักยภาพ</strong> (ค่าเช่าตามสถานะห้อง) ไม่ใช่ยอดที่จ่ายจริง — ดูยอดจริงในชีต <code>มิเตอร์</code></p>
      </header>

      <section className="ac-income-kpi">
        <div className="ac-kpi-card ac-kpi-actual">
          <div className="ac-kpi-label">รายได้ปัจจุบัน (มีผู้เช่า)</div>
          <div className="ac-kpi-num">{fmtBaht(data.actual)}</div>
          <div className="ac-kpi-sub">{data.occupied} ห้อง · {data.collectRate.toFixed(0)}% ของศักยภาพ</div>
        </div>
        <div className="ac-kpi-card ac-kpi-lost">
          <div className="ac-kpi-label">เสียโอกาส (ห้องว่าง)</div>
          <div className="ac-kpi-num">{fmtBaht(data.lost)}</div>
          <div className="ac-kpi-sub">{data.vacant} ห้อง · ต่อเดือน</div>
        </div>
        <div className="ac-kpi-card ac-kpi-potential">
          <div className="ac-kpi-label">ศักยภาพรวม (ถ้าเช่าเต็ม)</div>
          <div className="ac-kpi-num">{fmtBaht(data.potential)}</div>
          <div className="ac-kpi-sub">{data.total} ห้อง</div>
        </div>
        <div className="ac-kpi-card ac-kpi-rate">
          <div className="ac-kpi-label">อัตราการเช่า</div>
          <div className="ac-kpi-num">{data.occupancyRate.toFixed(1)}%</div>
          <div className="ac-kpi-bar">
            <div className="ac-kpi-bar-fill" style={{ width: `${data.occupancyRate}%` }} />
          </div>
        </div>
      </section>

      <section className="ac-income-table">
        <header className="ac-tasks-head">
          <h3 className="ac-tasks-title">แยกตามตึก</h3>
        </header>
        <div className="ac-table-wrap">
          <table className="ac-table">
            <thead>
              <tr>
                <th>ตึก</th>
                <th className="num">ห้อง</th>
                <th className="num">เช่าอยู่</th>
                <th className="num">ศักยภาพ</th>
                <th className="num">ปัจจุบัน</th>
                <th className="num">เสียโอกาส</th>
                <th className="num">อัตรา</th>
              </tr>
            </thead>
            <tbody>
              {data.byBuilding.map((b) => {
                const rate = b.total ? (b.occupied / b.total) * 100 : 0;
                return (
                  <tr key={b.building}>
                    <td><strong>{b.building}</strong></td>
                    <td className="num">{b.total}</td>
                    <td className="num">{b.occupied}</td>
                    <td className="num">{fmtBaht(b.potential)}</td>
                    <td className="num positive">{fmtBaht(b.actual)}</td>
                    <td className="num negative">{fmtBaht(b.lost)}</td>
                    <td className="num">
                      <span className={`ac-rate-pill ${rate >= 80 ? "ok" : rate >= 50 ? "warn" : "bad"}`}>{rate.toFixed(0)}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
