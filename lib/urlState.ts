/**
 * URL ต่อหน้า (UI audit r21) — เดิมทุกหน้าเป็น "/" ล้วน: กด back ไม่ได้,
 * refresh เด้งตาม localStorage, แชร์ลิงก์หน้า/ห้องให้เพื่อนร่วมทีมไม่ได้.
 *
 * รูปแบบ: /?view=tenants&building=มีทอง&room=มีทอง:101
 *   - view     ทุกหน้า (ค่าใน VALID_VIEWS)
 *   - building เฉพาะเมื่อกรองตึก (ค่า "ทั้งหมด" ไม่ใส่)
 *   - room     เฉพาะเมื่อ room modal เปิด — key "ตึก:ห้อง"
 *
 * ไฟล์นี้เป็น pure helpers (เทสได้ตรงๆ) — ส่วน history/popstate อยู่ที่
 * lib/useUrlSync.ts. จงใจใช้ query string + history API แทน App Router
 * routes เพื่อไม่แตะโครง SPA เดิม (state ฟิลเตอร์/ฟีเจอร์ทุกอย่างอยู่ครบ).
 */

export interface UrlState {
  view?: string;
  building?: string;
  /** "ตึก:ห้อง" — ':' ไม่ชนชื่อตึก/เลขห้องจริงในชีท. */
  room?: string;
}

export function parseUrlState(search: string): UrlState {
  const p = new URLSearchParams(search);
  const out: UrlState = {};
  const view = p.get("view");
  const building = p.get("building");
  const room = p.get("room");
  if (view) out.view = view;
  if (building) out.building = building;
  if (room && room.includes(":")) out.room = room;
  return out;
}

export function roomKey(building: string, room: string): string {
  return `${building}:${room}`;
}

export function splitRoomKey(key: string): { building: string; room: string } | null {
  const i = key.indexOf(":");
  if (i <= 0 || i === key.length - 1) return null;
  return { building: key.slice(0, i), room: key.slice(i + 1) };
}

/* ---- Programmatic-navigation intent (audit r22) ----
 * เดิม useUrlSync เดา push/replace จากเวลา 500ms หลัง mount ("settling")
 * ซึ่งแพ้ session ที่โหลดช้า: mode landing/redirect ที่มาช้ากว่านั้นถูก
 * push เป็น history entry ผี กด back แล้วเจอหน้าที่ไม่เคยเปิด. แก้เป็น
 * สัญญาณตรงๆ — useViewRouting เรียก markProgrammaticNav() ก่อน
 * setActiveView ภายใน (landing / deep link / route guard) แล้ว
 * useUrlSync consume: เปลี่ยนหน้าแบบ programmatic = replaceState เสมอ.
 * Module singleton พอ — แดชบอร์ดมี instance เดียวต่อแท็บ. */
let programmaticNav = false;
export function markProgrammaticNav(): void { programmaticNav = true; }
export function consumeProgrammaticNav(): boolean {
  const v = programmaticNav;
  programmaticNav = false;
  return v;
}

/** ประกอบ query string จาก state ปัจจุบัน — ค่า default ไม่ใส่ให้ URL สั้น. */
export function buildSearch(state: { view: string; building?: string; room?: string | null }): string {
  const p = new URLSearchParams();
  if (state.view) p.set("view", state.view);
  if (state.building && state.building !== "ทั้งหมด") p.set("building", state.building);
  if (state.room) p.set("room", state.room);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** ชื่อหน้า (ตรงกับป้ายเมนู sidebar) — ใช้ตั้ง document.title ต่อหน้า. */
export const VIEW_TITLES: Record<string, string> = {
  overview: "ภาพรวม",
  today: "งานวันนี้",
  occupied: "มีผู้เช่า",
  ready: "พร้อมขาย",
  pending: "รอสัญญา",
  moveout: "แจ้งย้ายออก",
  qc: "รอตรวจ/QC",
  repair: "รอเข้าซ่อม",
  inactive: "ไม่ได้ใช้งาน",
  income: "รายได้",
  tenants: "ผู้เช่า",
  calendar: "ปฏิทิน",
  maintenance: "ซ่อมบำรุง",
  facilities: "ส่วนกลาง",
  parts: "อะไหล่",
  vehicles: "ยานพาหนะ",
  pets: "สัตว์เลี้ยง",
  leads: "ผู้สนใจเช่า",
  recurring: "งานประจำ",
  maintlog: "บันทึกซ่อมบำรุง",
  salespipeline: "ภาพรวมขาย",
  engineerkanban: "กระดานงานช่าง",
  reports: "รายงาน",
};

export function pageTitle(view: string, building?: string): string {
  const name = VIEW_TITLES[view] || "";
  const b = building && building !== "ทั้งหมด" ? ` · ${building}` : "";
  return name ? `${name}${b} · APARTCLOUD` : "APARTCLOUD";
}
