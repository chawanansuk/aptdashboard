"use client";

import { useEffect, useMemo, useRef, useState, useCallback, lazy, Suspense } from "react";
import { quickSetRoomStatus, executeJourneyAction } from "@/lib/journeyActions";
import { resilientPost } from "@/lib/resilientWrite";
import { useSession } from "next-auth/react";
import { useDashboardData } from "@/lib/useDashboardData";
import { useVehicleCountByRoom } from "@/lib/useVehicleCountByRoom";
import { useAssetAlertCounts } from "@/lib/useAssetAlertCounts";
import { usePersistedString } from "@/lib/usePersistedString";
import { useViewRouting, VALID_VIEWS, type ActiveView } from "@/lib/useViewRouting";
import { useEquipmentCountByRoom } from "@/lib/useEquipmentCountByRoom";
import { computeVacancyByBuilding, isSupplyRelevantView } from "@/lib/headerVacancy";
import { computeSidebarCounts } from "@/lib/sidebarCounts";
import { buildQuickActions, buildPaletteCommands } from "@/lib/menuConfigs";
import { parsePriceOr0 } from "@/lib/money";
import { roomKey } from "@/lib/taskKey";
import { useRoomBookmarks, roomBookmarkKey } from "@/lib/useRoomBookmarks";
import { useTabFocusRefresh } from "@/lib/useTabFocusRefresh";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { MQ } from "@/lib/breakpoints";
import { invalidateFacilityCache } from "@/lib/facilityCache";
import type { RoomStatus, RoomView, SheetRow } from "@/types";
import TasksList from "@/components/TasksList";
import AppHeader from "@/components/AppHeader";
import AppShell from "@/components/AppShell";
import AppSidebar from "@/components/AppSidebar";
import OverviewCards from "@/components/OverviewCards";
import InsightsCards from "@/components/InsightsCards";
import RecentTasks from "@/components/RecentTasks";
import ServiceDueBanner from "@/components/ServiceDueBanner";
import RoomsView from "@/components/RoomsView";
import { useCommandPalette } from "@/lib/useCommandPalette";
import type { CommandDef } from "@/lib/commandPaletteSearch";
import BottomNav, { type BottomNavView } from "@/components/BottomNav";
import RoomModalHost from "@/components/RoomModalHost";
import { type BookingSaveData } from "@/components/BookingConfirmModal";

// Rarely-opened modals — lazy so they leave the initial bundle. Each
// renders behind an interaction (Cmd+K, ?, booking flow, bulk add) so
// the small load delay on first open is invisible next to the network.
// AddTask/EditTask are lazy too (zod + react-hook-form would otherwise
// add ~300KB to every first paint, even for users who never open them).
// A 2s post-mount warm-up below prefetches both chunks while the
// browser is idle so the first click is instant.
const KeyboardHelpModal = lazy(() => import("@/components/KeyboardHelpModal"));
const CommandPalette = lazy(() => import("@/components/CommandPalette"));
const BookingConfirmModal = lazy(() => import("@/components/BookingConfirmModal"));
const BulkAddModal = lazy(() => import("@/components/BulkAddModal"));
const AddTaskModal = lazy(() => import("@/components/AddTaskModal"));
const EditTaskModal = lazy(() => import("@/components/EditTaskModal"));
import { buildNotifications } from "@/lib/notifications";
import BulkActionBar from "@/components/BulkActionBar";
import SkeletonLoader from "@/components/SkeletonLoader";
import { parseThaiDate, isTaskDatedToday } from "@/lib/dateUtils";
import { loadPresets, addPreset, removePreset, type FilterPreset } from "@/lib/presets";
import { VIEW_LABEL, VIEW_TO_TASK_TYPE, isClosedStatus } from "@/lib/constants";
import { hasOpenPrepTask } from "@/lib/moveoutTasks";
import {
  linkLeadOnViewingScheduled,
  bumpLeadOnViewingClosed,
} from "@/lib/dashboardActions";
import { canAccess, canPerform } from "@/lib/permissions";
import type { QuickAction } from "@/components/QuickActionMenu";
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
import { publishBusEvent, subscribeBus } from "@/lib/realtimeBus";
import { formatTurnoverToast, isTurnoverEventRelevant } from "@/lib/turnoverNotifications";

// Heavy views — lazy-loaded so the default 'overview' page ships less JS
const IncomeView      = lazy(() => import("@/components/IncomeView"));
const TenantsView     = lazy(() => import("@/components/TenantsView"));
const SalesPipelineView = lazy(() => import("@/components/sales/SalesPipelineV2"));
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
  const { status, rooms, errors, lastUpdated, refresh, tasks, isInitial, isRefreshing, optimisticUpdateRoom, optimisticAddTask, optimisticUpdateTask } =
    useDashboardData() as ReturnType<typeof useDashboardData> & { tasks: SheetRow[] };

  // Vehicle counts per room — used to render 🏍 N badge on RoomCard.
  // Independent fetch from rooms/tasks since vehicles have different
  // refresh cadence (Task 30 follow-up).
  //
  // Deferred until the critical dashboard data lands (!isInitial): on a
  // cold backend these secondary fetches used to race rooms+tasks for
  // the first Apps Script slot and push first paint out by seconds.
  // Badges pop in a beat later instead — invisible on a warm backend.
  const vehicleCounts = useVehicleCountByRoom(!isInitial);
  const equipmentCounts = useEquipmentCountByRoom(!isInitial);

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
  // Stable across the frequent Home re-renders (only changes when the
  // collapse state itself flips) so the memoized sidebar isn't forced to
  // reconcile on unrelated renders.
  const toggleSidebarCollapse = useCallback(
    () => setSidebarCollapsedRaw(sidebarCollapsed ? "0" : "1"),
    [sidebarCollapsed, setSidebarCollapsedRaw],
  );

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
  // Also deferred behind the critical dashboard load (same reasoning as
  // the vehicle/equipment count hooks above).
  const assetAlerts = useAssetAlertCounts(
    !isInitial && (canAccess(roles, "parts") || canAccess(roles, "maintenance")),
  );

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

  // ---- Presets ----
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  useEffect(() => { setPresets(loadPresets()); }, []);

  // Warm up the AddTask / EditTask chunks ~2s after mount so the first
  // click pops the modal instantly. They drag in zod + react-hook-form
  // (~300KB combined) which we don't want in the initial bundle but DO
  // want resident by the time the user reaches for them. Falls back to
  // setTimeout when requestIdleCallback isn't available (Safari).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefetch = () => {
      void import("@/components/AddTaskModal");
      void import("@/components/EditTaskModal");
    };
    const ric = (window as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    const handle = ric
      ? ric(prefetch, { timeout: 4000 })
      : window.setTimeout(prefetch, 2000);
    return () => {
      const cic = (window as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
      if (ric && cic) cic(handle);
      else window.clearTimeout(handle);
    };
  }, []);

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
  // View routing (activeView + mode landing + route guard) — extracted
  // to lib/useViewRouting (breakup PR 2). `type ActiveView` re-exported
  // there; VALID_VIEWS used by notification navigation below.
  const { activeView, setActiveView } = useViewRouting({
    role,
    roles,
    effectiveRoles,
    mode: modeConfig.mode,
    defaultLandingView: modeConfig.defaultLandingView,
  });
  const [dateRange, setDateRange] = useState<"all" | "week" | "month" | "custom">("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // ---- Selected room ----
  const [selectedRoom, setSelectedRoom] = useState<RoomView | null>(null);
  // Click-time snapshot → re-resolve against live rooms so the journey
  // panel (and tenant fields' base values) advance in place after a
  // write + refresh, instead of freezing until the modal is reopened.
  const selectedRoomFresh = useMemo(
    () => selectedRoom
      ? rooms.find((r) => r.building === selectedRoom.building && r.room === selectedRoom.room) ?? selectedRoom
      : null,
    [selectedRoom, rooms],
  );
  // Recent + pinned room bookmarks (#17) — persisted to localStorage.
  const roomBookmarks = useRoomBookmarks();
  // Booking-confirmation flow target (null = closed).
  const [bookingRoom, setBookingRoom] = useState<RoomView | null>(null);
  const [bookingSaving, setBookingSaving] = useState(false);
  // Task being edited — shared modal mounted at the bottom of the
  // tree so EngineerKanban / TaskDetailDrawer can trigger the same
  // edit flow that TasksList already uses internally.
  const [editingTask, setEditingTask] = useState<SheetRow | null>(null);
  // (Room edit-field state + save flow live in components/RoomModalHost
  //  — breakup PR 3.)

  // ---- Add task ----
  const [showAddTask, setShowAddTask] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [tDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
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
  const [bulkStatusBusy, setBulkStatusBusy] = useState(false);

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

  // ---- Close the overlay sidebar when entering desktop rail mode ----
  // The sidebar is a hamburger overlay at ≤1280px (CSS) and the static
  // rail above it. The old handler closed it at >980px — a different
  // threshold from the CSS — so a resize within the 981–1280 overlay band
  // would force the overlay shut. Drive it off the SAME breakpoint the CSS
  // uses so JS and CSS agree on when the overlay applies.
  const isDesktopRail = useMediaQuery(MQ.desktopRail);
  useEffect(() => {
    if (isDesktopRail) setSidebarOpen(false);
  }, [isDesktopRail]);

  // ---- Tab-focus refresh: when user returns to the tab, refetch the
  // dashboard and invalidate caches that don't auto-revalidate. Skips if
  // we refreshed within the last 30s.
  useTabFocusRefresh(() => {
    invalidateFacilityCache();
    refresh();
  });

  // ---- Cross-unit turnover notifications: engineer→sales when a
  // turnover task closes; sales→engineer when a moveout auto-prep fires.
  // Toast only when the event is relevant to this user's role
  // (turnoverNotifications.isTurnoverEventRelevant); silent otherwise.
  //
  // Live refs so the subscriber (deps: [roles] only) reads CURRENT data
  // when a toast button is tapped, not the closure from subscribe time.
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const optimisticUpdateRoomRef = useRef(optimisticUpdateRoom);
  optimisticUpdateRoomRef.current = optimisticUpdateRoom;

  useEffect(() => {
    if (roles.length === 0) return;
    return subscribeBus((e) => {
      if (!isTurnoverEventRelevant(e, roles)) return;
      const t = formatTurnoverToast(e);
      if (!t) return;
      // QC passed → offer ปล่อยขาย right on the toast, so sales closes the
      // turnover loop in one tap instead of navigating to the room modal.
      // Receivers of this event are sales/management — both hold
      // room.editStatus, so no extra permission gate needed here.
      let action: { label: string; onClick: () => void } | undefined;
      if (e.kind === "turnover-step-done" && e.step === "qc") {
        const room = roomsRef.current.find(
          (r) => r.building === e.building && r.room === e.room,
        );
        if (room) {
          action = {
            label: "ปล่อยขายเลย",
            onClick: () => {
              void quickSetRoomStatus(
                room, "ว่าง",
                { refresh: refreshRef.current, optimisticUpdateRoom: optimisticUpdateRoomRef.current },
                { clearTenant: true },
              ).catch((err) =>
                toast.error(err instanceof Error ? `ปล่อยขายไม่สำเร็จ: ${err.message}` : "ปล่อยขายไม่สำเร็จ"),
              );
            },
          };
        }
      }
      const opts = (t.body || action) ? { description: t.body, action } : undefined;
      if (t.tone === "success") toast.success(t.title, opts);
      else toast.info(t.title, opts);
    });
  }, [roles]);

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
        if (quickMenuOpen) { setQuickMenuOpen(false); return; }
        if (summaryOpen) { setSummaryOpen(false); return; }
        if (sidebarOpen) { setSidebarOpen(false); return; }
        return;
      }
      if (isInput) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // While the Quick Action menu is open, let its per-item shortcut
      // letters win. Otherwise `R` would refresh AND trigger the
      // "นัดซ่อม" item on the same keystroke.
      if (quickMenuOpen) return;

      if (e.key === "/") {
        const input = document.querySelector<HTMLInputElement>(".ac-search input");
        if (input) { e.preventDefault(); input.focus(); input.select(); }
      } else if (e.key === "?") {
        // "?" requires Shift on US layout — captured via the key
        // value (not code). Show shortcut cheatsheet.
        e.preventDefault();
        setShowHelp((s) => !s);
      } else if (e.key.toLowerCase() === "q" || e.key.toLowerCase() === "n") {
        // Q opens the Quick Action menu (Problem #16). N kept as an
        // alias for muscle memory — used to fire the legacy single
        // "เพิ่มงาน" shortcut.
        e.preventDefault();
        setQuickMenuOpen(true);
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
  }, [selectedRoom, showAddTask, quickMenuOpen, summaryOpen, sidebarOpen, showHelp, isRefreshing, refresh, sidebarCollapsed]);

  // Track the most recently opened room for the sidebar "เข้าดูล่าสุด"
  // list (#17). Keyed by building|room.
  const { recordVisit } = roomBookmarks;
  useEffect(() => {
    if (selectedRoom) recordVisit(roomBookmarkKey(selectedRoom.building, selectedRoom.room));
  }, [selectedRoom, recordVisit]);

  // ---- Derived data ----
  const buildings = useMemo(() => {
    const set = new Set<string>();
    rooms.forEach((r) => r.building && set.add(r.building));
    return Array.from(set).sort();
  }, [rooms]);

  const buildingTabs = useMemo(() => ["ทั้งหมด", ...buildings], [buildings]);

  // Vacancy count per building — only fed to AppHeader on supply-relevant
  // views (overview/sales/ready/pending/moveout) so engineer/maintenance
  // users don't see badges unrelated to their work. Helper + allowlist
  // live in lib/headerVacancy so the rule is unit-tested in one place.
  const vacancyByBuilding = useMemo(() => computeVacancyByBuilding(rooms), [rooms]);
  const headerVacancy = isSupplyRelevantView(activeView) ? vacancyByBuilding : undefined;

  const visibleRooms = useMemo(() => {
    if (activeView === "income" || activeView === "tenants" || activeView === "calendar" || activeView === "maintenance" || activeView === "facilities" || activeView === "parts" || activeView === "vehicles" || activeView === "leads" || activeView === "recurring" || activeView === "salespipeline" || activeView === "engineerkanban" || activeView === "reports") return [];
    // Note: room search was previously layered in here using the `search`
    // state — duplicated ⌘K's room/tenant/phone search. Removed in
    // Problem #8; users find rooms via the top-nav ⌘K. The `search`
    // state still drives the tasks-list filter below.
    return rooms.filter((r) => {
      if (activeBuilding !== "ทั้งหมด" && r.building !== activeBuilding) return false;
      if (activeView === "today" && !r.today) return false;
      if (activeView !== "overview" && activeView !== "today" && r.status !== activeView) return false;
      if (activeFilter !== "all" && r.status !== activeFilter) return false;
      return true;
    });
  }, [rooms, activeBuilding, activeView, activeFilter]);

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
        if (isClosedStatus(t.status)) return false;
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

  // moveout/qc/repair are room-status views — their sidebar badge counts
  // ROOMS in that status, so they render the room grid (filtered to that
  // status via visibleRooms) instead of a task list keyed on a task TYPE
  // that often doesn't exist (badge showed N but the task list was empty).
  const showTasksView = activeView === "today";
  const showCustomView = activeView === "income" || activeView === "tenants" || activeView === "calendar" || activeView === "maintenance" || activeView === "facilities" || activeView === "parts" || activeView === "vehicles" || activeView === "leads" || activeView === "recurring" || activeView === "salespipeline" || activeView === "engineerkanban" || activeView === "reports";
  const showRoomGrid = !showTasksView && !showCustomView && !(isInitial && rooms.length === 0);

  // Stats for the welcome hero — same data the rest of the page already
  // sees, just summarised for greeting copy. Building-scoped so the hero
  // narrative matches the current building filter.
  const greetingStats = useMemo<GreetingStats>(() => {
    const allBuildings = activeBuilding === "ทั้งหมด";
    const d = new Date();
    const thisMonth = d.getMonth();
    const thisYear  = d.getFullYear();

    // Single pass over the building-scoped rooms — was 4 filters + 2
    // for-loops over the same array. Accumulate every room-derived stat
    // here: vacancy/occupancy counts, expiring contracts (parseThaiDate
    // is regex-heavy, so we only call it once per room), moveout pipeline
    // signal, and the occupied-rent income proxy.
    let vacant = 0, occupied = 0, total = 0, moveoutCount = 0;
    let expiringContractsThisMonth = 0, monthlyIncome = 0;
    for (const r of rooms) {
      if (!allBuildings && r.building !== activeBuilding) continue;
      total++;
      if (r.status === "ready") vacant++;
      else if (r.status === "occupied") {
        occupied++;
        monthlyIncome += parsePriceOr0(r.price);
      } else if (r.status === "moveout") {
        // A moveout room still has a paying tenant until it's released —
        // count it in the greeting's rate/income so the hero numbers
        // agree with OverviewCards' อัตราเช่า/รายได้เดือนนี้ (which use
        // (occupied+moveout)); the two used to disagree on one screen
        // (e.g. 31% in the greeting vs 44% on the card).
        moveoutCount++;
        monthlyIncome += parsePriceOr0(r.price);
      }
      if (r.contractEnd) {
        const td = parseThaiDate(r.contractEnd);
        if (td && td.getMonth() === thisMonth && td.getFullYear() === thisYear) {
          expiringContractsThisMonth++;
        }
      }
    }
    const occupancyRate = total > 0 ? (occupied + moveoutCount) / total : 0;

    // Today's task count (any non-done/non-cancelled task dated today).
    // Parse-based — ISO-dated cells never matched the raw string compare.
    const tasksToday = (tasks || []).filter((t) =>
      isTaskDatedToday(t.date)
      && !isClosedStatus(t.status)
      && (allBuildings || t.building === activeBuilding)
    ).length;

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

  const sidebarCounts = useMemo(
    () => computeSidebarCounts(rooms, tasks, activeBuilding),
    [rooms, activeBuilding, tasks],
  );

  // Resolve recent/pinned bookmark keys (#17) back to live RoomView
  // objects for the sidebar. Keys that no longer match a room (deleted
  // / renamed) are dropped silently.
  const roomByKey = useMemo(() => {
    const m = new Map<string, RoomView>();
    for (const r of rooms) m.set(roomBookmarkKey(r.building, r.room), r);
    return m;
  }, [rooms]);
  const pinnedRooms = useMemo(
    () => roomBookmarks.pinned.map((k) => roomByKey.get(k)).filter((r): r is RoomView => !!r),
    [roomBookmarks.pinned, roomByKey],
  );
  const recentRooms = useMemo(
    () => roomBookmarks.recent.map((k) => roomByKey.get(k)).filter((r): r is RoomView => !!r),
    [roomBookmarks.recent, roomByKey],
  );

  // Stable handlers for the memoized sidebar — inline arrows would defeat
  // React.memo by handing it a fresh function reference each render.
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openRoomFromSidebar = useCallback((r: RoomView) => {
    setSidebarOpen(false);
    setSelectedRoom(r);
  }, []);

  // ---- Bulk helpers ----
  function toggleBulkRoom(building: string, room: string) {
    const k = roomKey(building, room);
    setBulkSelected((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }
  function exitBulk() { setBulkMode(false); setBulkSelected(new Set()); }

  /**
   * Bulk status change (v3.23) — mark every selected room at once. Reuses
   * quickSetRoomStatus in `silent` mode so the loop fires ONE toast +
   * refresh at the end instead of N. Confirms ONCE for the whole batch
   * (the per-room releaseNow confirm would be unusable at scale). "ว่าง"
   * carries clearTenant so each released room's old tenant is blanked
   * server-side, same as the single-room ปล่อยขาย.
   */
  async function submitBulkStatus(rawStatus: string) {
    const keys = Array.from(bulkSelected);
    if (keys.length === 0) return;
    const isRelease = rawStatus === "ว่าง";
    const confirmMsg = isRelease
      ? `ปล่อยขาย ${keys.length} ห้องที่เลือก\n\n` +
        "จะเปลี่ยนเป็น \"ว่าง\" และล้างข้อมูลผู้เช่าเดิมของทุกห้อง\n\nยืนยันหรือไม่?"
      : `เปลี่ยน ${keys.length} ห้องที่เลือกเป็น "${rawStatus}"\n\nยืนยันหรือไม่?`;
    if (typeof window !== "undefined" && !window.confirm(confirmMsg)) return;

    setBulkStatusBusy(true);
    const deps = { refresh, optimisticUpdateRoom, optimisticUpdateTask, tasks };
    let ok = 0, fail = 0;
    for (const k of keys) {
      const [building, room] = k.split("|");
      const rv = rooms.find((r) => r.building === building && r.room === room);
      if (!rv) { fail++; continue; }
      try {
        await quickSetRoomStatus(rv, rawStatus, deps, { clearTenant: isRelease, silent: true });
        ok++;
      } catch { fail++; }
    }
    setBulkStatusBusy(false);
    publishBusEvent({ kind: "data-changed", source: "room", ts: Date.now() });
    refresh();
    if (fail === 0) {
      toast.success(`เปลี่ยน ${ok} ห้อง → ${rawStatus}`);
      exitBulk();
    } else {
      toast.error(`สำเร็จ ${ok} ห้อง, ล้มเหลว ${fail} ห้อง`);
    }
  }

  async function submitBulkAdd() {
    if (bulkSelected.size === 0) return;
    setBulkSubmitting(true);
    let okCount = 0, failCount = 0, skipCount = 0;
    const items = Array.from(bulkSelected).map((k) => {
      const [building, room] = k.split("|");
      return { building, room };
    });
    for (const item of items) {
      // Skip rooms that already have an open task of this type — bulk add
      // is a quick way to pile dozens of dupes (resubmit, racing two
      // operators). Mirrors autoCreateMoveoutPrep / booking-confirm guards.
      if (hasOpenPrepTask(tasks, item.building, item.room, bulkAddType)) {
        skipCount++;
        continue;
      }
      try {
        // Resilient (same safety as single add — addTask is server-deduped):
        // a transient Sheets blip on item 7 of 20 no longer drops that room.
        const { data } = await resilientPost("/api/sheet/update", {
          action: "addTask",
          date: bulkAddDate, type: bulkAddType,
          building: item.building, room: item.room,
          note: bulkAddNote,
        });
        // addTask's server-side dedup returns ok:true + skipped:'duplicate-open'
        // when an open twin exists — count it with the client-side skips, not
        // as "created", so the toast doesn't overreport (audit r5).
        if (data.ok && data.skipped) skipCount++;
        else if (data.ok) okCount++;
        else failCount++;
      } catch { failCount++; }
    }
    setBulkSubmitting(false);
    setBulkAddOpen(false);
    const skipSuffix = skipCount > 0 ? ` · ข้าม ${skipCount} (มีงานอยู่แล้ว)` : "";
    if (failCount === 0) {
      toast.success(`เพิ่ม ${okCount} งานสำเร็จ${skipSuffix}`);
      publishBusEvent({ kind: "data-changed", source: "task", ts: Date.now() });
      exitBulk();
    } else {
      toast.error(`สำเร็จ ${okCount}, ล้มเหลว ${failCount}${skipSuffix}`);
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
  /**
   * One-tap status hop from the room card's ⋯ popover (v3.23) — the
   * "แก้สถานะยาก/หายาก" fix: no modal, no dropdown, no save button.
   * Reuses the journey machinery so the semantics stay right:
   *   ว่าง        → releaseNow (confirm + cancel open prep + blank tenant)
   *   แจ้งย้ายออก → noticeMoveout (auto-files the prep clean)
   *   others      → plain status write (tenant fields untouched)
   */
  async function handleQuickStatus(r: RoomView, rawStatus: string): Promise<void> {
    const deps = { refresh, optimisticUpdateRoom, optimisticUpdateTask, tasks };
    try {
      if (rawStatus === "ว่าง") await executeJourneyAction("releaseNow", r, deps);
      else if (rawStatus === "แจ้งย้ายออก") await executeJourneyAction("noticeMoveout", r, deps);
      else await quickSetRoomStatus(r, rawStatus, deps);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เปลี่ยนสถานะไม่สำเร็จ");
    }
  }

  function openRepairForRoom(r: { building: string; room: string }) {
    setTType("ซ่อม");
    setTBuilding(r.building);
    setTRoom(r.room);
    setTNote("");
    setSelectedRoom(null);
    setShowAddTask(true);
  }

  /** Generic "+ เพิ่ม" → open AddTaskModal with the requested type and
   *  a blank room. Used by the Quick Action menu (Problem #16). */
  function openAddTaskWithType(type: string) {
    setTType(type);
    setTBuilding("");
    setTRoom("");
    setTCustomer("");
    setTPhone("");
    setTNote("");
    setSelectedRoom(null);
    setShowAddTask(true);
  }

  // Quick Action menu items — permission-gated. Order = the spec
  // (Problem #16): lead, viewing, move-in, move-out, clean, repair.
  // Shortcut letters chosen to be mnemonic + non-overlapping:
  // L Lead / V Viewing / I move-In / O move-Out / C Clean / R Repair.
  // Menu/command configs live in lib/menuConfigs (breakup PR 5);
  // the memo deps preserve the original semantics ([roles] / [isDark]).
  const quickActions = useMemo<QuickAction[]>(
    () => buildQuickActions(roles, {
      onQuickAddLead: openQuickAddLead,
      onAddTaskWithType: openAddTaskWithType,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roles],
  );

  // ---- Command palette (Cmd+K / Ctrl+K / `/`) ----
  const cmdk = useCommandPalette();
  const paletteCommands = useMemo<CommandDef[]>(
    () => buildPaletteCommands(isDark, {
      onAddTask: () => setShowAddTask(true),
      onRefresh: refresh,
      onToggleTheme: toggleTheme,
      onOpenSummary: () => setSummaryOpen(true),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isDark],
  );

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
          // Booking bundle: status=รอสัญญา + tenant identity + price. This
          // is sales' one legitimate path to write a tenant; gated to
          // room.editStatus and audit-logged at the route. (security split)
          action: "bookRoom",
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
      // Guard against duplicates: confirming a booking (or re-opening the
      // modal to re-copy the LINE message) shouldn't pile a second
      // ย้ายเข้า on a room that already has one open. Mirrors the
      // autoCreateMoveoutPrep guard.
      const moveInExists = hasOpenPrepTask(tasks, data.building, data.room, "ย้ายเข้า");
      if (!moveInExists) {
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
      }

      toast.success(
        moveInExists
          ? "บันทึกการจองแล้ว (มีนัดย้ายเข้าอยู่แล้ว)"
          : "บันทึกการจอง + สร้างนัดย้ายเข้าแล้ว"
      );
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
    let retryToast: string | number | undefined;
    try {
      const costNum = values.cost ? parseCostInput(values.cost) : 0;
      // Resilient: addTask is server-deduped, so a re-send after a Sheets
      // hiccup (cold start / transient 502 / network blip) can't create a
      // duplicate — auto-retry instead of making staff retype the task.
      const { res, data } = await resilientPost(
        "/api/sheet/update",
        {
          action: "addTask",
          date: values.date,
          type: values.type,
          building: values.building,
          room: values.room,
          customer: values.customer,
          phone: values.phone,
          note: values.note,
          ...(costNum > 0 ? { cost: costNum } : {}),
        },
        {
          onRetry: (attempt, tot) => {
            retryToast = toast.info(`เซิร์ฟเวอร์ตอบช้า — กำลังลองใหม่ (${attempt}/${tot})`, {
              description: "ไม่ต้องกดซ้ำ ระบบส่งให้เองจนสำเร็จ",
            });
          },
        },
      );
      if (retryToast !== undefined) toast.dismiss(retryToast);
      if (process.env.NODE_ENV === "development") {
        console.log("[write] addTask response", res.status, data);
      }
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
        // Auto-track the prospect in the Lead CRM (no extra sales work).
        void linkLeadOnViewingScheduled(values);
      } else {
        const statusSuffix = res.status !== 200 ? ` (HTTP ${res.status})` : "";
        toast.error(`เพิ่มงานไม่สำเร็จ${statusSuffix}: ${data.error || "unknown error"}`);
      }
    } catch (e: unknown) {
      if (retryToast !== undefined) toast.dismiss(retryToast);
      console.error("[write] addTask failed", e);
      toast.error(
        e instanceof Error ? `เพิ่มงานไม่สำเร็จ: ${e.message}` : "เพิ่มงานไม่สำเร็จ",
        { description: "ลองใหม่หลายครั้งแล้วยังไม่ผ่าน — ข้อมูลในฟอร์มยังอยู่ กดบันทึกอีกครั้งได้เลย" },
      );
    } finally { setSavingTask(false); }
  }

  // ---- Preset helpers ----
  function applyPreset(p: FilterPreset) {
    setActiveView(p.view as ActiveView);
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

  // Errors banner is in-flow inside <main>; null when nothing to show.
  const errorsBanner = errors.length > 0 ? (
    <div className="ac-banner ac-banner-warn">
      <strong>⚠ มีปัญหาในการโหลดข้อมูล:</strong>{" "}
      {errors.map((e, i) => (<span key={i}>{e}{i < errors.length - 1 ? " • " : ""}</span>))}
      {rooms.length > 0 && <span> — กำลังแสดงข้อมูลล่าสุดที่บันทึกไว้ ({lastUpdated})</span>}
      <button className="ac-btn ac-btn-ghost ac-btn-sm" onClick={refresh} disabled={isRefreshing} style={{ marginLeft: 8 }}>
        {isRefreshing ? "กำลังลอง..." : "ลองอีกครั้ง"}
      </button>{" "}
      <a href="https://github.com/chawanansuk/aptdashboard/blob/main/docs/SETUP.md" target="_blank" rel="noreferrer">วิธีตั้งค่า</a>
    </div>
  ) : null;

  return (
    <>
    <AppShell
      header={
        <AppHeader
          buildings={buildingTabs}
          activeBuilding={activeBuilding}
          onChangeBuilding={setActiveBuilding}
          vacancyByBuilding={headerVacancy}
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
          quickActions={quickActions}
          quickMenuOpen={quickMenuOpen}
          onSetQuickMenuOpen={setQuickMenuOpen}
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
      }
      sidebar={
        <AppSidebar
          isOpen={sidebarOpen}
          activeView={activeView}
          onChangeView={setActiveView}
          counts={sidebarCounts}
          assetAlerts={assetAlerts}
          onBackdropClick={closeSidebar}
          roles={roles}
          groupOrder={modeConfig.sidebarGroupOrder}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
          pinnedRooms={pinnedRooms}
          recentRooms={recentRooms}
          onOpenRoom={openRoomFromSidebar}
        />
      }
      bottomNav={
        <BottomNav
          activeView={activeView}
          roles={roles}
          onNavigate={(v: BottomNavView) => setActiveView(v)}
          onAddTask={() => setShowAddTask(true)}
          todayCount={sidebarCounts.today}
        />
      }
      errorsBanner={errorsBanner}
    >
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
              bulkMode={bulkMode}
              bulkSelected={bulkSelected}
              onToggleBulkMode={() => bulkMode ? exitBulk() : setBulkMode(true)}
              onToggleBulkRoom={toggleBulkRoom}
              onSelectRoom={(r) => setSelectedRoom(r)}
              roles={roles}
              onRepairRoom={openRepairForRoom}
              onQuickStatus={handleQuickStatus}
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
                onOptimisticStatus={(t, s) => { optimisticUpdateTask(t, s); void bumpLeadOnViewingClosed(t, s); }}
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
                  onChangeBuilding={(b) => setActiveBuilding(b)}
                  lastUpdated={lastUpdated}
                  refresh={refresh}
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
            <ErrorBoundary level="route" label="ผู้สนใจเช่า">
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
    </AppShell>

      {cmdk.open && (
        <Suspense fallback={null}>
          <CommandPalette
            open={cmdk.open}
            onClose={() => cmdk.setOpen(false)}
            rooms={rooms}
            roles={roles}
            commands={paletteCommands}
            onSelectRoom={(r) => setSelectedRoom(r)}
            onChangeView={(v) => setActiveView(v)}
          />
        </Suspense>
      )}

      {/* Guard with `showAddTask` so the lazy chunk only loads on first
          open — Suspense fallback can be null (button stays clickable;
          warm-up below usually has the chunk ready by then). */}
      {showAddTask && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {selectedRoomFresh && (
        <RoomModalHost
          room={selectedRoomFresh}
          rooms={rooms}
          visibleRooms={visibleRooms}
          tasks={tasks}
          defaultTab={modeConfig.roomModalDefaultTab}
          onClose={() => setSelectedRoom(null)}
          onNavigate={setSelectedRoom}
          optimisticUpdateRoom={optimisticUpdateRoom}
          refresh={refresh}
          optimisticUpdateTask={optimisticUpdateTask}
          onAddTaskHere={openAddTaskForRoom}
          onMoveoutInspect={openMoveoutInspection}
          onMoveoutClean={openMoveoutCleaning}
          onMoveinClean={openMoveinCleaning}
          onMoveinSchedule={openMoveinSchedule}
          onConfirmBooking={(r) => { setBookingRoom(r); setSelectedRoom(null); }}
          bookmarks={roomBookmarks}
        />
      )}

      {bookingRoom && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {showHelp && (
        <Suspense fallback={null}>
          <KeyboardHelpModal open={showHelp} onClose={() => setShowHelp(false)} />
        </Suspense>
      )}

      {/* Shared task-edit modal — triggered from EngineerKanban /
          TaskDetailDrawer. TasksList still owns its own instance because
          its edit state is local to the rows it renders. Lazy + gated
          on `editingTask` so the chunk only loads when a row opens. */}
      {editingTask && (
        <Suspense fallback={null}>
          <EditTaskModal
            task={editingTask}
            onClose={() => setEditingTask(null)}
            onSaved={() => refresh()}
          />
        </Suspense>
      )}

      {bulkMode && (
        <BulkActionBar
          count={bulkSelected.size}
          onClear={() => setBulkSelected(new Set())}
          onAdd={() => setBulkAddOpen(true)}
          onExit={exitBulk}
          onSetStatus={canPerform(roles, "room.editStatus") ? submitBulkStatus : undefined}
          statusBusy={bulkStatusBusy}
        />
      )}

      {bulkAddOpen && (
        <Suspense fallback={null}>
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
        </Suspense>
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
    </>
  );
}
