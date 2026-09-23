/**
 * Icon system — single source for every UI-chrome icon in the app.
 *
 * Why a wrapper?
 *   - Centralizes stroke-width / default size so the visual rhythm is
 *     consistent (Lucide's default stroke=2 looks heavy in dense UI;
 *     we use 1.75)
 *   - Lets components import once: `import { Icon } from "@/lib/icons"`
 *     and pick a name from a curated allowlist
 *   - Easier to swap icon sets later (e.g. → Phosphor) without touching
 *     each consumer
 *
 * V2: domain icons (equipment / facility types, room-journey actions) are
 * in here too now. They used to stay emoji — but emoji are drawn by the
 * phone's OS, so the same icon looked different on every device, ignored
 * the text colour and the dark theme, and sat next to these line icons in
 * a second visual language. Lucide covers every type the app has
 * (AirVent, WashingMachine, Refrigerator, ShowerHead …). Content that
 * leaves the app keeps its emoji: the LINE booking messages
 * (lib/bookingMessage) and the 🔧 repair-log marker stored in the sheet
 * (lib/repairLog) are data, not chrome.
 */

import {
  Search, Plus, RefreshCw, Sun, Moon, Menu,
  LayoutGrid, Calendar, FileText, BarChart3, Users, Wrench, Building2, Settings,
  Eye, Edit3, History, X, ChevronDown, ChevronRight, MoreHorizontal,
  Check, Circle, AlertCircle, Bell, ListChecks,
  LogOut, Package, Bike, PawPrint,
  Home, DoorOpen, KeyRound, CalendarClock, Phone, Table2,
  // V2 (emoji → icons)
  TriangleAlert, Download, Printer, ClipboardList, Trash2, Sparkles, LogIn,
  BrushCleaning, Wallet, User, UserX, Undo2, Star, Repeat, Play, Hourglass,
  GripVertical, Files, CirclePause, CircleCheck, CircleArrowUp, Zap,
  AirVent, WashingMachine, Refrigerator, ShowerHead, Tv, Microwave,
  Droplets, Lightbulb, Trees, Footprints,
  Camera, ShoppingCart, Store, Nut, Receipt, NotebookPen, SquareCheck, Clock,
} from "lucide-react";
import type { JourneyAction } from "@/lib/roomJourney";

export const ICON_REGISTRY = {
  // Chrome / nav
  search: Search,
  add: Plus,
  refresh: RefreshCw,
  sun: Sun,
  moon: Moon,
  menu: Menu,
  more: MoreHorizontal,
  close: X,
  expand: ChevronDown,
  next: ChevronRight,

  // Views
  grid: LayoutGrid,
  calendar: Calendar,
  summary: FileText,
  income: BarChart3,
  tenants: Users,
  maintenance: Wrench,
  facilities: Building2,
  inventory: Package,
  vehicle: Bike,
  pet: PawPrint,
  settings: Settings,
  tasks: ListChecks,

  // Per-item actions
  view: Eye,
  edit: Edit3,
  history: History,
  status: Circle,
  check: Check,
  alert: AlertCircle,
  bell: Bell,
  signOut: LogOut,

  // Sales dashboard (ภาพรวมขาย v2)
  home: Home,
  doorOpen: DoorOpen,
  key: KeyRound,
  calendarClock: CalendarClock,
  phone: Phone,
  table: Table2,

  // V2 — replacements for the emoji that used to be UI chrome
  warning: TriangleAlert,
  download: Download,
  print: Printer,
  clipboard: ClipboardList,
  trash: Trash2,
  ai: Sparkles,
  moveIn: LogIn,
  moveOut: LogOut,
  clean: BrushCleaning,
  money: Wallet,
  user: User,
  clearTenant: UserX,
  undo: Undo2,
  star: Star,
  repeat: Repeat,
  start: Play,
  waiting: Hourglass,
  grip: GripVertical,
  files: Files,
  blocked: CirclePause,
  done: CircleCheck,
  upgrade: CircleArrowUp,
  quick: Zap,
  camera: Camera,
  cart: ShoppingCart,
  store: Store,
  part: Nut,
  receipt: Receipt,
  note: NotebookPen,
  select: SquareCheck,
  clock: Clock,

  // V2 — equipment / facility types
  aircon: AirVent,
  washer: WashingMachine,
  fridge: Refrigerator,
  heater: ShowerHead,
  tv: Tv,
  microwave: Microwave,
  water: Droplets,
  light: Lightbulb,
  garden: Trees,
  walkway: Footprints,
} as const;

export type IconName = keyof typeof ICON_REGISTRY;

interface IconProps {
  name: IconName;
  size?: number;
  /** Override stroke width (default 1.75 — slightly lighter than Lucide's 2) */
  strokeWidth?: number;
  className?: string;
  /** Accessible label. If omitted, icon is aria-hidden (decorative). */
  label?: string;
  /** Fill colour — only for glyphs that have a filled state (★ pinned). */
  fill?: string;
}

export function Icon({
  name, size = 16, strokeWidth = 1.75, className, label, fill,
}: IconProps) {
  const Cmp = ICON_REGISTRY[name];
  const ariaProps = label
    ? { "aria-label": label, role: "img" as const }
    : { "aria-hidden": true };
  // `fill` only when asked for: lucide spreads props LAST, so an explicit
  // fill={undefined} would wipe its own fill="none" default and every
  // outline icon in the app would render as a solid black shape.
  return <Cmp size={size} strokeWidth={strokeWidth} className={className} {...(fill ? { fill } : {})} {...ariaProps} />;
}

/* --------------------------------------------------------------------
 * Domain → icon maps (V2). Moved here from lib/constants' emoji maps so
 * every icon in the app still comes from this one registry. The helpers
 * carry the fallback so no caller has to remember it.
 * ------------------------------------------------------------------ */

export const EQUIPMENT_TYPE_ICON: Record<string, IconName> = {
  แอร์: "aircon",
  เครื่องซักผ้า: "washer",
  ตู้เย็น: "fridge",
  เครื่องทำน้ำอุ่น: "heater",
  โทรทัศน์: "tv",
  ไมโครเวฟ: "microwave",
  อื่นๆ: "maintenance",
};

export const FACILITY_TYPE_ICON: Record<string, IconName> = {
  รอบล้างแอร์: "aircon",
  รอบล้างเครื่องซักผ้า: "washer",
  ปั๊มน้ำ: "water",
  ไฟส่วนกลาง: "light",
  ต้นไม้: "garden",
  ทางเดินส่วนกลาง: "walkway",
  อื่นๆ: "facilities",
};

export const equipmentIcon = (type: string): IconName => EQUIPMENT_TYPE_ICON[type] ?? "maintenance";
export const facilityIcon = (type: string): IconName => FACILITY_TYPE_ICON[type] ?? "facilities";

/** Icon per room-journey action ("ขั้นตอนถัดไป" buttons). lib/roomJourney
 *  builds the action list and stays React-free; the renderers look the
 *  icon up here by action id. */
export const JOURNEY_ACTION_ICON: Record<JourneyAction["id"], IconName> = {
  addViewing: "view",
  confirmBooking: "clipboard",
  confirmMoveIn: "done",
  noticeMoveout: "doorOpen",
  createCleanBefore: "clean",
  createInspect: "clipboard",
  createRepair: "maintenance",
  skipRepair: "done",
  createCleanAfter: "clean",
  createQcChecklist: "tasks",
  doneCleanBefore: "check",
  doneInspect: "check",
  doneRepair: "check",
  doneCleanAfter: "check",
  doneQc: "check",
  releaseNow: "quick",
  releaseRoom: "home",
};
