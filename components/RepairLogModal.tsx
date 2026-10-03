"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { Role } from "@/auth";
import type { RoomView, SheetRow } from "@/types";
import { Icon } from "@/lib/icons";
import { bangkokTodayYmd, parseThaiDate } from "@/lib/dateUtils";
import { isClosedStatus } from "@/lib/constants";
import { parseCostInput } from "@/lib/taskCost";
import { resilientPost } from "@/lib/resilientWrite";
import { toast } from "@/lib/toast";
import { publishBusEvent } from "@/lib/realtimeBus";
import { formatCommonArea, COMMON_AREA_BARE } from "@/lib/taskLocation";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { REPAIR_CATEGORIES, suggestRepairCategory, type RepairCategory } from "@/lib/repairCategories";
import { RepairPartsPicker, type RepairPartLine } from "@/components/RoomRepairParts";
import { fileRequisitionLines } from "@/lib/partsRequisition";
import { floorSortKey } from "@/lib/salesData";
import { MAINT_TYPES } from "@/lib/maintLog";
import { taskKey } from "@/lib/taskKey";
import { taskTypeDenied } from "@/lib/taskTypePermission";

/** Two reports of the same text on the same room this close together are
 *  one job, not two — the server refuses (Code.gs duplicate-recent); the
 *  form asks first so a second tap never has to go that far. */
export const RECENT_DUP_MINUTES = 10;

export interface RepairLogFormProps {
  rooms: RoomView[];
  /** Live task list — recent-duplicate check + "append to the open job". */
  tasks: SheetRow[];
  roles: Role[] | undefined;
  /** Pre-select a building (the header's building filter). */
  initialBuilding?: string;
  /** The room is known (room window) — no area/building/room pickers. */
  fixedRoom?: { building: string; room: string };
  refresh: () => void;
  optimisticAddTask: (t: SheetRow) => void;
  /** Called after a successful save (or a "already logged" skip). */
  onSaved?: () => void;
  onCancel?: () => void;
  /** Inside another panel (room window tab): no dialog chrome, no cancel. */
  embedded?: boolean;
  /** The dialog wrapper listens so Esc / backdrop can't close mid-save. */
  onSavingChange?: (saving: boolean) => void;
}

function myName(session: ReturnType<typeof useSession>["data"]): string {
  const n = (session?.user?.name || "").trim();
  if (n) return n;
  return (session?.user?.email || "").split("@")[0] || "";
}

/** A task's creation time as epoch ms (createdAt "yyyy-MM-dd HH:mm"). */
function createdMs(t: SheetRow): number | null {
  const m = (t.createdAt || "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}

const normText = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Find a job logged moments ago with the same text on the same room —
 * exported for tests. `now` is the device clock; createdAt is Bangkok
 * wall time, which is what a Thai phone shows, so the comparison holds
 * for the people using it.
 */
export function findRecentDuplicate(
  tasks: SheetRow[],
  q: { building: string; room: string; type: string; note: string },
  now: number = Date.now(),
): { task: SheetRow; minutesAgo: number } | null {
  const note = normText(q.note);
  for (const t of tasks) {
    if (t.type !== q.type || t.building !== q.building || t.room !== q.room) continue;
    if (normText(t.note || "") !== note) continue;
    const ms = createdMs(t);
    if (ms === null) continue;
    const minutesAgo = Math.round((now - ms) / 60_000);
    if (minutesAgo >= 0 && minutesAgo <= RECENT_DUP_MINUTES) return { task: t, minutesAgo };
  }
  return null;
}

/**
 * The one way a finished (or just-started) maintenance job is written
 * down — รอบ 1 งานซ่อมจุกจิก. Replaces three forms that each captured a
 * different subset: pick the room by tapping, the category is guessed
 * from the text, "who did it" is a tap, cost is optional. Used by the
 * ซ่อมบำรุง log, the room window's บันทึกซ่อม tab, and the phone's +.
 */
export function RepairLogForm({
  rooms, tasks, roles, initialBuilding, fixedRoom, refresh, optimisticAddTask, onSaved, onCancel, embedded, onSavingChange,
}: RepairLogFormProps) {
  const { data: session } = useSession();
  const me = myName(session);
  // "It was me" is the default only for someone whose job IS the repairs
  // (primary role engineer). A manager who also holds the engineer role is
  // usually logging the engineer's work (audit r37).
  const primaryEngineer = (roles || [])[0] === "engineer";
  // Types this user may file (a sales user can't add ซ่อม — the server
  // would 403 the form's old default).
  const allowedTypes = useMemo(
    () => MAINT_TYPES.filter((t) => !taskTypeDenied(t, roles)),
    [roles],
  );

  const buildings = useMemo(() => Array.from(new Set(rooms.map((r) => r.building))), [rooms]);
  const [area, setArea] = useState<"room" | "common">("room");
  const [building, setBuilding] = useState(
    fixedRoom?.building
      || (initialBuilding && buildings.includes(initialBuilding) ? initialBuilding : (buildings[0] || "")),
  );
  const [room, setRoom] = useState(fixedRoom?.room || "");
  const [spot, setSpot] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [type, setType] = useState<string>(() => allowedTypes[0] ?? "ซ่อม");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<RepairCategory | "">("");
  const [categoryTouched, setCategoryTouched] = useState(false);
  // Who did the work. One in-house engineer today: if that's who is
  // typing, it's them; someone logging on their behalf taps "ช่าง".
  const [who, setWho] = useState<string>(primaryEngineer ? me : "ช่าง");
  const [whoCustom, setWhoCustom] = useState(false);
  const [parts, setParts] = useState<RepairPartLine[]>([]);
  const [cost, setCost] = useState("");
  const [doneAlready, setDoneAlready] = useState(true);
  const [workDate, setWorkDate] = useState<string>(() => bangkokTodayYmd());
  const [saving, setSavingState] = useState(false);
  const setSaving = (v: boolean) => { setSavingState(v); onSavingChange?.(v); };
  const [dup, setDup] = useState<{ minutesAgo: number } | null>(null);
  // The last save timed out (Google may have written it). If the retry is
  // then refused as a duplicate, that duplicate IS this entry — finish the
  // save (parts included) instead of dropping it (audit r37).
  const maybeSavedRef = useRef(false);

  // The engineer's name arrives with the session a tick after mount.
  useEffect(() => { if (primaryEngineer && me) setWho((w) => (w === "ช่าง" || w === "" ? me : w)); }, [primaryEngineer, me]);

  // Guess the category from the text until the user picks one themselves.
  useEffect(() => {
    if (categoryTouched || type !== "ซ่อม") return;
    const s = suggestRepairCategory(note);
    setCategory(s ?? "");
  }, [note, type, categoryTouched]);

  const buildingRoomCount = useMemo(() => rooms.filter((r) => r.building === building).length, [rooms, building]);
  const roomChips = useMemo(() => {
    const list = rooms.filter((r) => r.building === building);
    const q = roomFilter.trim();
    const filtered = q ? list.filter((r) => r.room.includes(q)) : list;
    return [...filtered].sort((a, b) => {
      const [fa, sa] = floorSortKey(a.floor || "");
      const [fb, sb] = floorSortKey(b.floor || "");
      return fa - fb || sa.localeCompare(sb) || a.room.localeCompare(b.room, undefined, { numeric: true });
    });
  }, [rooms, building, roomFilter]);

  const whoOptions = useMemo(() => {
    const opts = [] as { key: string; label: string; value: string }[];
    if (me) opts.push({ key: "me", label: primaryEngineer ? `${me} (ฉัน)` : `ฉัน (${me})`, value: me });
    if (!primaryEngineer || !me) opts.push({ key: "eng", label: "ช่าง", value: "ช่าง" });
    opts.push({ key: "ext", label: "ช่างนอก", value: "ช่างนอก" });
    return opts;
  }, [me, primaryEngineer]);

  async function submit(force = false) {
    const detail = note.trim();
    if (!detail) { toast.error("พิมพ์ว่าทำอะไรไปก่อน"); return; }
    if (area === "room" && !room.trim()) { toast.error("เลือกห้องก่อน"); return; }
    const finalRoom = area === "room"
      ? room.trim()
      : (spot.trim() ? formatCommonArea(spot.trim()) : COMMON_AREA_BARE);
    const finalCategory = type === "ซ่อม" ? (category || "อื่นๆ") : "";
    const finalWho = who.trim();
    const costNum = cost ? parseCostInput(cost) : 0;
    const dateOut = workDate || bangkokTodayYmd();
    // Logged as done on the day it was done: a back-dated entry belongs to
    // that day, not to today (Code.gs v3.37 stamps เสร็จเมื่อ only for today).
    const doneToday = dateOut === bangkokTodayYmd();

    if (!force) {
      const recent = findRecentDuplicate(tasks, { building, room: finalRoom, type, note: detail });
      if (recent) { setDup({ minutesAgo: recent.minutesAgo }); return; }
    }
    setDup(null);

    const body = {
      action: "addTask",
      date: dateOut,
      type,
      building,
      room: finalRoom,
      note: detail,
      ...(doneAlready ? { status: "เสร็จ" } : {}),
      ...(costNum > 0 ? { cost: costNum } : {}),
      ...(finalCategory ? { category: finalCategory } : {}),
      ...(finalWho ? { doneBy: finalWho } : {}),
      // "ใช่ บันทึกอีกรายการ": the user confirmed a genuine second identical
      // job — skip the server's 10-minute duplicate guard too.
      ...(force ? { allowRecentDuplicate: true } : {}),
    };
    setSaving(true);
    try {
      // A job filed as done is outside the server's open-task dedup (it has
      // its own 10-minute guard) — never auto-retry it, a dropped reply must
      // not become two rows.
      const { res, data } = await resilientPost("/api/sheet/update", body, { retries: doneAlready ? 0 : 3 });
      if (res.status === 504) {
        maybeSavedRef.current = true;
        toast.warning(String(data.error || "หลังบ้าน Google ตอบช้า — รายการอาจบันทึกไปแล้ว"), {
          description: "รีเฟรชแล้วดูในบันทึกก่อน ถ้ายังไม่ขึ้นค่อยลงใหม่",
          duration: 10000,
        });
        refresh();
        return;
      }
      if (!data.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");

      const skipped = (data as { skipped?: string }).skipped;
      // `written`: a row was added or a fix was appended — only then do parts
      // leave the stock and the form count as saved.
      let written = false;
      if (skipped === "duplicate-recent" && maybeSavedRef.current) {
        // The timed-out save did land — this is that row.
        written = true;
        toast.success("รายการที่ Google ตอบช้าเมื่อกี้บันทึกเข้าแล้ว");
      } else if (skipped === "duplicate-recent") {
        toast.info("เพิ่งบันทึกรายการเดียวกันไปเมื่อสักครู่ — ไม่บันทึกซ้ำ");
      } else if (skipped === "duplicate-open" && doneAlready) {
        // The server found an OPEN job with this exact text on this day —
        // the same job, now finished. Close THAT one (with the cost, category
        // and who) instead of filing a second row. Matched the way the server
        // matched: same day as the entry, same text (audit r37).
        const wantDay = parseThaiDate(dateOut);
        const blocker = tasks.find((t) => {
          const d = parseThaiDate(t.date);
          return t.type === type && t.building === building && t.room === finalRoom &&
            !isClosedStatus(t.status) && !!d && !!wantDay &&
            d.getFullYear() === wantDay.getFullYear() && d.getMonth() === wantDay.getMonth() && d.getDate() === wantDay.getDate() &&
            normText(t.note || "") === normText(detail);
        });
        if (!blocker) throw new Error("มีงานค้างข้อความเดียวกันของวันนั้นอยู่แล้ว — ปิดงานนั้นในกระดานช่างแทน");
        const extras = {
          ...(costNum > 0 ? { cost: costNum } : {}),
          ...(finalCategory ? { category: finalCategory } : {}),
          ...(finalWho ? { doneBy: finalWho } : {}),
        };
        if (Object.keys(extras).length > 0) {
          const { res: upRes, data: upData } = await resilientPost("/api/sheet/update", {
            action: "updateTask",
            id: blocker.id || undefined,
            match: { date: blocker.date, type: blocker.type, building: blocker.building, room: blocker.room },
            ...extras,
          }, { retries: 0 });
          if (!upData.ok) throw new Error(upData.error || `HTTP ${upRes.status}`);
        }
        const { res: stRes, data: stData } = await resilientPost("/api/sheet/update", {
          action: "updateTaskStatus",
          id: blocker.id || undefined,
          date: blocker.date, type: blocker.type, building: blocker.building, room: blocker.room,
          status: "เสร็จ",
          ...(finalWho ? { doneBy: finalWho } : {}),
        }, { retries: 0 });
        if (!stData.ok) throw new Error(stData.error || `HTTP ${stRes.status}`);
        written = true;
        toast.success("ปิดงานค้างที่ตรงกันให้แล้ว (ไม่สร้างรายการซ้ำ)");
      } else if (skipped) {
        // An open job with this text already exists for that day and the
        // user is adding another open one — nothing was written; keep the
        // form so they can change the text or the date.
        toast.warning("ยังไม่ได้บันทึก — มีงานค้างแบบเดียวกันของวันนั้นอยู่แล้ว", {
          description: "แก้ข้อความหรือวันที่ แล้วบันทึกอีกครั้ง",
          duration: 8000,
        });
        refresh();
        return;
      } else {
        written = true;
        toast.success(doneAlready ? "ลงบันทึกแล้ว" : "เพิ่มงานค้างแล้ว");
        optimisticAddTask({
          date: dateOut, type, building, room: finalRoom,
          customer: "", phone: "", note: detail,
          status: doneAlready ? "เสร็จ" : "",
          ...(costNum > 0 ? { cost: costNum } : {}),
          ...(finalCategory ? { category: finalCategory } : {}),
          ...(finalWho ? { doneBy: finalWho } : {}),
          ...(doneAlready && doneToday ? { doneAt: `${bangkokTodayYmd()} ${new Date().toTimeString().slice(0, 5)}` } : {}),
        });
      }
      // Parts leave the stock only when a job was actually written — a
      // skipped duplicate used to withdraw them a second time.
      if (written) {
        await fileRequisitionLines(parts, {
          building, room: finalRoom, jobNote: detail,
          taskKey: taskKey({ date: dateOut, building, room: finalRoom, type }),
        });
      }
      publishBusEvent({ kind: "data-changed", source: "task", ts: Date.now() });
      refresh();
      maybeSavedRef.current = false;
      setNote(""); setParts([]); setCost(""); setCategory(""); setCategoryTouched(false);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ", {
        description: "ข้อมูลในฟอร์มยังอยู่ ลองกดบันทึกอีกครั้ง",
      });
    } finally {
      setSaving(false);
    }
  }

  const chip = (active: boolean, extra = "") => `ac-chip ${active ? "is-active" : ""} ${extra}`.trim();

  return (
    <div className={`ac-rlog ${embedded ? "ac-rlog-embedded" : ""}`}>
      {!fixedRoom && (
        <>
          <div className="ac-rlog-chips" role="group" aria-label="พื้นที่">
            <button type="button" className={chip(area === "room")} aria-pressed={area === "room"} onClick={() => setArea("room")}>
              <Icon name="doorOpen" /> ห้องพัก
            </button>
            <button type="button" className={chip(area === "common")} aria-pressed={area === "common"} onClick={() => setArea("common")}>
              <Icon name="facilities" /> ส่วนกลาง
            </button>
          </div>

          <div className="ac-field">
            <span className="ac-rlog-label">ตึก</span>
            <div className="ac-rlog-chips" role="group" aria-label="ตึก">
              {buildings.map((b) => (
                <button key={b} type="button" className={chip(building === b)} aria-pressed={building === b}
                  onClick={() => { setBuilding(b); setRoom(""); setRoomFilter(""); }}>{b}</button>
              ))}
            </div>
          </div>

          {area === "room" ? (
            <div className="ac-field">
              <span className="ac-rlog-label">ห้อง{room ? ` — ${room}` : ""}</span>
              {/* Shown by the BUILDING's room count, not the filtered one —
                  keyed on the filtered list it vanished after one digit and
                  left the filter stuck (audit r37). */}
              {buildingRoomCount > 24 && (
                <input id="rlog-room-filter" aria-label="กรองเลขห้อง" inputMode="numeric" value={roomFilter}
                  onChange={(e) => setRoomFilter(e.target.value)} placeholder="พิมพ์เลขห้องเพื่อกรอง" />
              )}
              <div className="ac-rlog-chips ac-rlog-rooms" role="group" aria-label="เลือกห้อง">
                {roomChips.map((r) => (
                  <button key={`${r.building}|${r.room}`} type="button"
                    className={chip(room === r.room, "ac-rlog-roomchip")} aria-pressed={room === r.room}
                    onClick={() => setRoom(r.room)}>{r.room}</button>
                ))}
                {roomChips.length === 0 && <span className="ac-field-hint">ไม่มีห้องตรงกับที่พิมพ์</span>}
              </div>
            </div>
          ) : (
            <div className="ac-field">
              <label htmlFor="rlog-spot">จุด/บริเวณ (ไม่บังคับ)</label>
              <input id="rlog-spot" value={spot} onChange={(e) => setSpot(e.target.value)}
                placeholder="เช่น โถงชั้น 1, ลานจอดรถ, ดาดฟ้า" />
            </div>
          )}

          <div className="ac-field">
            <span className="ac-rlog-label">ประเภท</span>
            <div className="ac-rlog-chips" role="group" aria-label="ประเภทงาน">
              {allowedTypes.map((t) => (
                <button key={t} type="button" className={chip(type === t)} aria-pressed={type === t} onClick={() => setType(t)}>{t}</button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="ac-field">
        <label htmlFor="rlog-note">ทำอะไรไป *</label>
        <textarea id="rlog-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="เช่น เปลี่ยนหลอดไฟห้องน้ำ / ก๊อกรั่ว เปลี่ยนวาล์ว / ล้างแอร์" disabled={saving} />
      </div>

      {type === "ซ่อม" && (
        <div className="ac-field">
          <span className="ac-rlog-label">หมวด{!categoryTouched && category ? <span className="ac-rlog-guess"> · เดาจากข้อความ</span> : null}</span>
          <div className="ac-rlog-chips" role="group" aria-label="หมวดงานซ่อม">
            {REPAIR_CATEGORIES.map((c) => (
              <button key={c} type="button" className={chip(category === c)} aria-pressed={category === c}
                onClick={() => { setCategory(c); setCategoryTouched(true); }}>{c}</button>
            ))}
          </div>
        </div>
      )}

      <div className="ac-field">
        <span className="ac-rlog-label">ใครทำ</span>
        <div className="ac-rlog-chips" role="group" aria-label="ใครทำ">
          {whoOptions.map((o) => (
            <button key={o.key} type="button" className={chip(!whoCustom && who === o.value)} aria-pressed={!whoCustom && who === o.value}
              onClick={() => { setWho(o.value); setWhoCustom(false); }}>{o.label}</button>
          ))}
          <button type="button" className={chip(whoCustom)} aria-pressed={whoCustom}
            onClick={() => { setWhoCustom(true); setWho(""); }}>พิมพ์ชื่อ</button>
        </div>
        {whoCustom && (
          <input aria-label="ชื่อคนทำ" value={who} onChange={(e) => setWho(e.target.value)} placeholder="ชื่อช่าง / ร้าน" />
        )}
      </div>

      <RepairPartsPicker lines={parts} onChange={setParts} disabled={saving} />

      <div className="ac-field">
        <label htmlFor="rlog-cost">ค่าใช้จ่าย (บาท ไม่บังคับ)</label>
        <input id="rlog-cost" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="เช่น 350" />
      </div>

      <details className="ac-rlog-more">
        <summary>ลงย้อนหลัง / ยังไม่เสร็จ</summary>
        <div className="ac-field">
          <label htmlFor="rlog-date">วันที่ทำ</label>
          <input id="rlog-date" type="date" value={workDate} max={bangkokTodayYmd()} onChange={(e) => setWorkDate(e.target.value)} />
        </div>
        <label className="ac-mlog-donechk">
          <input type="checkbox" checked={doneAlready} onChange={(e) => setDoneAlready(e.target.checked)} />
          <span>งานเสร็จแล้ว (ติ๊กออกถ้าเพิ่งเริ่ม/ยังไม่เสร็จ)</span>
        </label>
      </details>

      {dup && (
        <div className="ac-rlog-dup" role="alert">
          <div>เพิ่งบันทึกข้อความเดียวกันของห้องนี้ไปเมื่อ {dup.minutesAgo === 0 ? "สักครู่" : `${dup.minutesAgo} นาทีก่อน`} — ซ่อมอีกรอบจริงไหม?</div>
          <div className="ac-rlog-dup-actions">
            <button type="button" className="ac-btn ac-btn-ghost" onClick={() => setDup(null)}>ไม่ใช่ ยกเลิก</button>
            <button type="button" className="ac-btn ac-btn-secondary" onClick={() => void submit(true)}>ใช่ บันทึกอีกรายการ</button>
          </div>
        </div>
      )}

      <div className={embedded ? "ac-rlog-actions" : "ac-modal-foot"}>
        {!embedded && onCancel && (
          <button type="button" className="ac-btn ac-btn-ghost" onClick={onCancel} disabled={saving}>ยกเลิก</button>
        )}
        <button type="button" className="ac-btn ac-btn-primary" onClick={() => void submit()} disabled={saving || !note.trim()}>
          {saving && <span className="ac-btn-spinner" aria-hidden />}
          {saving ? "กำลังบันทึก…" : doneAlready ? "บันทึก" : "เพิ่มงานค้าง"}
        </button>
      </div>
    </div>
  );
}

export default function RepairLogModal(props: Omit<RepairLogFormProps, "embedded" | "onCancel"> & { onClose: () => void }) {
  const { onClose, ...form } = props;
  const dialogRef = useRef<HTMLDivElement>(null);
  // Esc / backdrop must not drop the form mid-save: the request would
  // finish against an unmounted form and "ข้อมูลในฟอร์มยังอยู่" would be false.
  const busyRef = useRef(false);
  const close = () => { if (!busyRef.current) onClose(); };
  useFocusTrap(true, dialogRef);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") close(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);
  return (
    <div className="ac-modal-backdrop" onClick={close}>
      <div ref={dialogRef} className="ac-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="ลงบันทึกงานซ่อมบำรุง">
        <header className="ac-modal-head">
          <div className="ac-modal-title"><Icon name="maintenance" /> ลงบันทึกงานซ่อมบำรุง</div>
          <button type="button" className="ac-modal-close" onClick={close} aria-label="ปิด"><Icon name="close" /></button>
        </header>
        <div className="ac-modal-body">
          <RepairLogForm
            {...form}
            onCancel={close}
            onSavingChange={(b) => { busyRef.current = b; }}
            onSaved={() => { form.onSaved?.(); onClose(); }}
          />
        </div>
      </div>
    </div>
  );
}
