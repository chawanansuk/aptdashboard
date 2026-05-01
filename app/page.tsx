"use client";

import { useEffect, useMemo, useState } from "react";
import { useDashboardData } from "@/lib/useDashboardData";
import type { RoomStatus, RoomView, SheetRow } from "@/types";
import TasksList from "@/components/TasksList";

const STATUS_LABEL: Record<RoomStatus, string> = {
  occupied: "มีผู้เช่า",
  ready: "พร้อมขาย",
  pending: "รอสัญญา",
  moveout: "แจ้งย้ายออก",
  qc: "รอตรวจ/QC",
  repair: "รอเข้าซ่อม",
  inactive: "ไม่ได้ใช้งาน",
};

const STATUS_DOT: Record<RoomStatus, string> = {
  occupied: "#1E293B",
  ready: "#22C55E",
  pending: "#A855F7",
  moveout: "#EF4444",
  qc: "#F97316",
  repair: "#EAB308",
  inactive: "#E2E8F0",
};

const STATUS_KEYS: RoomStatus[] = ["occupied","ready","pending","moveout","qc","repair","inactive"];

const FILTER_CHIPS: { key: "all" | RoomStatus; label: string }[] = [
  { key: "all", label: "ทุกสถานะ" },
  { key: "ready", label: "ว่าง" },
  { key: "moveout", label: "แจ้งย้ายออก" },
  { key: "repair", label: "รอซ่อม" },
];

const RAW_STATUS_OPTIONS = ["มีคนอยู่", "ว่าง", "รอสัญญา", "แจ้งย้ายออก", "ปรับปรุง"];

function fmtPrice(p: string) {
  const n = parseInt((p || "").replace(/[^0-9]/g, ""), 10);
  if (!n) return "-";
  return n.toLocaleString("th-TH");
}

function isDoneStatus(s: string): boolean {
  const t = (s || "").trim();
  return t === "เสร็จ" || t === "done" || t === "ปิดแล้ว";
}
function isCancelledStatus(s: string): boolean {
  const t = (s || "").trim();
  return t === "ยกเลิก" || t === "cancelled";
}

// Map sidebar task views to ประเภทงาน in sheet
const VIEW_TO_TASK_TYPE: Partial<Record<RoomStatus, string[]>> = {
  moveout: ["ย้ายออก"],
  qc: ["ทำสะอาด"],
  repair: ["ซ่อม"],
};

const VIEW_LABEL: Record<string, string> = {
  today: "งานวันนี้",
  moveout: "งานย้ายออก",
  qc: "งานทำสะอาด/QC",
  repair: "งานรอซ่อม",
};

export default function Home() {
  const { status, rooms, errors, lastUpdated, refresh, tasks } = useDashboardData() as ReturnType<typeof useDashboardData> & { tasks: SheetRow[] };

  const buildings = useMemo(() => {
    const set = new Set<string>();
    rooms.forEach((r) => r.building && set.add(r.building));
    return Array.from(set).sort();
  }, [rooms]);

  const [activeBuilding, setActiveBuilding] = useState<string>("ทั้งหมด");
  const [activeFilter, setActiveFilter] = useState<"all" | RoomStatus>("all");
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState<"overview" | "today" | RoomStatus>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<RoomView | null>(null);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  // add-task state
  const [showAddTask, setShowAddTask] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [tDate, setTDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [tType, setTType] = useState<string>("ย้ายเข้า");
  const [tBuilding, setTBuilding] = useState<string>("");
  const [tRoom, setTRoom] = useState<string>("");
  const [tCustomer, setTCustomer] = useState<string>("");
  const [tPhone, setTPhone] = useState<string>("");
  const [tNote, setTNote] = useState<string>("");

  // edit state for room modal
  const [saving, setSaving] = useState(false);
  const [editStatus, setEditStatus] = useState("");
  const [editTenant, setEditTenant] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editContractEnd, setEditContractEnd] = useState("");
  const [editNote, setEditNote] = useState("");

  useEffect(() => {
    if (selectedRoom) {
      setEditStatus(selectedRoom.rawStatus || "");
      setEditTenant(selectedRoom.tenant || "");
      setEditPhone(selectedRoom.phone || "");
      setEditContractEnd(selectedRoom.contractEnd
