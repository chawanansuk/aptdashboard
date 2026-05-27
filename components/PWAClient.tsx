"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { shouldPromptUpdate } from "@/lib/version";

// The deploy this bundle was built from (baked in via next.config env).
// "dev" locally — we never prompt for updates there.
const LOADED_BUILD = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
const VERSION_CHECK_INTERVAL_MS = 5 * 60_000;

export default function PWAClient() {
  const [offline, setOffline] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const checkedRef = useRef(false); // stop polling once an update is found

  // Compare the live deployment's build against the one we booted with.
  // A mismatch means a newer version shipped while this session stayed open
  // — common for an installed PWA that's never fully closed, which is how
  // staff end up running code from before a fix.
  const checkVersion = useCallback(async () => {
    if (checkedRef.current) return;
    if (LOADED_BUILD === "dev") return; // local/dev — nothing to compare
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) return;
      const data: { build?: string } = await res.json();
      if (shouldPromptUpdate(LOADED_BUILD, data.build)) {
        checkedRef.current = true;
        setUpdateReady(true);
      }
    } catch {
      // offline / transient — try again on the next tick
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (
      "serviceWorker" in navigator &&
      window.location.protocol === "https:" &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => console.warn("[sw] register failed", err));
    }

    const updateOnline = () => setOffline(!navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);

    // Version polling: on load, on an interval, and whenever the user
    // refocuses the app (cheap, and that's exactly when a stale session
    // is about to be used again).
    void checkVersion();
    const timer = setInterval(() => void checkVersion(), VERSION_CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkVersion();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [checkVersion]);

  if (!offline && !updateReady) return null;

  return (
    <>
      {updateReady && (
        <div className="ac-update-bar" role="status" aria-live="polite">
          <span>🔄 มีเวอร์ชันใหม่พร้อมใช้งาน</span>
          <button
            type="button"
            className="ac-update-btn"
            onClick={() => window.location.reload()}
          >
            แตะเพื่ออัปเดต
          </button>
        </div>
      )}
      {offline && (
        <div className="ac-offline-bar" role="status" aria-live="polite">
          ⚠ ออฟไลน์ — แสดงข้อมูลล่าสุดที่เคยโหลด • บันทึกไม่ได้จนกว่าจะกลับออนไลน์
        </div>
      )}
    </>
  );
}
