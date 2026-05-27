/**
 * Auto-link "ชมห้อง" (room viewing) tasks to the Lead CRM (ผู้สนใจเช่า).
 *
 * A viewing task and a lead are correlated by **phone number** — no schema
 * change needed (both carry `phone`). When sales book a viewing we ensure a
 * lead exists; when they close it ("เสร็จ" = viewed / "ไม่สนใจ" = passed) the
 * lead's pipeline stage advances automatically. Goal: conversion tracking
 * with (almost) no extra data entry by sales.
 *
 * Pure helpers only — the network calls live in the page handlers so this
 * stays trivially testable.
 */
import type { Lead, LeadStage } from "@/types";

/** Digits-only form for matching — ignores spaces, dashes, +66 vs 0, etc. */
export function normalizePhone(s: string | null | undefined): string {
  return (s || "").replace(/\D/g, "");
}

/** Find an existing lead by phone (normalized). Empty phone never matches. */
export function findLeadByPhone(leads: Lead[], phone: string | null | undefined): Lead | undefined {
  const p = normalizePhone(phone);
  if (!p) return undefined;
  return leads.find((l) => normalizePhone(l.phone) === p);
}

/** The "won path" in pipeline order. "ปิดเลิก" (lost) sits off this path and
 *  is handled explicitly, so it's intentionally excluded here. */
const WON_PATH: LeadStage[] = ["ใหม่", "นัดดูแล้ว", "กำลังคุย", "ทำสัญญา", "ปิดดีล"];

function wonIndex(stage: string): number {
  return WON_PATH.indexOf(stage as LeadStage);
}

/** Stage a freshly auto-created lead starts at when a viewing is booked. */
export const STAGE_ON_VIEWING_SCHEDULED: LeadStage = "นัดดูแล้ว";

/**
 * Decide the lead's next stage when a viewing task is closed. Returns null
 * to mean "leave the lead alone" (no regressions, no clobbering a won deal).
 *
 *   taskStatus "เสร็จ"   (viewed)         → "กำลังคุย", but only if the lead
 *                                           hasn't already moved further.
 *   taskStatus "ไม่สนใจ" (not interested) → "ปิดเลิก", unless already won/signing.
 *   anything else ("ยกเลิก", ...)         → null (cancelled appointment ≠ lost lead).
 */
export function nextStageOnViewingClosed(
  currentStage: string,
  taskStatus: string,
): LeadStage | null {
  const s = (taskStatus || "").trim();
  const done = s === "เสร็จ" || s === "done" || s === "ปิดแล้ว";
  const notInterested = s === "ไม่สนใจ";

  if (notInterested) {
    if (currentStage === "ปิดดีล" || currentStage === "ทำสัญญา") return null;
    return currentStage === "ปิดเลิก" ? null : "ปิดเลิก";
  }
  if (done) {
    return wonIndex(currentStage) < wonIndex("กำลังคุย") ? "กำลังคุย" : null;
  }
  return null;
}
