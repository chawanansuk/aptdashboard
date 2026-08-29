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
import { buildSearch, consumeProgrammaticNav, parseUrlState, roomKey, splitRoomKey } from "@/lib/urlState";
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
    if (s.view && (VALID_VIEWS as string[]).includes(s.view) && s.view !== view) {
      pendingViewRef.current = s.view;
    }
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

  // ---- state → URL ----
  const lastViewRef = useRef(view);
  const lastRoomRef = useRef<string | null>(currentRoomKey);
  // Deep link ?view= ยัง "รอ apply" อยู่ (useViewRouting จะ apply เมื่อ
  // role มาถึง) — ระหว่างนั้นห้ามเขียน URL ทับ ไม่งั้นลิงก์ที่แชร์มาถูก
  // canonicalize เป็น view เก่าจาก localStorage ชั่วขณะ (audit r22).
  // เคลียร์เมื่อ view ขยับครั้งแรก (จะไปทาง deep link หรือ landing ก็ตาม).
  const pendingViewRef = useRef<string | null>(null);
  const initialViewRef = useRef(view);
  // เราเป็นคน push entry ของ room modal เองหรือเปล่า — ปิดผ่าน UI จะได้
  // history.back() แทน replace (ไม่ทิ้ง entry ซ้ำให้กด back สองที).
  const pushedRoomRef = useRef(false);
  // document.title ไม่ตั้งที่นี่ — Next streamed metadata ชอบเขียนทับหลัง
  // hydration; page.tsx เรนเดอร์ <title> (React 19 hoisting) แทน.
  useEffect(() => {
    // consume ก่อน early-return เสมอ — ธง programmatic ของ change ที่
    // URL บังเอิญตรงอยู่แล้ว ห้ามค้างไปกดทับ navigation ครั้งถัดไป
    const programmatic = consumeProgrammaticNav();

    if (pendingViewRef.current) {
      if (view !== initialViewRef.current || view === pendingViewRef.current) {
        pendingViewRef.current = null; // deep link/landing ตัดสินแล้ว
      } else {
        return; // ยังรอ role — อย่าเขียน URL ทับลิงก์ที่แชร์มา
      }
    }

    // ห้องที่รอ apply จาก deep link ยังไม่อยู่ใน state — คง param ไว้ก่อน
    const target = buildSearch({ view, building, room: currentRoomKey ?? pendingRoomRef.current });
    if (window.location.search === target || (target === "" && window.location.search === "")) {
      lastViewRef.current = view;
      lastRoomRef.current = currentRoomKey;
      return;
    }

    // ปิด room modal ผ่าน UI (✕/Esc) หลังจากที่เรา push entry ตอนเปิด —
    // ถอย history กลับแทนการ replace: ไม่เหลือ entry ซ้ำสองอัน (audit r22)
    const roomClosed = currentRoomKey === null && lastRoomRef.current !== null;
    if (roomClosed && pushedRoomRef.current) {
      pushedRoomRef.current = false;
      lastViewRef.current = view;
      lastRoomRef.current = null;
      window.history.back();
      return;
    }

    const url = `${window.location.pathname}${target}`;
    const viewChanged = view !== lastViewRef.current && !programmatic;
    const roomOpened = currentRoomKey !== null && lastRoomRef.current === null;
    if (viewChanged || roomOpened) {
      window.history.pushState(null, "", url);
      if (roomOpened) pushedRoomRef.current = true;
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
      // history เดินเอง → bookkeeping การ push ของเราใช้ไม่ได้แล้ว
      // (กัน history.back() ซ้ำตอน popstate เป็นคนปิดโมดัลเอง)
      pushedRoomRef.current = false;
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
          // rooms ยังไม่โหลด (เช่น forward ทันทีหลัง reload) → เข้าคิวรอ
          // เหมือน deep link ตอน mount — ไม่ปล่อยให้ URL กับจอขัดกัน
          else if (c.rooms.length === 0 && parts) pendingRoomRef.current = nextRoom;
        }
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
}
