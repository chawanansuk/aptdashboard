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
 * Domain icons (equipment types like แอร์/ตู้เย็น, facility types like
 * ลิฟต์/สระว่ายน้ำ) stay as emoji — they're friendlier and map directly
 * to real objects in the user's mental model. Lucide doesn't have great
 * coverage for those anyway.
 */

import {
  Search, Plus, RefreshCw, Sun, Moon, Menu,
  LayoutGrid, Calendar, FileText, BarChart3, Users, Wrench, Building2, Settings,
  Eye, Edit3, History, X, ChevronDown, ChevronRight, MoreHorizontal,
  Check, Circle, AlertCircle, Bell, ListChecks,
  LogOut,
} from "lucide-react";

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
}

export function Icon({
  name, size = 16, strokeWidth = 1.75, className, label,
}: IconProps) {
  const Cmp = ICON_REGISTRY[name];
  const ariaProps = label
    ? { "aria-label": label, role: "img" as const }
    : { "aria-hidden": true };
  return <Cmp size={size} strokeWidth={strokeWidth} className={className} {...ariaProps} />;
}
