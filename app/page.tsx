"use client";

import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useDashboardData } from "@/lib/useDashboardData";
import { useVehicleCountByRoom } from "@/lib/useVehicleCountByRoom";
import { useAssetAlertCounts } from "@/lib/useAssetAlertCounts";
import { usePersistedString } from "@/lib/usePersistedString";
import { useEquipmentCountByRoom } from "@/lib/useEquipmentCountByRoom";
import { useTabFocusRefresh } from "@/lib/useTabFocusRefresh";
import { invalidateFacilityCache } from "@/lib/facilityCache";
import type { RoomStatus, RoomView, SheetRow } from "@/types";
import TasksList from "@/components/TasksList";
import AppHeader from "@/components/AppHeader";
import AppSidebar from "@/components/AppSidebar";
import OverviewCards from "@/components/OverviewCards";
import InsightsCards from "@/components/InsightsCards";
import RecentTasks from "@/components/RecentTasks";
import KeyboardHelpModal from "@/components/KeyboardHelpModal";
import ServiceDueBanner from "@/components/ServiceDueBanner";
import RoomsView from "@/components/RoomsView";
import CommandPalette from "@/components/CommandPalette";
import { useCommandPalette } from "@/lib/useCommandPalette";
import type { CommandDef } from "@/lib/commandPaletteSearch";
import BottomNav, { type BottomNavView } from "@/components/BottomNav";
import RoomModal from "@/components/RoomModal";
import BookingConfirmModal, { type BookingSaveData } from "@/components/BookingConfirmModal";
import AddTaskModal from "@/components/AddTaskModal";
import BulkAddModal from "@/components/BulkAddModal";
import EditTaskModal from "@/components/EditTaskModal";
import { buildNotifications } from "@/lib/notifications";
import BulkActionBar from "@/components/BulkActionBar";
import SkeletonLoader from "@/components/SkeletonLoader";
import { parseThaiDate } from "@/lib/dateUtils";
import { loadPresets, addPreset, removePreset, type FilterPreset } from "@/lib/presets";
import { STATUS_KEYS, VIEW_LABEL, VIEW_TO_TASK_TYPE, isDoneStatus, isCancelledStatus } from "@/lib/constants";
import {
  MOVEOUT_PREP_KINDS,
  hasOpenPrepTask,
  todayThaiDate as moveoutTodayThaiDate,
} from "@/lib/moveoutTasks";
import { canAccess, getDefaultRoute, type Route } from "@/lib/permissions";
import { useEffectiveRoles } from "@/lib/useEffectiveRoles";
import { parseCostInput } from "@/lib/taskCost";
import { getModeConfig, type GreetingStats } from "@/lib/modeConfig";
import WelcomeHero from "@/components/WelcomeHero";
import {
  SalesPipelineSkeleton,
  EngineerKanbanSkeleton,
  TenantsSkeleton,
  CalendarSkeleton,
  MaintenanceSkeleton,
  FacilitiesSkeleton,
  IncomeSkeleton,
} from "@/components/skeletons/ViewSkeletons";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { toast } from "@/lib/toast";
import { publishBusEvent } from "@/lib/realtimeBus";

// Heavy views — lazy-loaded so the default 'overview' page ships less JS
const IncomeView      = lazy(() => import("@/components/IncomeView"));
const TenantsView     = lazy(() => import("@/components/TenantsView"));
const SalesPipelineView = lazy(() => import("@/components/SalesPipelineView"));
const EngineerKanban    = lazy(() => import("@/components/EngineerKanban"));
const CalendarView    = lazy(() => import("@/components/CalendarView"));
const MaintenanceView = lazy(() => import("@/components/MaintenanceView"));
const FacilitiesView  = lazy(() => import("@/components/FacilitiesView"));
const PartsView       = lazy(() => import("@/components/PartsView"));
const VehiclesView    = lazy(() => import("@/components/VehiclesView"));
const LeadsView       = lazy(() => import("@/components/LeadsView"));
const RecurringView   = lazy(() => import("@/components/RecurringView"));
const MaintenanceTodaySection = lazy(() => import("@/components/MaintenanceTodaySection"));
const SummaryDrawer   = lazy(() => import("@/components/SummaryDrawer"));
const ReportsView     = lazy(() => import("@/components/ReportsView"));

export default function Home() {
  const { status, rooms, errors, lastUpdated, refresh, tasks, isInitial, isRefreshing, optimisticUpdateRoom, optimisticAddTask } =
    useDashboardData() as ReturnType<typeof useDashboardData> & { tasks: SheetRow[] };

  // Vehicle counts per room — used to render 🏍 N badge on RoomCard.
  // Independent fetch from rooms/tasks since vehicles have different
  // refresh cadence (Task 30 follow-up).
  const vehicleCounts = useVehicleCountByRoom();
  const equipmentCounts = useEquipmentCountByRoom();

  // ---- UI state ----
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Desktop sidebar rail mode (#4). Persisted so power users who live
  // in rail mode don't get expanded on every reload. "1" = collapsed.
  const [sidebarCollapsedRaw, setSidebarCollapsedRaw] = usePersistedString(
    "sidebarCollapsed",
    "0",
    (v) => v === "0" || v === "1",
  );
  const sidebarCollapsed = sidebarCollapsedRaw === "1";
  const toggleSidebarCollapse = () => setSidebarCollapsedRaw(sidebarCollapsed ? "0" : "1");

  // ---- Role-based access (multi-role + view-as) ----
  useSession(); // initialize session so useEffectiveRoles can read it
  const { actualRoles, effectiveRoles } = useEffectiveRoles();
  // `effectiveRoles` drives UI; `actualRoles` is the server truth (used
  // anywhere we need to know "what can this user REALLY do")
  const roles = effectiveRoles.length ? effectiveRoles : actualRoles;
  // primary role for components that still take a single Role (badge etc.)
  const role = roles[0];

  // Asset alert counts — only fetch when user has engineer-side access.
  // Skips parts+maintenance API calls for sales role entirely.
  const assetAlerts = useAssetAlertCounts(canAccess(roles, "parts") || canAccess(roles, "maintenance"));

  // Header notification dropdown — derived from live data. Role filtering
  // happens inside buildNotifications so the bell badge matches the
  // dropdown contents (no item the user can't actually navigate to).
  const notifications = useMemo(
    () => buildNotifications({
      tasks: tasks || [],
      rooms: rooms || [],
      roles,
      assetAlerts: {
        lowStockParts: assetAlerts.lowStockParts,
        overdueEquipment: assetAlerts.overdueEquipment,
      },
    }),
    [tasks, rooms, roles, assetAlerts.lowStockParts, assetAlerts.overdueEquipment],
  );

  // ---- Mode personality (PR-O) ----
  // Derive the mode config from effective roles. View-as swap → mode swap.
  const modeConfig = useMemo(() => getModeConfig(effectiveRoles), [effectiveRoles]);
  // Set <html data-mode> so the accent CSS var swaps across the whole app
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-mode", modeConfig.mode);
  }, [modeConfig.mode]);

  // Mode-driven landing view: send the user to their mode's home page
  // (sales → salespipeline, engineer → engineerkanban, mgmt → overview)
  // on first load AND whenever they switch View-as. We track the last
  // mode the user "landed" on; switching mode re-applies the landing.
  const lastLandedModeRef = useRef<string | null>(null);

  // ---- Presets ----
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  useEffect(() => { setPresets(loadPresets()); }, []);

  // ---- Filter state ----
  // Persist activeBuilding + activeView across reloads — UX: user
  // refreshes page and lands back in their last context (sales had
  // "ตึก KL" + "ภาพรวมขาย" view → see same on next visit).
  const [activeBuilding, setActiveBuilding] = usePersistedString("activeBuilding", "ทั้งหมด");
  type ActiveFilter = "all" | RoomStatus;
  const VALID_FILTERS: ActiveFilter[] = [
    "all", "occupied", "ready", "pending", "moveout", "qc", "repair", "inactive",
  ];
  const [activeFilterRaw, setActiveFilterRaw] = usePersistedString(
    "activeFilter",
    "all",
    (v) => (VALID_FILTERS as string[]).includes(v),
  );
  const activeFilter = activeFilterRaw as ActiveFilter;
  const setActiveFilter = (v: ActiveFilter) => setActiveFilterRaw(v);
  const [search, setSearch] = useState("");
  type ActiveView = "overview" | "today" | RoomStatus | "income" | "tenants" | "calendar" | "maintenance" | "facilities" | "parts" | "vehicles" | "leads" | "recurring" | "salespipeline" | "engineerkanban" | "reports";
  const VALID_VIEWS: ActiveView[] = [
    "overview", "today", "occupied", "ready", "pending", "moveout", "qc", "repair", "inactive",
    "income", "tenants", "calendar", "maintenance", "facilities", "parts", "vehicles", "leads", "recurring",
    "salespipeline", "engineerkanban", "reports",
  ];
  const [activeViewRaw, setActiveViewRaw] = usePersistedString(
    "activeView",
    "overview",
    (v) => (VALID_VIEWS as string[]).includes(v),
  );
  const activeView = activeViewRaw as ActiveView;
  const setActiveView = (v: ActiveView) => setActiveViewRaw(v);
  // Re-apply mode default landing view whenever the effective mode
  // changes (initial load OR View-as switch). Without this, switching
  // from sales → engineer would leave activeView on a sales-only route
  // and trigger the "ไม่มีสิทธิ์เข้าถึงหน้านี้" toast incorrectly.
  useEffect(() => {
    if (!effectiveRoles || effectiveRoles.length === 0) {
      // Sign-out / role-loss: reset the ref so a NEW user who signs in
      // within the same SPA session will still get redirected to their
      // landing view (previous ref would mark "already landed").
      lastLandedModeRef.current = null;
      return;
    }
    if (lastLandedModeRef.current === modeConfig.mode) return;
    lastLandedModeRef.current = modeConfig.mode;
    const target = modeConfig.defaultLandingView as typeof activeView;
    if (target && target !== activeView && canAccess(roles, target as Route)) {
      setActiveView(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeConfig.mode, effectiveRoles.join("|")]);
  const [dateRange, setDateRange] = useState<"all" | "week" | "month" | "custom">("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // ---- Selected room ----
  const [selectedRoom, setSelectedRoom] = useState<RoomView | null>(null);
  // Booking-confirmation flow target (null = closed).
  const [bookingRoom, setBookingRoom] = useState<RoomView | null>(null);
  const [bookingSaving, setBookingSaving] = useState(false);
  // Task being edited — shared modal mounted at the bottom of the
  // tree so EngineerKanban / TaskDetailDrawer can trigger the same
  // edit flow that TasksList already uses internally.
  const [editingTask, setEditingTask] = useState<SheetRow | null>(null);
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
  const [showHelp, setShowHelp] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [tDate, setTDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [tType, setTType] = useState<string>(() => modeConfig.defaultTaskType);
  // Keep tType in sync when mode changes (View-as swap) — only if the user
  // hasn't started editing the modal (i.e. when it's closed).
  useEffect(() => {
    if (!showAddTask) setTType(modeConfig.defaultTaskType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeConfig.defaultTaskType]);
  const [tBuilding, setTBuilding] = useState<string>("");
  const [tRoom, setTRoom] = useState<string>("");
  const [tCustomer, setTCustomer] = useState<string>("");
  const [tPhone, setTPhone] = useState<string>("");
  const [tNote, setTNote] = useState<string>("");
  const [tCost, setTCost] = useState<string>("");

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
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('theme');
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const prefersDark = mql.matches;
    const dark = saved ? saved === 'dark' : prefersDark;
    setIsDark(dark);
    document.documentElement.classList.toggle('dark', dark);

    // Live-track system preference when user hasn't manually picked.
    // Touching the toggle persists "theme" in localStorage → from that
    // point the listener is a no-op until user clears localStorage.
    function onChange(e: MediaQueryListEvent) {
      if (localStorage.getItem('theme')) return;
      setIsDark(e.matches);
      document.documentElement.classList.toggle('dark', e.matches);
    }
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  function toggleTheme() {
    setIsDark((prev) => {
      const next = !prev;
      if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', next);
      if (typeof window !== 'undefined') localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  }

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
  // Track the mode the route guard last saw — when the mode changes,
  // the landing useEffect above will move activeView; we suppress the
  // "ไม่มีสิทธิ์" toast for that one tick because the user didn't try
  // to enter a forbidden view, they just switched modes.
  const guardSeenModeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!role) return; // session still loading
    const justSwitchedMode = guardSeenModeRef.current !== modeConfig.mode;
    guardSeenModeRef.current = modeConfig.mode;

    // Guard against the *effective* role set so View-as also redirects
    if (!canAccess(roles, activeView as Route)) {
      // Prefer the mode's home page when redirecting — feels natural after
      // a View-as switch. Fall back to the generic default if the mode
      // landing also isn't accessible (defensive).
      const modeLanding = modeConfig.defaultLandingView as Route;
      const fallback: Route = canAccess(roles, modeLanding)
        ? modeLanding
        : getDefaultRoute(roles);
      setActiveView(fallback as typeof activeView);
      // Only surface the error toast when the redirect is NOT caused by a
      // mode switch (e.g. user navigated to a forbidden view via cmdk).
      if (!justSwitchedMode) {
        toast.error("ไม่มีสิทธิ์เข้าถึงหน้านี้");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, activeView, roles.join("|"), modeConfig.mode]);

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
        if (showHelp) { setShowHelp(false); return; }
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
      } else if (e.key === "?") {
        // "?" requires Shift on US layout — captured via the key
        // value (not code). Show shortcut cheatsheet.
        e.preventDefault();
        setShowHelp((s) => !s);
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        setShowAddTask(true);
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        if (!isRefreshing) refresh();
      } else if (e.key === "[") {
        // Toggle sidebar rail mode on desktop. No-op visually on mobile
        // (sidebar there is an overlay; the class is ignored).
        e.preventDefault();
        toggleSidebarCollapse();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoom, showAddTask, summaryOpen, sidebarOpen, showHelp, isRefreshing, refresh, sidebarCollapsed]);

  // ---- Derived data ----
  const buildings = useMemo(() => {
    const set = new Set<string>();
    rooms.forEach((r) => r.building && set.add(r.building));
    return Array.from(set).sort();
  }, [rooms]);

  const buildingTabs = useMemo(() => ["ทั้งหมด", ...buildings], [buildings]);

  const visibleRooms = useMemo(() => {
    if (activeView === "income" || activeView === "tenants" || activeView === "calendar" || activeView === "maintenance" || activeView === "facilities" || activeView === "parts" || activeView === "vehicles" || activeView === "leads" || activeView === "recurring" || activeView === "salespipeline" || activeView === "engineerkanban" || activeView === "reports") return [];
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
        if (isDoneStatus(t.status) || isCancelledStatus(t.status)) return false;
        // "วันนี้" shows today's work AND anything still overdue (date on or
        // before today) — a daily view that hid overdue made the
        // "งานเลยกำหนด" notification land on an empty page. parseThaiDate
        // handles both dd/MM/yyyy and the ISO yyyy-MM-dd that Apps Script
        // emits, so ISO-dated tasks aren't silently dropped either.
        const td = parseThaiDate(t.date);
        if (!td) return false;
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const tdStart = new Date(td.getFullYear(), td.getMonth(), td.getDate()).getTime();
        if (tdStart > todayStart) return false; // exclude future-dated tasks
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
  const showCustomView = activeView === "income" || activeView === "tenants" || activeView === "calendar" || activeView === "maintenance" || activeView === "facilities" || activeView === "parts" || activeView === "vehicles" || activeView === "leads" || activeView === "recurring" || activeView === "salespipeline" || activeView === "engineerkanban" || activeView === "reports";
  const showRoomGrid = !showTasksView && !showCustomView && !(isInitial && rooms.length === 0);

  // Stats for the welcome hero — same data the rest of the page already
  // sees, just summarised for greeting copy. Building-scoped so the hero
  // narrative matches the current building filter.
  const greetingStats = useMemo<GreetingStats>(() => {
    const scope = activeBuilding === "ทั้งหมด"
      ? rooms
      : rooms.filter((r) => r.building === activeBuilding);
    const vacant   = scope.filter((r) => r.status === "ready").length;
    const occupied = scope.filter((r) => r.status === "occupied").length;
    const total    = scope.length;
    const occupancyRate = total > 0 ? occupied / total : 0;
    // Today's task count (any non-done/non-cancelled task dated today)
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const todayStr = `${dd}/${mm}/${d.getFullYear()}`;
    const tasksToday = (tasks || []).filter((t) =>
      t.date === todayStr
      && !isDoneStatus(t.status)
      && !isCancelledStatus(t.status)
      && (activeBuilding === "ทั้งหมด" || t.building === activeBuilding)
    ).length;
    // Contracts expiring this calendar month — used by management greeting only;
    // sales greeting uses moveoutCount instead (contracts auto-renew here).
    const thisMonth = d.getMonth();
    const thisYear  = d.getFullYear();
    let expiringContractsThisMonth = 0;
    for (const r of scope) {
      if (!r.contractEnd) continue;
      const td = parseThaiDate(r.contractEnd);
      if (!td) continue;
      if (td.getMonth() === thisMonth && td.getFullYear() === thisYear) {
        expiringContractsThisMonth++;
      }
    }
    // Rooms with moveout notice — re-sell pipeline signal for sales mode.
    const moveoutCount = scope.filter((r) => r.status === "moveout").length;
    // Monthly income proxy: sum of occupied-room prices
    let monthlyIncome = 0;
    for (const r of scope) {
      if (r.status !== "occupied") continue;
      const n = parseInt(String(r.price || "").replace(/[^0-9]/g, ""), 10);
      if (Number.isFinite(n)) monthlyIncome += n;
    }
    // maintenanceOverdue / DueSoon are owned by the (lazy) maintenance
    // module — left at 0 here so the greeting falls back gracefully; can
    // be wired in once a lightweight summary endpoint exists.
    return {
      vacant, occupied, total, occupancyRate,
      tasksToday, expiringContractsThisMonth, moveoutCount,
      maintenanceOverdue: 0, maintenanceDueSoon: 0,
      monthlyIncome,
    };
  }, [rooms, tasks, activeBuilding]);

  const sidebarCounts = useMemo(() => {
    const scope = activeBuilding === "ทั้งหมด" ? rooms : rooms.filter((r) => r.building === activeBuilding);
    const c: Record<string, number> = { today: 0 };
    STATUS_KEYS.forEach((k) => (c[k] = 0));
    scope.forEach((r) => { c[r.status]++; if (r.today) c.today++; });
    // Overdue tasks count — sales/engineer/management all care about
    // these. Filtered by activeBuilding for consistency.
    const todayDate = new Date();
    const todayMs = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate()).getTime();
    const tasksScope = activeBuilding === "ทั้งหมด"
      ? tasks
      : tasks.filter((t) => t.building === activeBuilding);
    let overdue = 0;
    for (const t of tasksScope) {
      if (isDoneStatus(t.status) || isCancelledStatus(t.status)) continue;
      const d = parseThaiDate(t.date);
      if (d && d.getTime() < todayMs) overdue++;
    }
    return { ...c, total: scope.length, overdue } as { total: number; today: number; overdue: number } & Partial<Record<RoomStatus, number>>;
  }, [rooms, activeBuilding, tasks]);

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
      toast.success(`เพิ่ม ${okCount} งานสำเร็จ`);
      publishBusEvent({ kind: "data-changed", source: "task", ts: Date.now() });
      exitBulk();
    } else {
      toast.error(`สำเร็จ ${okCount}, ล้มเหลว ${failCount}`);
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

  /** Move-out workflow (Task 30): pre-fill task for inspection/clean. */
  function openMoveoutInspection(building: string, room: string) {
    setTType("อื่นๆ");
    setTBuilding(building);
    setTRoom(room);
    setTNote("ตรวจห้องก่อนคืนมัดจำ — เช็คเฟอร์ฯ / อุปกรณ์ / ความเรียบร้อย");
    setSelectedRoom(null);
    setShowAddTask(true);
  }
  function openMoveoutCleaning(building: string, room: string) {
    setTType("ทำสะอาด");
    setTBuilding(building);
    setTRoom(room);
    setTNote("ทำสะอาดหลังย้ายออก — ปล่อยห้องใหม่ต่อ");
    setSelectedRoom(null);
    setShowAddTask(true);
  }

  /** Move-in workflow companions. */
  function openMoveinCleaning(building: string, room: string) {
    setTType("ทำสะอาด");
    setTBuilding(building);
    setTRoom(room);
    setTNote("ทำสะอาดก่อนรับลูกค้าใหม่");
    setSelectedRoom(null);
    setShowAddTask(true);
  }
  function openMoveinSchedule(building: string, room: string) {
    setTType("ย้ายเข้า");
    setTBuilding(building);
    setTRoom(room);
    setTNote("");
    setSelectedRoom(null);
    setShowAddTask(true);
  }

  /** Lead → Task auto-fill — opens AddTaskModal with type=ย้ายเข้า and
   *  copies the lead's contact info. User still picks the room (Lead
   *  doesn't have a room assignment in current schema). */
  function openMoveinFromLead(lead: { name: string; phone: string; interest: string }) {
    setTType("ย้ายเข้า");
    setTBuilding("");
    setTRoom("");
    setTCustomer(lead.name || "");
    setTPhone(lead.phone || "");
    setTNote(lead.interest ? `จาก Lead: ${lead.interest}` : "");
    setSelectedRoom(null);
    setShowAddTask(true);
  }

  /** Quick "บันทึกนัดชม" — pre-fill AddTaskModal with type=ชมห้อง (sales FAB). */
  function openQuickAddLead() {
    setTType("ชมห้อง");
    setTBuilding("");
    setTRoom("");
    setTCustomer("");
    setTPhone("");
    setTNote("");
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

  /**
   * Submit handler รับค่าที่ validate แล้วจาก AddTaskModal (RHF + zod).
   * Schema ใน lib/taskSchema.ts ตรวจ structure + room-exists ก่อน;
   * ที่นี่เหลือแค่ parse cost → number แล้วยิงไป API
   */
  /**
   * Booking confirmation save: write the tenant onto the room (status →
   * รอสัญญา so it shows in "รอย้ายเข้า") and create the ย้ายเข้า
   * appointment on the move-in date. The two writes are sequential —
   * the room update is the important one; if the task add fails the
   * user still has the room booked + the copied LINE message.
   */
  async function handleBookingConfirm(data: BookingSaveData) {
    setBookingSaving(true);
    try {
      const roomRes = await fetch("/api/sheet/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateRoomStatus",
          building: data.building,
          room: data.room,
          status: "รอสัญญา",
          tenant: data.tenant,
          phone: data.phone,
          price: String(data.monthlyRent),
        }),
      });
      const roomData = await roomRes.json().catch(() => ({ ok: false }));
      if (!roomData.ok) throw new Error(roomData.error || `HTTP ${roomRes.status}`);

      // Create the move-in appointment (best-effort; don't fail the
      // whole flow if this errors — the room is already booked).
      try {
        await fetch("/api/sheet/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "addTask",
            date: data.moveInDateIso,
            type: "ย้ายเข้า",
            building: data.building,
            room: data.room,
            customer: data.tenant,
            phone: data.phone,
            note: `ยืนยันการจอง — เข้าพัก ${data.moveInTime || ""}`.trim(),
          }),
        });
      } catch { /* surfaced via refresh; room booking already saved */ }

      toast.success("บันทึกการจอง + สร้างนัดย้ายเข้าแล้ว");
      publishBusEvent({ kind: "data-changed", source: "room", ts: Date.now() });
      optimisticUpdateRoom(data.building, data.room, {
        status: "รอสัญญา", tenant: data.tenant, phone: data.phone, price: String(data.monthlyRent),
      });
      setBookingRoom(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? `บันทึกไม่สำเร็จ: ${e.message}` : "Network error");
    } finally {
      setBookingSaving(false);
    }
  }

  async function handleAddTask(values: import("@/lib/taskSchema").TaskFormValues) {
    setSavingTask(true);
    try {
      const costNum = values.cost ? parseCostInput(values.cost) : 0;
      const res = await fetch("/api/sheet/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addTask",
          date: values.date,
          type: values.type,
          building: values.building,
          room: values.room,
          customer: values.customer,
          phone: values.phone,
          note: values.note,
          ...(costNum > 0 ? { cost: costNum } : {}),
        }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "invalid JSON response" }));
      console.log("[write] addTask response", res.status, data);
      if (data.ok) {
        toast.success("เพิ่มงานแล้ว — รีเฟรชข้อมูล");
        publishBusEvent({ kind: "data-changed", source: "task", ts: Date.now() });
        // Show the new task immediately — the dashboard cache can lag the
        // write, so without this the list "doesn't update" until it expires.
        optimisticAddTask({
          date: values.date,
          type: values.type,
          building: values.building,
          room: values.room,
          customer: values.customer || "",
          phone: values.phone || "",
          note: values.note || "",
          status: "",
          ...(costNum > 0 ? { cost: costNum } : {}),
        });
        setShowAddTask(false);
        // Clear quick-add pre-fills so the next open opens fresh
        setTCustomer(""); setTPhone(""); setTNote(""); setTRoom(""); setTCost("");
        refresh();
      } else {
        const statusSuffix = res.status !== 200 ? ` (HTTP ${res.status})` : "";
        toast.error(`เพิ่มงานไม่สำเร็จ${statusSuffix}: ${data.error || "unknown error"}`);
      }
    } catch (e: unknown) {
      console.error("[write] addTask failed", e);
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally { setSavingTask(false); }
  }

  /**
   * Auto-create the two engineer prep tasks (ตรวจห้อง + ทำสะอาด) for a
   * room that just entered "แจ้งย้ายออก". Silently skips a task type if
   * one already exists open. Errors here don't block the room save — the
   * user can still create tasks manually via the workflow buttons.
   */
  async function autoCreateMoveoutPrep(building: string, room: string) {
    const created: string[] = [];
    for (const kind of MOVEOUT_PREP_KINDS) {
      if (hasOpenPrepTask(tasks, building, room, kind.type)) continue;
      try {
        const r = await fetch("/api/sheet/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "addTask",
            date: moveoutTodayThaiDate(),
            type: kind.type,
            building,
            room,
            note: kind.note,
          }),
        });
        const j = await r.json().catch(() => ({ ok: false }));
        if (j.ok) created.push(kind.label);
      } catch {
        /* ignore — silent best-effort */
      }
    }
    if (created.length > 0) {
      toast.success(`สร้างงานเตรียมห้องอัตโนมัติ: ${created.join(" + ")}`);
      publishBusEvent({ kind: "data-changed", source: "task", ts: Date.now() });
      refresh();
    }
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
      const data = await res.json().catch(() => ({ ok: false, error: "invalid JSON response" }));
      console.log("[write] updateRoomStatus response", res.status, data);
      if (data.ok) {
        toast.success("บันทึกแล้ว — รีเฟรชข้อมูล");
        publishBusEvent({ kind: "data-changed", source: "room", ts: Date.now() });
        // Optimistic local update — shows the change immediately even if the
        // canonical CSV publish behind /api/sheet/rooms hasn't refreshed yet
        optimisticUpdateRoom(selectedRoom.building, selectedRoom.room, {
          status: editStatus,
          tenant: editTenant,
          phone: editPhone,
          contractEnd: editContractEnd,
          price: editPrice,
        });
        // Bridge sales → engineer: when a room flips into "แจ้งย้ายออก"
        // for the first time, auto-create the prep tasks engineers need
        // (inspection + post-tenant clean). Skip when one already exists.
        const wasMoveout = selectedRoom.status === "moveout";
        const isMoveout = editStatus === "moveout";
        if (!wasMoveout && isMoveout) {
          void autoCreateMoveoutPrep(selectedRoom.building, selectedRoom.room);
        }
        setSelectedRoom(null);
        refresh();
      } else {
        const statusSuffix = res.status !== 200 ? ` (HTTP ${res.status})` : "";
        toast.error(`บันทึกไม่สำเร็จ${statusSuffix}: ${data.error || "unknown error"}`);
      }
    } catch (e) {
      console.error("[write] updateRoomStatus failed", e);
      toast.error(e instanceof Error ? e.message : "Network error");
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
    toast.success(`บันทึกชุด "${created.name}" แล้ว`);
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
        onOpenHelp={() => setShowHelp(true)}
        addLabel={modeConfig.addButtonLabel}
        modeLabel={modeConfig.label}
        notifications={notifications}
        onNotificationNavigate={(route) => {
          if ((VALID_VIEWS as string[]).includes(route)) {
            // Notification counts are property-wide, but the today/
            // moveout/status views are scoped by activeBuilding +
            // activeFilter. Clear both so the items the badge counted
            // are actually visible after navigating (otherwise a user
            // filtered to one building taps the alert and lands on an
            // empty page — the "ไม่มาแสดง" report).
            setActiveBuilding("ทั้งหมด");
            setActiveFilter("all");
            setActiveView(route as ActiveView);
          }
        }}
      />

      <div className="ac-body">
        <AppSidebar
          isOpen={sidebarOpen}
          activeView={activeView}
          onChangeView={setActiveView}
          counts={sidebarCounts}
          assetAlerts={assetAlerts}
          onBackdropClick={() => setSidebarOpen(false)}
          roles={roles}
          groupOrder={modeConfig.sidebarGroupOrder}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
        />

        <main className="ac-main" id="main-content" tabIndex={-1}>
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
            <WelcomeHero config={modeConfig} stats={greetingStats} />
          )}

          {activeView === "overview" && (
            <ServiceDueBanner
              activeBuilding={activeBuilding}
              onNavigate={(v) => setActiveView(v)}
            />
          )}

          {activeView === "overview" && rooms.length > 0 && (
            <OverviewCards
              rooms={rooms}
              tasks={tasks}
              activeBuilding={activeBuilding}
              roles={roles}
              onNavigate={(v) => setActiveView(v)}
            />
          )}

          {activeView === "overview" && rooms.length > 0 && (
            <InsightsCards
              rooms={rooms}
              tasks={tasks}
              activeBuilding={activeBuilding}
            />
          )}

          {activeView === "overview" && rooms.length > 0 && (
            <RecentTasks
              tasks={tasks}
              rooms={rooms}
              activeBuilding={activeBuilding}
              onSelectRoom={(r) => setSelectedRoom(r)}
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
              vehicleCountByRoom={vehicleCounts.get}
              equipmentCountByRoom={equipmentCounts.get}
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
              {activeView === "today" && canAccess(roles, "maintenance") && (
                <Suspense fallback={null}>
                  <MaintenanceTodaySection
                    activeBuilding={activeBuilding}
                    onScheduleService={openMaintenanceTask}
                  />
                </Suspense>
              )}
              <TasksList
                tasks={visibleTasks}
                title={VIEW_LABEL[activeView as string] || "งาน"}
                emptyText="ไม่มีงานในรายการนี้"
                onChanged={refresh}
              />
            </>
          )}

          {activeView === "salespipeline" && (
            <ErrorBoundary level="route" label="ภาพรวมขาย">
              <Suspense fallback={<SalesPipelineSkeleton />}>
                <SalesPipelineView
                  rooms={rooms}
                  tasks={tasks}
                  activeBuilding={activeBuilding}
                  onSelectRoom={(r) => setSelectedRoom(r)}
                  onQuickAddLead={openQuickAddLead}
                  onChangeView={(v) => setActiveView(v)}
                />
              </Suspense>
            </ErrorBoundary>
          )}
          {activeView === "engineerkanban" && (
            <ErrorBoundary level="route" label="กระดานงานช่าง">
              <Suspense fallback={<EngineerKanbanSkeleton />}>
                <EngineerKanban
                  tasks={tasks}
                  activeBuilding={activeBuilding}
                  rooms={rooms}
                  onChanged={refresh}
                  onSelectRoom={(r) => setSelectedRoom(r)}
                  onAddTaskForRoom={openAddTaskForRoom}
                  onEditTask={(t) => setEditingTask(t)}
                />
              </Suspense>
            </ErrorBoundary>
          )}
          {activeView === "reports" && (
            <ErrorBoundary level="route" label="รายงาน">
              <Suspense fallback={<IncomeSkeleton />}>
                <ReportsView rooms={rooms} tasks={tasks} />
              </Suspense>
            </ErrorBoundary>
          )}
          {activeView === "income" && (
            <ErrorBoundary level="route" label="รายได้">
              <Suspense fallback={<IncomeSkeleton />}>
                <IncomeView rooms={rooms} activeBuilding={activeBuilding} />
              </Suspense>
            </ErrorBoundary>
          )}
          {activeView === "tenants" && (
            <ErrorBoundary level="route" label="ผู้เช่า">
              <Suspense fallback={<TenantsSkeleton />}>
                <TenantsView rooms={rooms} activeBuilding={activeBuilding} onSelectRoom={(r) => setSelectedRoom(r)} />
              </Suspense>
            </ErrorBoundary>
          )}
          {activeView === "calendar" && (
            <ErrorBoundary level="route" label="ปฏิทิน">
              <Suspense fallback={<CalendarSkeleton />}>
                <CalendarView tasks={tasks} activeBuilding={activeBuilding} rooms={rooms} onSelectRoom={(r) => setSelectedRoom(r)} />
              </Suspense>
            </ErrorBoundary>
          )}
          {activeView === "maintenance" && (
            <ErrorBoundary level="route" label="บำรุงรักษา">
              <Suspense fallback={<MaintenanceSkeleton />}>
                <MaintenanceView
                  activeBuilding={activeBuilding}
                  onScheduleService={openMaintenanceTask}
                />
              </Suspense>
            </ErrorBoundary>
          )}
          {activeView === "facilities" && (
            <ErrorBoundary level="route" label="สาธารณูปโภค">
              <Suspense fallback={<FacilitiesSkeleton />}>
                <FacilitiesView
                  buildings={buildings}
                  activeBuilding={activeBuilding}
                  onScheduleService={openMaintenanceTask}
                />
              </Suspense>
            </ErrorBoundary>
          )}
          {activeView === "parts" && (
            <ErrorBoundary level="route" label="คลังอะไหล่">
              <Suspense fallback={<FacilitiesSkeleton />}>
                <PartsView rooms={rooms} />
              </Suspense>
            </ErrorBoundary>
          )}
          {activeView === "vehicles" && (
            <ErrorBoundary level="route" label="ยานพาหนะ">
              <Suspense fallback={<FacilitiesSkeleton />}>
                <VehiclesView
                  buildings={buildings}
                  activeBuilding={activeBuilding}
                  rooms={rooms}
                />
              </Suspense>
            </ErrorBoundary>
          )}
          {activeView === "leads" && (
            <ErrorBoundary level="route" label="Lead CRM">
              <Suspense fallback={<FacilitiesSkeleton />}>
                <LeadsView onCreateMoveinTask={(l) => openMoveinFromLead(l)} />
              </Suspense>
            </ErrorBoundary>
          )}
          {activeView === "recurring" && (
            <ErrorBoundary level="route" label="งานประจำ">
              <Suspense fallback={<FacilitiesSkeleton />}>
                <RecurringView buildings={buildings} />
              </Suspense>
            </ErrorBoundary>
          )}
        </main>
      </div>

      <BottomNav
        activeView={activeView}
        roles={roles}
        onNavigate={(v: BottomNavView) => setActiveView(v)}
        onAddTask={() => setShowAddTask(true)}
        todayCount={sidebarCounts.today}
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
        defaultType={modeConfig.defaultTaskType}
        // initialValues snapshot — parent state plumbs pre-fill from
        // openAddTaskForRoom / openMaintenanceTask / openQuickAddLead.
        // Inside the modal, react-hook-form takes over and manages
        // edits without bouncing back through parent setters.
        initialValues={{
          date: tDate,
          type: tType as never, // schema enum — runtime guard inside modal
          building: tBuilding as never,
          room: tRoom,
          customer: tCustomer,
          phone: tPhone,
          note: tNote,
          cost: tCost,
        }}
        // Rooms list for "ห้องนี้มีในตึก" cross-field zod validation +
        // building-aware placeholder hints (room convention, median price).
        rooms={rooms.map((r) => ({ building: r.building, room: r.room, price: r.price }))}
        onClose={() => setShowAddTask(false)}
        onSubmit={handleAddTask}
      />

      {selectedRoom && (() => {
        // RoomModal prev/next nav (#9). Prefer the user's current
        // filtered view (so "next" follows what they actually see).
        // If the selected room isn't in that list (e.g. opened from
        // calendar task → outside visibleRooms), fall back to the
        // full sorted rooms list so navigation still works.
        const navList = (() => {
          const inVisible = visibleRooms.findIndex(
            (r) => r.building === selectedRoom.building && r.room === selectedRoom.room,
          );
          if (inVisible >= 0) return visibleRooms;
          return [...rooms].sort((a, b) => {
            if (a.building !== b.building) return a.building.localeCompare(b.building);
            const fa = parseInt(a.floor || "0", 10) || 0;
            const fb = parseInt(b.floor || "0", 10) || 0;
            if (fa !== fb) return fa - fb;
            return a.room.localeCompare(b.room, undefined, { numeric: true });
          });
        })();
        const idx = navList.findIndex(
          (r) => r.building === selectedRoom.building && r.room === selectedRoom.room,
        );
        const prev = idx > 0 ? navList[idx - 1] : null;
        const next = idx >= 0 && idx < navList.length - 1 ? navList[idx + 1] : null;
        return (
          <RoomModal
            room={selectedRoom}
            saving={saving}
            defaultTab={modeConfig.roomModalDefaultTab}
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
            onMoveoutInspect={() => openMoveoutInspection(selectedRoom.building, selectedRoom.room)}
            onMoveoutClean={() => openMoveoutCleaning(selectedRoom.building, selectedRoom.room)}
            onMoveinClean={() => openMoveinCleaning(selectedRoom.building, selectedRoom.room)}
            onMoveinSchedule={() => openMoveinSchedule(selectedRoom.building, selectedRoom.room)}
            onConfirmBooking={() => { setBookingRoom(selectedRoom); setSelectedRoom(null); }}
            onPrevRoom={prev ? () => setSelectedRoom(prev) : undefined}
            onNextRoom={next ? () => setSelectedRoom(next) : undefined}
            roomIndex={idx >= 0 ? idx + 1 : undefined}
            roomTotal={navList.length}
          />
        );
      })()}

      {bookingRoom && (
        <BookingConfirmModal
          building={bookingRoom.building}
          room={bookingRoom.room}
          defaultTenant={bookingRoom.tenant}
          defaultPhone={bookingRoom.phone}
          defaultRent={bookingRoom.price}
          saving={bookingSaving}
          onClose={() => setBookingRoom(null)}
          onConfirm={handleBookingConfirm}
        />
      )}

      <KeyboardHelpModal open={showHelp} onClose={() => setShowHelp(false)} />

      {/* Shared task-edit modal — triggered from EngineerKanban /
          TaskDetailDrawer. TasksList still owns its own instance because
          its edit state is local to the rows it renders. */}
      <EditTaskModal
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onSaved={() => refresh()}
      />

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
            onTaskClick={(task) => {
              // Use the task argument so the user lands somewhere useful:
              // - if the task targets a known room, open that room's modal
              //   (matches what the user actually clicked on)
              // - else fall back to filtering by the task's building and
              //   navigating to today
              setSummaryOpen(false);
              const r = rooms.find(
                (x) => x.building === task.building && x.room === task.room,
              );
              if (r) {
                setSelectedRoom(r);
              } else {
                if (task.building) setActiveBuilding(task.building);
                setActiveView("today");
              }
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
