import type { Role } from "@/auth";

export function canAddTask(role?: Role | null): boolean {
  return role === "admin" || role === "staff";
}

export function canEditTask(role?: Role | null): boolean {
  return role === "admin" || role === "staff";
}

export function canDeleteTask(role?: Role | null): boolean {
  return role === "admin";
}

export function canEditTenant(role?: Role | null): boolean {
  return role === "admin";
}

export function canRead(role?: Role | null): boolean {
  return role === "admin" || role === "staff";
}
