"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RoomRow, RoomStatus, RoomView, SheetRow } from "@/types";

const STATUS_FROM_ROOM: Record<string, RoomStatus> = {
  "มีคนอยู่": "occupied",
  "มีผู้เช่า": "occupied",
  "อยู่": "occupied",
  "ว่าง": "ready",
  "พร้อมขาย": "ready",
  "ปรับปรุง": "repair",
  "รอเข้าซ่อม": "repair",
  "รอสัญญา": "pending",
  "แจ้งย้ายออก": "moveout",
  "รอตรวจ": "qc",
  "QC": "qc",
  "ไม่ได้ใช้งาน": "inactive",
};

function parseDateDMY(s: string): Date | null {
  if (!s) return null;
  const parts = s.split(/[\/\-.]/);
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map((p) => parseInt(p, 10));
  if (!d || !m || !y) return null;
  const yy = y < 100 ? 2000 + y : y;
  return new Date(yy, m - 1, d);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function todayKey(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function buildingRoomKey(b: string, r: string): string {
  return `${(b || "").trim()}|${(r || "").trim()}`;
}

export function mergeRoomsAndTasks(
  rooms: RoomRow[],
  tasks: SheetRow[]
): RoomView[] {
  const today = startOfDay(new Date());
  const tKey = todayKey();

  // index tasks by building+room
  const tasksByRoom = new Map<string, SheetRow[]>();
  for (const t of tasks) {
    const k = buildingRoomKey(t.building, t.room);
    if (!tasksByRoom.has(k)) tasksByRoom.set(k, []);
    tasksByRoom.get(k)!.push(t);
  }

  return rooms.map<RoomView>((r) => {
    const k = buildingRoomKey(r.building, r.room);
    const all = tasksByRoom.get(k) || [];

    const todayTasks = all.filter(
      (t) => t.date === tKey && t.status !== "เสร็จ"
    );
    const upcomingTasks = all.filter((t) => {
      if (t.status === "เสร็จ") return false;
      const d = parseDateDMY(t.date);
      return d && startOfDay(d).getTime() >= today.getTime();
    });

    // base status from rooms sheet
    const baseRaw = (r.status || "").trim();
    let status: RoomStatus = STATUS_FROM_ROOM[baseRaw] || "inactive";

    // override by upcoming tasks
    const hasMoveOut = upcomingTasks.some((t) => t.type === "ย้ายออก");
    const hasView = upcomingTasks.some((t) => t.type === "ชมห้อง");
    const hasMoveIn = upcomingTasks.some((t) => t.type === "ย้ายเข้า");
    const hasCleanPending = upcomingTasks.some(
      (t) => t.type === "ทำสะอาด"
    );

    if (status === "occupied" && hasMoveOut) status = "moveout";
    else if (status === "ready" && hasMoveIn) status = "pending";
    else if (status === "ready" && hasView) status = "pending";
    else if (status === "ready" && hasCleanPending) status = "qc";

    return {
      building: r.building,
      room: r.room,
      floor: r.floor,
      price: r.price,
      status,
      rawStatus: baseRaw,
      tenant: r.tenant,
      phone: r.phone,
      contractEnd: r.contractEnd,
      today: todayTasks.length > 0,
      todayTasks,
      upcomingTasks,
    };
  });
}

export interface DashboardState {
  status: "idle" | "loading" | "ok" | "error";
  rooms: RoomView[];
  tasks: SheetRow[];
  errors: string[];
  lastUpdated: string;
  refresh: () => void;
}

export function useDashboardData(): DashboardState {
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [tasks, setTasks] = useState<SheetRow[]>([]);
  const [status, setStatus] = useState<DashboardState["status"]>("idle");
  const [errors, setErrors] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      setStatus("loading");
      const errs: string[] = [];
      try {
        const [rRes, tRes] = await Promise.all([
          fetch("/api/sheet/rooms", { cache: "no-store" }).catch((e) => {
            errs.push("rooms: " + e.message);
            return null;
          }),
          fetch("/api/sheet", { cache: "no-store" }).catch((e) => {
            errs.push("tasks: " + e.message);
            return null;
          }),
        ]);

        let rRooms: RoomRow[] = [];
        let rTasks: SheetRow[] = [];

        if (rRes) {
          const j = await rRes.json();
          if (j.error) errs.push("rooms: " + j.error);
          else rRooms = j.rooms || [];
        }
        if (tRes) {
          const j = await tRes.json();
          if (j.error) errs.push("tasks: " + j.error);
          else rTasks = j.rows || [];
        }

        if (!alive) return;
        setRooms(rRooms);
        setTasks(rTasks);
        setErrors(errs);
        setLastUpdated(new Date().toLocaleTimeString("th-TH"));
        setStatus(errs.length && rRooms.length === 0 ? "error" : "ok");
      } catch (e) {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : "unknown";
        setErrors([msg]);
        setStatus("error");
      }
    };
    run();
    return () => {
      alive = false;
    };
  }, [tick]);

  const merged = useMemo(() => mergeRoomsAndTasks(rooms, tasks), [rooms, tasks]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return {
    status,
    rooms: merged,
    tasks,
    errors,
    lastUpdated,
    refresh,
  };
}
