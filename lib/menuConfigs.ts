/**
 * Menu/command config builders — extracted from app/page.tsx (breakup
 * PR 5). Pure functions over (roles, handlers): the page wraps them in
 * its own useMemo, so memo semantics stay exactly where they were, but
 * the 70+ lines of config objects live here and the per-role `visible`
 * flags are unit-testable.
 */

import type { Role } from "@/auth";
import { canPerform } from "@/lib/permissions";
import type { QuickAction } from "@/components/QuickActionMenu";
import type { CommandDef } from "@/lib/commandPaletteSearch";

export interface QuickActionHandlers {
  /** Open the lead quick-add modal. */
  onQuickAddLead: () => void;
  /** Open AddTaskModal pre-set to a task type (ชมห้อง/ย้ายเข้า/...). */
  onAddTaskWithType: (type: string) => void;
}

/** The "+ เพิ่ม" quick-action menu — entries filtered by role at render
 *  via their `visible` flags. */
export function buildQuickActions(
  roles: Role[],
  h: QuickActionHandlers,
): QuickAction[] {
  return [
    {
      id: "lead",
      label: "เพิ่มผู้สนใจเช่า",
      shortcut: "L",
      icon: "👤",
      description: "บันทึกผู้สนใจรายใหม่ลง Lead pipeline",
      visible: canPerform(roles, "lead.edit"),
      onSelect: h.onQuickAddLead,
    },
    {
      id: "viewing",
      label: "นัดชมห้อง",
      shortcut: "V",
      icon: "👀",
      visible: canPerform(roles, "task.add.sales"),
      onSelect: () => h.onAddTaskWithType("ชมห้อง"),
    },
    {
      id: "movein",
      label: "ย้ายเข้า",
      shortcut: "I",
      icon: "📥",
      visible: canPerform(roles, "task.add.sales"),
      onSelect: () => h.onAddTaskWithType("ย้ายเข้า"),
    },
    {
      id: "moveout",
      label: "ย้ายออก",
      shortcut: "O",
      icon: "📤",
      visible: canPerform(roles, "task.add.sales"),
      onSelect: () => h.onAddTaskWithType("ย้ายออก"),
    },
    {
      id: "clean",
      label: "นัดทำสะอาด",
      shortcut: "C",
      icon: "🧹",
      visible: canPerform(roles, "task.add.clean"),
      onSelect: () => h.onAddTaskWithType("ทำสะอาด"),
    },
    {
      id: "repair",
      label: "นัดซ่อม",
      shortcut: "R",
      icon: "🔧",
      visible: canPerform(roles, "task.add.eng"),
      onSelect: () => h.onAddTaskWithType("ซ่อม"),
    },
  ];
}

export interface PaletteCommandHandlers {
  onAddTask: () => void;
  onRefresh: () => void;
  onToggleTheme: () => void;
  onOpenSummary: () => void;
}

/** Static command-palette entries (view navigation/room search live in
 *  CommandPalette itself). `isDark` only flips the theme label. */
export function buildPaletteCommands(
  isDark: boolean,
  h: PaletteCommandHandlers,
): CommandDef[] {
  return [
    {
      id: "addTask",
      label: "เพิ่มงานใหม่",
      hint: "Add task",
      requires: { action: "task.add" },
      run: h.onAddTask,
    },
    {
      id: "refresh",
      label: "Refresh ข้อมูล",
      hint: "ดึงข้อมูลใหม่จากชีต",
      run: h.onRefresh,
    },
    {
      id: "toggleTheme",
      label: isDark ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด",
      hint: "Dark mode toggle",
      run: h.onToggleTheme,
    },
    {
      id: "openSummary",
      label: "เปิด Summary",
      hint: "สรุปภาพรวมทั้งหมด",
      run: h.onOpenSummary,
    },
  ];
}
