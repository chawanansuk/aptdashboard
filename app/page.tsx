"use client";

import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useDashboardData } from "@/lib/useDashboardData";
import { useTabFocusRefresh } from "@/lib/useTabFocusRefresh";
import { invalidateFacilityCache } from "@/lib/facilityCache";
import type { RoomStatus, RoomView, SheetRow } from "@/types";
import TasksList from "@/components/TasksList";
import AppHeader from "@/components/AppHeader";
import AppSidebar from "@/components/AppSidebar";
import OverviewCards from "@/components/OverviewCards";
import RoomsView from "@/components/RoomsView";
import CommandPalette from "@/components/CommandPalette";
import { useCommandPalette } from "@/lib/useCommandPalette";
import type { CommandDef } from "@/lib/commandPaletteSearch";
import BottomNav, { type BottomNavView } from "@/components/BottomNav";
import RoomModal from "@/components/RoomModal";
import AddTaskModal from "@/components/AddTaskModal";
import BulkAddModal from "@/components/BulkAddModal";
import BulkActionBar from "@/components/BulkActionBar";
import SkeletonLoader from "@/components/SkeletonLoader";
import { parseThaiDate } from "@/lib/dateUtils";
import { loadPresets, addPreset, removePreset, type FilterPreset } from "@/lib/presets";
import { STATUS_KEYS, VIEW_LABEL, VIEW_TO_TASK_TYPE, isDoneStatus, isCancelledStatus } from "@/lib/constants";
import { canAccess, getDefaultRoute, type Route } from "@/lib/permissions";
import { useEffectiveRoles } from "@/lib/useEffectiveRoles";

// Heavy views — lazy-loaded so the default 'overview' page ships less JS
const IncomeView      = lazy(() => import("@/components/IncomeView"));
const TenantsView     = lazy(() => import("@/components/TenantsView"));
const CalendarView    = lazy(() => import("@/components/CalendarView"));
const MaintenanceView = lazy(() => import("@/components/MaintenanceView"));
const FacilitiesView  = lazy(() => import("@/components/FacilitiesView"));
const SummaryDrawer   = lazy(() => import("@/components/SummaryDrawer"));

function ViewLoading() {
  return <div className="ac-empty" style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>กำลังโหลด...</div>;
}

export default function Home() {
  const { status, rooms, errors, lastUpdated, refresh, tasks, isInitial, isRefreshing, optimisticUpdateRoom } =
    useDashboardData() as ReturnType<typeof useDashboardData> & { tasks: SheetRow[] };

  // ---- UI state ----
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  // ---- Role-based access (multi-role + view-as) ----
  useSession(); // initialize session so useEffectiveRoles can read it
  const { actualRoles, effectiveRoles } = useEffectiveRoles();
  // `effectiveRoles` drives UI; `actualRoles` is the server truth (used
  // anywhere we need to know "what can this user REALLY do")
  const roles = effectiveRoles.length ? effectiveRoles : actualRoles;
  // primary role for components that still take a single Role (badge etc.)
  const role = roles[0];

  // ---- Presets ----
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  useEffect(() => { setPresets(loadPresets()); }, []);

  // ---- Filter state ----
  const [activeBuilding, setActiveBuilding] = useState<string>("ทั้งหมด");
  const [activeFilter, setActiveFilter] = useState<"all" | RoomStatus>("all");
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState<"overview" | "today" | RoomStatus | "income" | "tenants" | "calendar" | "maintenance" | "facilities">("overview");
  const [dateRange, setDateRange] = useState<"all" | "week" | "month" | "custom">("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // ---- Selected room ----
  const [selectedRoom, setSelectedRoom] = useState<RoomView | null>(null);
  const [saving, setSaving] = useState(false);
  const [editStatus, setEditStatus] = useState("");
  const [editTenant, setEditTenant] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editContractEnd, setEditContractEnd] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editPrice, setEditPrice] = useState("");

  useEffect(() => {
    if (selectedRoom) {
      setEditStatus(selectedRoom.rawStatus || "");
      setEditTenant(selectedRoom.tenant || "");
      setEditPhone(selectedRoom.phone || "");
      setEditContractEnd(selectedRoom.contractEnd || "");
      setEditPrice(selectedRoom.price || "");
      setEditNote("");
    }
  }, [selectedRoom]);

  // ---- Add task ----
  const [showAddTask, setShowAddTask] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [tDate, setTDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [tType, setTType] = useState<string>("ย้ายเข้า");
  const [tBuilding, setTBuilding] = useState<string>("");
  const [tRoom, setTRoom] = useState<string>("");
  const [tCustomer, setTCustomer] = useState<string>("");
  const [tPhone, setTPhone] = useState<string>("");
  const [tNote, setTNote] = useState<string>("");

  // ---- Bulk ----
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [bulkAddType, setBulkAddType] = useState("ทำสะอาด");
  const [bulkAddDate, setBulkAddDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [bulkAddNote, setBulkAddNote] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // ---- Theme ----
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
    const prefersDark = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)').matches : false;
    const dark = saved ? saved === 'dark' : prefersDark;
    setIsDark(dark);
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', dark);
    }
  }, []);

  function toggleTheme() {
    setIsDark((prev) => {
      const next = !prev;
      if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', next);
      if (typeof window !== 'undefined') localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  }

  // ---- Toast auto-dismiss ----
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ---- Sidebar auto-close on resize ----
  useEffect(() => {
    const onResize = () => { if (window.innerWidth > 980) setSidebarOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ---- Route guard: redirect + toast if user lacks access ----
  // Fires on URL/preset hack, on role change, or after View-as switch
  // that excludes the current view. Uses actualRoles so we don't
  // bounce the user when they're just filtering UI via View-as
  // (View-as = sales but real role includes engineer → still allowed
  //  at server, but UI hides it; redirect to a route that's actually
  //  visible to the filtered view).
  useEffect(() => {
    if (!role) return; // session still loading
    // Guard against the *effective* role set so View-as also redirects
    if (!canAccess(roles, activeView as Route)) {
      const fallback = getDefaultRoute(roles);
      setActiveView(fallback);
      setToast({
        type: "err",
        msg: "ไม่มีสิทธิ์เข้าถึงหน้านี้",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, activeView, roles.join("|")]);

  // ---- Tab-focus refresh: when user returns to the tab, refetch the
  // dashboard and invalidate caches that don't auto-revalidate. Skips if
  // we refreshed within the last 30s.
  useTabFocusRefresh(() => {
    invalidateFacilityCache();
    refresh();
  });

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;

      if (e.key === "Escape") {
        if (selectedRoom) { setSelectedRoom(null); return; }
        if (showAddTask) { setShowAddTask(false); return; }
        if (summaryOpen) { setSummaryOpen(false); return; }
        if (sidebarOpen) { setSidebarOpen(false); return; }
        return;
      }
      if (isInput) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "/") {
        const input = document.querySelector<HTMLInputElement>(".ac-search input");
        if (input) { e.preventDefault(); input.focus(); input.select(); }
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        setShowAddTask(true);
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        if (!isRefreshing) refresh();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedRoom, showAddTask, summaryOpen, sidebarOpen, isRefreshing, refresh]);

  // ---- Derived data ----
  const buildings = useMemo(() => {
    const set = new Set<string>();
    rooms.forEach((r) => r.building && set.add(r.building));
    return Array.from(set).sort();
  }, [rooms]);

  const buildingTabs = useMemo(() => ["ทั้งหมด", ...buildings], [buildings]);

  const visibleRooms = useMemo(() => {
    if (activeView === "income" || activeView === "tenants" || activeView === "calendar" || activeView === "maintenance" || activeView === "facilities") return [];
    return rooms.filter((r) => {
      if (activeBuilding !== "ทั้งหมด" && r.building !== activeBuilding) return false;
      if (activeView === "today" && !r.today) return false;
      if (activeView !== "overview" && activeView !== "today" && r.status !== activeView) return false;
      if (activeFilter !== "all" && r.status !== activeFilter) return false;
      const q = search.trim().toLowerCase();
      if (q) {
        const hay = `${r.room} ${r.building} ${r.tenant || ""} ${r.phone || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rooms, activeBuilding, activeView, activeFilter, search]);

  const dateBounds = useMemo<{ start: Date | null; end: Date | null }>(() => {
    if (activeView === "today" || dateRange === "all") return { start: null, end: null };
    const now = new Date();
    const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (dateRange === "week") {
      const day = now.getDay();
      const diffToMon = (day + 6) % 7;
      const start = startOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMon));
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999);
      return { start, end };
    }
    if (dateRange === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start, end };
    }
    if (dateRange === "custom") {
      const s = customStart ? new Date(customStart + "T00:00:00") : null;
      const e = customEnd ? new Date(customEnd + "T23:59:59.999") : null;
      return { start: s, end: e };
    }
    return { start: null, end: null };
  }, [dateRange, customStart, customEnd, activeView]);

  const visibleTasks = useMemo(() => {
    const list = (tasks || []).slice();
    const types = activeView === "today" ? null : VIEW_TO_TASK_TYPE[activeView as RoomStatus];
    return list.filter((t) => {
      if (activeBuilding !== "ทั้งหมด" && t.building !== activeBuilding) return false;
      if (types && !types.includes(t.type)) return false;
      if (activeView === "today") {
        const d = new Date();
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const today = `${dd}/${mm}/${d.getFullYear()}`;
        if (t.date !== today) return false;
        if (isDoneStatus(t.status) || isCancelledStatus(t.status)) return false;
      }
      if (activeView !== "today" && (dateBounds.start || dateBounds.end)) {
        const td = parseThaiDate(t.date);
        if (!td) return false;
        if (dateBounds.start && td.getTime() < dateBounds.start.getTime()) return false;
        if (dateBounds.end && td.getTime() > dateBounds.end.getTime()) return false;
      }
      const q = search.trim().toLowerCase();
      if (q) {
        const hay = `${t.room} ${t.building} ${t.customer || ""} ${t.phone || ""} ${t.note || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }, [tasks, activeView, activeBuilding, search, dateBounds]);

  const showTasksView = activeView === "today" || activeView === "moveout" || activeView === "qc" || activeView === "repair";
  const showCustomView = activeView === "income" || activeView === "tenants" || activeView === "calendar" || activeView === "maintenance" || activeView === "facilities";
  const showRoomGrid = !showTasksView && !showCustomView && !(isInitial && rooms.length === 0);

  const sidebarCounts = useMemo(() => {
    const scope = activeBuilding === "ทั้งหมด" ? rooms : rooms.filter((r) => r.building === activeBuilding);
    const c: Record<string, number> = { today: 0 };
    STATUS_KEYS.forEach((k) => (c[k] = 0));
    scope.forEach((r) => { c[r.status]++; if (r.today) c.today++; });
    return { ...c, total: scope.length } as { total: number; today: number } & Partial<Record<RoomStatus, number>>;
  }, [rooms, activeBuilding]);

  // ---- Bulk helpers ----
  function toggleBulkRoom(building: string, room: string) {
    const k = `${building}|${room}`;
    setBulkSelected((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }
  function exitBulk() { setBulkMode(false); setBulkSelected(new Set()); }

  async function submitBulkAdd() {
    if (bulkSelected.size === 0) return;
    setBulkSubmitting(true);
    let okCount = 0, failCount = 0;
    const items = Array.from(bulkSelected).map((k) => {
      const [building, room] = k.split("|");
      return { building, room };
    });
    for (const item of items) {
      try {
        const res = await fetch("/api/sheet/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "addTask",
            date: bulkAddDate, type: bulkAddType,
            building: item.building, room: item.room,
            note: bulkAddNote,
          }),
        });
        const data = await res.json();
        if (data.ok) okCount++; else failCount++;
      } catch { failCount++; }
    }
    setBulkSubmitting(false);
    setBulkAddOpen(false);
    if (failCount === 0) {
      setToast({ type: "ok", msg: `เพิ่ม ${okCount} งานสำเร็จ` });
      exitBulk();
    } else {
      setToast({ type: "err", msg: `สำเร็จ ${okCount}, ล้มเหลว ${failCount}` });
    }
    refresh();
  }

  // ---- Add task helpers ----
  function openAddTaskForRoom(building: string, room: string) {
    setTBuilding(building);
    setTRoom(room);
    setSelectedRoom(null);
    setShowAddTask(true);
  }

  /** Open Add-task pre-filled for a maintenance entry (v3.7.0). */
  function openMaintenanceTask(building: string, room: string, note: string) {
    setTType("ทำสะอาด");
    setTBuilding(building);
    setTRoom(room);
    setTNote(note);
    setSelectedRoom(null);
    setShowAddTask(true);
  }

  /** Quick "แจ้งซ่อม" — pre-fill AddTaskModal with type=ซ่อม for the room. */
  function openRepairForRoom(r: { building: string; room: string }) {
    setTType("ซ่อม");
    setTBuilding(r.building);
    setTRoom(r.room);
    setTNote("");
    setSelectedRoom(null);
    setShowAddTask(true);
  }

  // ---- Command palette (Cmd+K / Ctrl+K / `/`) ----
  const cmdk = useCommandPalette();
  const paletteCommands = useMemo<CommandDef[]>(() => [
    {
      id: "addTask",
      label: "เพิ่มงานใหม่",
      hint: "Add task",
      requires: { action: "task.add" },
      run: () => setShowAddTask(true),
    },
    {
      id: "refresh",
      label: "Refresh ข้อมูล",
      hint: "ดึงข้อมูลใหม่จากชีต",
      run: () => refresh(),
    },
    {
      id: "toggleTheme",
      label: isDark ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด",
      hint: "Dark mode toggle",
      run: () => toggleTheme(),
    },
    {
      id: "openSummary",
      label: "เปิด Summary",
      hint: "สรุปภาพรวมทั้งหมด",
      run: () => setSummaryOpen(true),
    },
  ], [isDark]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAddTask() {
    if (!tBuilding || !tRoom) { setToast({ type: "err", msg: "กรอกตึกและเลขห้อง" }); return; }
    setSavingTask(true);
    try {
      const res = await fetch("/api/sheet/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addTask",
          date: tDate, type: tType, building: tBuilding, room: tRoom,
          customer: tCustomer, phone: tPhone, note: tNote,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setToast({ type: "ok", msg: "เพิ่มงานแล้ว — รีเฟรชข้อมูล" });
        setShowAddTask(false);
        setTCustomer(""); setTPhone(""); setTNote(""); setTRoom("");
        refresh();
      } else {
        setToast({ type: "err", msg: data.error || "เพิ่มงานไม่สำเร็จ" });
      }
    } catch (e: unknown) {
      setToast({ type: "err", msg: e instanceof Error ? e.message : "Network error" });
    } finally { setSavingTask(false); }
  }

  async function handleSave() {
    if (!selectedRoom) return;
    setSaving(true);
    try {
      const res = await fetch("/api/sheet/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateRoomStatus",
          building: selectedRoom.building, room: selectedRoom.room,
          status: editStatus, tenant: editTenant, phone: editPhone,
          contractEnd: editContractEnd, note: editNote, price: editPrice,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setToast({ type: "ok", msg: "บันทึกแล้ว — รีเฟรชข้อมูล" });
        // Optimistic local update — shows the change immediately even if the
        // canonical CSV publish behind /api/sheet/rooms hasn't refreshed yet
        optimisticUpdateRoom(selectedRoom.building, selectedRoom.room, {
          status: editStatus,
          tenant: editTenant,
          phone: editPhone,
          contractEnd: editContractEnd,
          price: editPrice,
        });
        setSelectedRoom(null);
        refresh();
      } else {
        setToast({ type: "err", msg: data.error || "บันทึกไม่สำเร็จ" });
      }
    } catch (e) {
      setToast({ type: "err", msg: e instanceof Error ? e.message : "Network error" });
    } finally { setSaving(false); }
  }

  // ---- Preset helpers ----
  function applyPreset(p: FilterPreset) {
    setActiveView(p.view as typeof activeView);
    setActiveBuilding(p.building);
    setDateRange(p.dateRange as typeof dateRange);
    setCustomStart(p.customStart);
    setCustomEnd(p.customEnd);
    setSearch(p.search);
    setPresetMenuOpen(false);
  }
  function saveCurrentAsPreset() {
    const name = window.prompt("ตั้งชื่อชุด filter นี้:", "");
    if (!name || !name.trim()) return;
    const created = addPreset({
      name: name.trim(),
      view: String(activeView),
      building: activeBuilding,
      dateRange: dateRange,
      customStart, customEnd, search,
    });
    setPresets((list) => [...list, created]);
    setToast({ type: "ok", msg: `บันทึกชุด "${created.name}" แล้ว` });
  }
  function deletePresetById(id: string) {
    removePreset(id);
    setPresets((list) => list.filter((p) => p.id !== id));
  }

  return (
    <div className="ac-app">
      <AppHeader
        buildings={buildingTabs}
        activeBuilding={activeBuilding}
        onChangeBuilding={setActiveBuilding}
        isRefreshing={isRefreshing}
        lastUpdated={lastUpdated}
        isDark={isDark}
        onAddTask={() => setShowAddTask(true)}
        onRefresh={refresh}
        onToggleTheme={toggleTheme}
        onOpenSummary={() => setSummaryOpen(true)}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onOpenSearch={() => cmdk.setOpen(true)}
      />

      <div className="ac-body">
        <AppSidebar
          isOpen={sidebarOpen}
          activeView={activeView}
          onChangeView={setActiveView}
          counts={sidebarCounts}
          onBackdropClick={() => setSidebarOpen(false)}
          roles={roles}
        />

        <main className="ac-main">
          {errors.length > 0 && (
            <div className="ac-banner ac-banner-warn">
              <strong>⚠ มีปัญหาในการโหลดข้อมูล:</strong>{" "}
              {errors.map((e, i) => (<span key={i}>{e}{i < errors.length - 1 ? " • " : ""}</span>))}
              <button className="ac-btn ac-btn-ghost ac-btn-sm" onClick={refresh} disabled={isRefreshing} style={{ marginLeft: 8 }}>
                {isRefreshing ? "กำลังลอง..." : "ลองอีกครั้ง"}
              </button>{" "}
              <a href="https://github.com/chawanansuk/aptdashboard/blob/main/docs/SETUP.md" target="_blank" rel="noreferrer">วิธีตั้งค่า</a>
            </div>
          )}

          {isInitial && rooms.length === 0 && status !== "error" && <SkeletonLoader />}

          {activeView === "overview" && rooms.length > 0 && (
            <OverviewCards
              rooms={rooms}
              tasks={tasks}
              activeBuilding={activeBuilding}
              roles={roles}
              onNavigate={(v) => setActiveView(v)}
            />
          )}

          {showRoomGrid && (
            <RoomsView
              visibleRooms={visibleRooms}
              activeFilter={activeFilter}
              onChangeFilter={setActiveFilter}
              search={search}
              onChangeSearch={setSearch}
              bulkMode={bulkMode}
              bulkSelected={bulkSelected}
              onToggleBulkMode={() => bulkMode ? exitBulk() : setBulkMode(true)}
              onToggleBulkRoom={toggleBulkRoom}
              onSelectRoom={(r) => setSelectedRoom(r)}
              roles={roles}
              onRepairRoom={openRepairForRoom}
            />
          )}

          {showTasksView && (
            <>
              <section className="ac-fb">
                <div className="ac-search ac-search-full">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                  <input type="text" placeholder="ค้นหา ห้อง / ตึก / ลูกค้า / เบอร์ / หมายเหตุ..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="ac-preset-wrap">
                  <button
                    className="ac-btn ac-btn-ghost ac-btn-sm"
                    onClick={() => setPresetMenuOpen((v) => !v)}
                    title="ชุด filter ที่บันทึกไว้"
                  >★ ชุด {presets.length > 0 && `(${presets.length})`}</button>
                  {presetMenuOpen && (
                    <>
                      <div className="ac-preset-backdrop" onClick={() => setPresetMenuOpen(false)} />
                      <div className="ac-preset-menu">
                        <button className="ac-preset-item ac-preset-save" onClick={() => { saveCurrentAsPreset(); setPresetMenuOpen(false); }}>
                          + บันทึกชุดปัจจุบัน
                        </button>
                        {presets.length === 0 && (
                          <div className="ac-preset-empty">ยังไม่มีชุดที่บันทึก</div>
                        )}
                        {presets.map((p) => (
                          <div key={p.id} className="ac-preset-row">
                            <button className="ac-preset-item" onClick={() => applyPreset(p)}>
                              <span>{p.name}</span>
                              <small>{p.view} · {p.building} · {p.dateRange}</small>
                            </button>
                            <button className="ac-preset-del" onClick={() => deletePresetById(p.id)} title="ลบ">×</button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </section>
              {activeView !== "today" && (
                <section className="ac-fb ac-date-range">
                  <div className="ac-chips">
                    {([
                      { key: "all", label: "ทั้งหมด" },
                      { key: "week", label: "สัปดาห์นี้" },
                      { key: "month", label: "เดือนนี้" },
                      { key: "custom", label: "เลือกช่วง" },
                    ] as const).map((c) => (
                      <button
                        key={c.key}
                        className={`ac-chip ${dateRange === c.key ? "is-active" : ""}`}
                        onClick={() => setDateRange(c.key)}
                      >{c.label}</button>
                    ))}
                  </div>
                  {dateRange === "custom" && (
                    <div className="ac-range-inputs">
                      <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                      <span>—</span>
                      <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                    </div>
                  )}
                </section>
              )}
              <TasksList
                tasks={visibleTasks}
                title={VIEW_LABEL[activeView as string] || "งาน"}
                emptyText="ไม่มีงานในรายการนี้"
                onChanged={refresh}
              />
            </>
          )}

          {activeView === "income" && (
            <Suspense fallback={<ViewLoading />}>
              <IncomeView rooms={rooms} activeBuilding={activeBuilding} />
            </Suspense>
          )}
          {activeView === "tenants" && (
            <Suspense fallback={<ViewLoading />}>
              <TenantsView rooms={rooms} activeBuilding={activeBuilding} onSelectRoom={(r) => setSelectedRoom(r)} />
            </Suspense>
          )}
          {activeView === "calendar" && (
            <Suspense fallback={<ViewLoading />}>
              <CalendarView tasks={tasks} activeBuilding={activeBuilding} rooms={rooms} onSelectRoom={(r) => setSelectedRoom(r)} />
            </Suspense>
          )}
          {activeView === "maintenance" && (
            <Suspense fallback={<ViewLoading />}>
              <MaintenanceView
                activeBuilding={activeBuilding}
                onScheduleService={openMaintenanceTask}
              />
            </Suspense>
          )}
          {activeView === "facilities" && (
            <Suspense fallback={<ViewLoading />}>
              <FacilitiesView
                buildings={buildings}
                activeBuilding={activeBuilding}
                onScheduleService={openMaintenanceTask}
              />
            </Suspense>
          )}
        </main>
      </div>

      <BottomNav
        activeView={activeView}
        roles={roles}
        onNavigate={(v: BottomNavView) => setActiveView(v)}
        onAddTask={() => setShowAddTask(true)}
      />

      <CommandPalette
        open={cmdk.open}
        onClose={() => cmdk.setOpen(false)}
        rooms={rooms}
        roles={roles}
        commands={paletteCommands}
        onSelectRoom={(r) => setSelectedRoom(r)}
        onChangeView={(v) => setActiveView(v)}
      />

      <AddTaskModal
        open={showAddTask}
        saving={savingTask}
        buildings={buildings}
        date={tDate} type={tType} building={tBuilding} room={tRoom}
        customer={tCustomer} phone={tPhone} note={tNote}
        onChange={(p) => {
          if (p.date !== undefined) setTDate(p.date);
          if (p.type !== undefined) setTType(p.type);
          if (p.building !== undefined) setTBuilding(p.building);
          if (p.room !== undefined) setTRoom(p.room);
          if (p.customer !== undefined) setTCustomer(p.customer);
          if (p.phone !== undefined) setTPhone(p.phone);
          if (p.note !== undefined) setTNote(p.note);
        }}
        onClose={() => setShowAddTask(false)}
        onSubmit={handleAddTask}
      />

      {selectedRoom && (
        <RoomModal
          room={selectedRoom}
          saving={saving}
          status={editStatus} tenant={editTenant} phone={editPhone}
          contractEnd={editContractEnd} note={editNote} price={editPrice}
          onChange={(p) => {
            if (p.status !== undefined) setEditStatus(p.status);
            if (p.tenant !== undefined) setEditTenant(p.tenant);
            if (p.phone !== undefined) setEditPhone(p.phone);
            if (p.contractEnd !== undefined) setEditContractEnd(p.contractEnd);
            if (p.note !== undefined) setEditNote(p.note);
            if (p.price !== undefined) setEditPrice(p.price);
          }}
          onClose={() => setSelectedRoom(null)}
          onSave={handleSave}
          onAddTaskHere={() => openAddTaskForRoom(selectedRoom.building, selectedRoom.room)}
        />
      )}

      {bulkMode && (
        <BulkActionBar
          count={bulkSelected.size}
          onClear={() => setBulkSelected(new Set())}
          onAdd={() => setBulkAddOpen(true)}
          onExit={exitBulk}
        />
      )}

      <BulkAddModal
        open={bulkAddOpen}
        selectedKeys={Array.from(bulkSelected)}
        date={bulkAddDate} type={bulkAddType} note={bulkAddNote}
        submitting={bulkSubmitting}
        onChangeDate={setBulkAddDate}
        onChangeType={setBulkAddType}
        onChangeNote={setBulkAddNote}
        onClose={() => setBulkAddOpen(false)}
        onSubmit={submitBulkAdd}
      />

      {toast && (
        <div className={`ac-toast ${toast.type === "ok" ? "ac-toast-ok" : "ac-toast-err"}`}>
          {toast.msg}
        </div>
      )}

      {summaryOpen && (
        <Suspense fallback={null}>
          <SummaryDrawer
            open={summaryOpen}
            onClose={() => setSummaryOpen(false)}
            rooms={rooms}
            tasks={tasks}
            onAddTask={() => {
              setSummaryOpen(false);
              setShowAddTask(true);
            }}
            onTaskClick={() => {
              setSummaryOpen(false);
              setActiveView("today");
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
