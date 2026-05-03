"use client";

import { useEffect, useState } from "react";

export default function PWAClient() {
  const [offline, setOffline] = useState(false);

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

    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="ac-offline-bar" role="status" aria-live="polite">
      ⚠ ออฟไลน์ — แสดงข้อมูลล่าสุดที่เคยโหลด • บันทึกไม่ได้จนกว่าจะกลับออนไลน์
    </div>
  );
}
