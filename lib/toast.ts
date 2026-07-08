"use client";

import { toast as sonner } from "sonner";

/**
 * Thin wrapper around sonner so the whole app has ONE place to control
 * toast tone, duration, and dismissibility — and so swapping the library
 * later only requires changing this file.
 *
 * Variants per the design spec:
 *   success — green  · 3000ms · auto-dismiss
 *   error   — red    · 5000ms · explicit dismiss button (sonner default
 *                                 includes close button when duration is
 *                                 long enough; we also set dismissible:true)
 *   info    — blue   · 4000ms · auto-dismiss
 *
 * Use these helpers everywhere instead of calling sonner directly so the
 * config stays in lockstep. Sonner exports `toast.promise` etc. — if we
 * need those later, re-export from here.
 */

/** One-tap action button rendered inside the toast (sonner passthrough). */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export const toast = {
  success(message: string, opts?: { description?: string; action?: ToastAction }) {
    return sonner.success(message, {
      description: opts?.description,
      // An actionable toast needs time to be tapped before auto-dismiss.
      duration: opts?.action ? 8_000 : 3_000,
      action: opts?.action,
    });
  },

  error(message: string, opts?: { description?: string }) {
    return sonner.error(message, {
      description: opts?.description,
      duration: 5_000,
      dismissible: true,
      // Show a visible close action so the user can dismiss before 5s
      closeButton: true,
    });
  },

  info(message: string, opts?: { description?: string; action?: ToastAction }) {
    return sonner.info(message, {
      description: opts?.description,
      duration: opts?.action ? 8_000 : 4_000,
      action: opts?.action,
    });
  },

  /** Imperative dismiss — useful when the trigger that produced a toast
   *  also produces a navigation that should silence it. */
  dismiss(id?: string | number): void {
    sonner.dismiss(id);
  },
};

export default toast;
