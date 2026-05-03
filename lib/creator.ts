"use client";

const KEY = "creatorName";

export function getCreator(): string {
  if (typeof window === "undefined") return "";
  return (localStorage.getItem(KEY) || "").trim();
}

export function setCreator(name: string): void {
  if (typeof window === "undefined") return;
  const v = (name || "").trim();
  if (v) localStorage.setItem(KEY, v);
  else localStorage.removeItem(KEY);
}

export function creatorInitials(name: string): string {
  const n = (name || "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
