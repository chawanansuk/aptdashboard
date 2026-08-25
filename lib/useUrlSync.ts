"use client";

/**
 * URL ⇄ state sync (UI audit r21) — คู่กับ lib/urlState.ts.
 *
 * ทิศทาง state → URL:
 *   - เปลี่ยนหน้า (view)      → pushState (กด back ย้อนหน้าได้)
 *   - เปิด room modal          → pushState (กด back ปิดโมดัล — สำคัญบนมือถือ)
 *   - เปลี่ยนฟิลเตอร์ตึก       → replaceState (ไม่สแปม history)
 *   - ปิด room modal ผ่าน UI   → replaceState (back ไม่เด้งเปิดโมดัลซ้ำ)
 *
 * ทิศทาง URL → state:
 *   - popstate (back/forward)  → apply ทั้ง view/building/room
 *   - deep link ตอนเปิดแอป     → view/building apply ทันที (view จัดการใน
 *     useViewRouting เพื่อชนะ mode-landing), ห้องรอ rooms โหลดเสร็จก่อน
 *
 * กัน loop: effect จะเขียน history เฉพาะเมื่อ query ที่คำนวณได้ต่างจาก
 * ที่อยู่บน address bar — การ apply จาก popstate ทำให้สองฝั่งตรงกันอยู่แล้ว.
 */

import { useEffect, useRef } from "react";
import type { RoomView } from "@/types";
import { buildSearch, parseUrlState, roomKey, splitRoomKey } from "@/lib/urlState";
import { VALID_VIEWS, type ActiveView } from "@/lib/useViewRouting";

export interface UrlSyncOptions {
  view: string;
  building: string;
  selectedRoom: { building: string; room: string } | null;
  rooms: RoomView[];
  setView: (v: ActiveView) => void;
  setBuilding: (b: string) => void;
  openRoom: (r: RoomView) => void;
  closeRoom: () => void;
}

export function useUrlSync({
  view, building, selectedRoom, rooms,
  setView, setBuilding, openRoom, closeRoom,
}: UrlSyncOptions): void {
  const currentRoomKey = selectedRoom ? roomKey(selectedRoom.building, selectedRoom.room) : null;

  // ---- Deep link ครั้งแรก: building ทันที, ห้องเก็บไว้รอ rooms ----
  const pendingRoomRef = useRef<string | null>(null);
  const initialAppliedRef = useRef(false);
  useEffect(() => {
    if (initialAppliedRef.current) return;
    initialAppliedRef.current = true;
    const s = parseUrlState(window.location.search);
    if (s.building) setBuilding(s.building);
    if (s.room) pendingRoomRef.current = s.room;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // เปิดห้องจาก deep link เมื่อรายชื่อห้องมาแล้ว — หาไม่เจอ (พิมพ์ผิด/
  // ห้องถูกลบ) ก็เงียบๆ ทิ้ง param ให้ effect ด้านล่างเก็บกวาด URL เอง
  useEffect(() => {
    const key = pendingRoomRef.current;
    if (!key || rooms.length === 0) return;
    pendingRoomRef.current = null;
    const parts = splitRoomKey(key);
    if (!parts) return;
    const r = rooms.find((x) => x.building === parts.building && x.room === parts.room);
    if (r) openRoom(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms]);

  // ---- state → URL + document.title ----
  const lastViewRef = useRef(view);
  const lastRoomRef = useRef<string | null>(currentRoomKey);
  // ช่วงเปิดแอป (canonicalize URL + mode landing + โหลด role) ใช้ replace
  // เสมอ — ไม่งั้น landing ของโหมดขาย/ช่างดัน entry เพิ่ม กด back แล้ว
  // เด้งกลับหน้า overview ที่ไม่ได้ตั้งใจเปิด
  const mountedAtRef = useRef(Date.now());
  // document.title ไม่ตั้งที่นี่ — Next streamed metadata ชอบเขียนทับหลัง
  // hydration; page.tsx เรนเดอร์ <title> (React 19 hoisting) แทน.
  useEffect(() => {
    // ห้องที่รอ apply จาก deep link ยังไม่อยู่ใน state — อย่าเพิ่งเขียน URL
    // ทับ ไม่งั้น param room หายก่อนโมดัลได้เปิด
    const target = buildSearch({ view, building, room: currentRoomKey ?? pendingRoomRef.current });
    if (window.location.search === target || (target === "" && window.location.search === "")) {
      lastViewRef.current = view;
      lastRoomRef.current = currentRoomKey;
      return;
    }
    const url = `${window.location.pathname}${target}`;
    const settling = Date.now() - mountedAtRef.current < 500;
    const viewChanged = view !== lastViewRef.current && !settling;
    const roomOpened = currentRoomKey !== null && lastRoomRef.current === null;
    if (viewChanged || roomOpened) {
      window.history.pushState(null, "", url);
    } else {
      window.history.replaceState(null, "", url);
    }
    lastViewRef.current = view;
    lastRoomRef.current = currentRoomKey;
  }, [view, building, currentRoomKey]);

  // ---- URL → state (back / forward) ----
  // Ref สด ๆ ของ props เพื่อให้ handler ตัวเดียวอยู่ยาวทั้งอายุ component
  const stateRef = useRef({ view, building, currentRoomKey, rooms, setView, setBuilding, openRoom, closeRoom });
  stateRef.current = { view, building, currentRoomKey, rooms, setView, setBuilding, openRoom, closeRoom };
  useEffect(() => {
    const onPop = () => {
      const c = stateRef.current;
      const s = parseUrlState(window.location.search);
      const nextView = s.view && (VALID_VIEWS as string[]).includes(s.view) ? s.view : "overview";
      if (nextView !== c.view) c.setView(nextView as ActiveView);
      const nextBuilding = s.building || "ทั้งหมด";
      if (nextBuilding !== c.building) c.setBuilding(nextBuilding);
      const nextRoom = s.room ?? null;
      if (nextRoom !== c.currentRoomKey) {
        if (!nextRoom) {
          c.closeRoom();
        } else {
          const parts = splitRoomKey(nextRoom);
          const r = parts ? c.rooms.find((x) => x.building === parts.building && x.room === parts.room) : undefined;
          if (r) c.openRoom(r);
        }
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
}
