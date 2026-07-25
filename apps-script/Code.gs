/**
 * Code.gs v3.25.1 — Dashboard หอพัก
 * รวม: Phase 1 setup/UI + Web App backend สำหรับ Vercel
 *
 * ⚠️ เวอร์ชันจริงที่ระบบใช้เช็ก = ตัวแปร BACKEND_VERSION (ค้นหาในไฟล์)
 *    ป้ายชื่อบรรทัดนี้เป็นแค่ human label — แก้ให้ตรงกันทุกครั้งที่ bump
 *
 * NEW v3.25.1:
 *   - updatePhotoNote: เพิ่มคำอธิบายรูปตำหนิทีหลังได้ (เฉพาะรูปที่ยังไม่มี
 *     คำอธิบาย — เขียนได้ครั้งเดียว แก้ทับไม่ได้ เพื่อคงความเป็นหลักฐาน)
 * NEW v3.25.0:
 *   - รูปตำหนิห้อง: uploadRoomPhoto/getRoomPhotos + tab รูปตำหนิ (append-only)
 *     รูปเก็บใน Drive โฟลเดอร์ 'รูปตำหนิหอพัก' (pin ด้วย PHOTO_FOLDER_ID)
 * NEW v3.24.0:
 *   - งานประจำ: เช็คว่าห้องยังมีจริงก่อนสร้างงาน (กันงานกำพร้า) + แถวใหม่ได้ UUID
 *   - ประวัติเบิกอะไหล่: ล่าสุดขึ้นก่อน + จำกัดจำนวนแถว (กันโตไม่หยุด)
 * NEW v3.23.0:
 *   - อะไหล่ column ราคา/หน่วย (col 11) — สต๊อกมีมูลค่า, addPart/updatePart รับ price
 *   - ปิดงานเลยกำหนด → ประทับวันที่เป็นวันนี้ (โผล่ใน "เสร็จวันนี้" ของกระดาน)
 * NEW v3.22.0:
 *   - getTasks_ ส่งเฉพาะงานเปิด + งานปิดย้อนหลัง 120 วัน (payload ไม่โตไม่หยุด)
 *   - getRoomTasks — ประวัติงานเต็มรายห้อง (โมดัลห้องดึงตอนเปิด)
 *   - onEdit หาคอลัมน์จาก header + ล้างผู้เช่าเก่าตอนย้ายออก→ว่าง
 * NEW v3.21.0:
 *   - column id (col 12) — UUID ประจำงาน, auto-backfill ครั้งแรกที่เขียน
 * NEW v3.4.0:
 *   - CacheService 60s TTL สำหรับ getTasks (10x faster repeat reads)
 *   - column I=ผู้สร้าง, J=วันที่สร้าง บันทึกผู้กรอกงาน
 * NEW v3.4.2:
 *   - addTask_ default status 'pending' (เดิม 'ว่าง' เป็นสถานะของห้อง ไม่ใช่งาน)
 *     STATUS_OPTIONS ยังคง 'ว่าง' ไว้สำหรับ backward compat
 * NEW v3.4.3:
 *   - getRooms_/getRoomsCached_ — อ่านชีต ห้อง real-time แทน CSV publish
 *     (CSV publish มี 5min cache จาก Google ที่ทำให้ updateRoomStatus
 *      ไม่เห็นผลทันที)
 *   - clearRoomsCache_ ใน updateRoomStatus_ + onEdit
 * NEW v3.6.0:
 *   - tab "อุปกรณ์" auto-create + actions getRoomEquipment / addEquipment /
 *     updateEquipment (ใช้กับ Engineer mode)
 *   - cache 60s + invalidate ตอน add/update
 * NEW v3.7.0:
 *   - column L "รอบบำรุง(วัน)" ใน tab อุปกรณ์ (auto-expand backward compat)
 *   - action getAllEquipment — list ทั่วโครงการ สำหรับ Maintenance view
 * NEW v3.8.0:
 *   - tab "สาธารณูปโภค" auto-create (building-level facilities:
 *     ลิฟต์/สระว่ายน้ำ/เครื่องปั่นไฟ/ปั๊มน้ำ/WiFi/CCTV/อื่นๆ)
 *   - actions getFacilities / addFacility / updateFacility (engineer + management)
 *   - cache 60s + invalidate ตอน add/update
 * NEW v3.9.0:
 *   - LockService.tryLock(5000) wrap ทุก write action ป้องกัน concurrent write
 *     ชนกัน (10+ user เปิดพร้อมกัน). read actions ไม่ต้อง lock.
 * NEW v3.10.0:
 *   - column K "ค่าใช้จ่าย" ใน tab งาน (auto-expand backward compat)
 *   - addTask_ / updateTask_ รับ b.cost (number); read แสดงใน SheetRow.cost
 * NEW v3.11.0:
 *   - tab "อะไหล่" auto-create (inventory of spare parts — Task 37)
 *     10 columns: id | ชื่อ | หมวด | จำนวนคงเหลือ | จุดสั่งซื้อ |
 *                 หน่วย | หมายเหตุ | ผู้บันทึก | วันที่บันทึก | วันที่ปรับปรุง
 *   - actions getParts / addPart / updatePart / adjustStockPart
 *     (cache 60s + invalidate ตอน write; engineer + management)
 *   - adjustStockPart รับ delta (+/-) สำหรับ inline stock adjust
 *     atomic ภายใต้ withWriteLock; stock < 0 → clamp ที่ 0
 * NEW v3.12.0:
 *   - tab "บันทึกเวลา" auto-create (time tracking — Task 35)
 *     8 columns: id | taskKey | startedAt | endedAt | durationMin |
 *                user | note | createdAt
 *   - actions startTimer / stopTimer / getTimeLogs / getActiveTimer
 *     - startTimer: refuse if user already has open timer for same task
 *     - stopTimer: find open row for {user, taskKey}, compute duration
 *     - getActiveTimer: return open row for user (if any)
 *     - getTimeLogs: list all, optionally filtered by taskKey or user
 *   - timer rows ไม่ cache (need fresh state for resume detection)
 * NEW v3.13.0:
 *   - tab "ยานพาหนะ" auto-create (motorcycle/car per room)
 *     10 columns: id | ตึก | ห้อง | ทะเบียน | ยี่ห้อ/รุ่น | สี |
 *                 หมายเหตุ | ผู้บันทึก | วันที่บันทึก | วันที่ปรับปรุง
 *   - actions getVehicles / addVehicle / updateVehicle / deleteVehicle
 *   - multiple vehicles per room supported (FK ผ่าน {ตึก, ห้อง})
 *   - cache 60s + invalidate on write
 * NEW v3.14.0:
 *   - ROOM_STATUS dropdown เพิ่มค่า 'ไม่ได้ใช้งาน' (inactive) — ใช้กับ
 *     ห้องเก็บของ/ห้องสำรอง ที่ไม่ปล่อยเช่า; dashboard map → status
 *     'inactive' อยู่แล้ว แต่เดิม dropdown ไม่ให้กรอกค่านี้ ต้องพิมพ์เอง
 * NEW v3.15.0:
 *   - tab "ลูกค้าสนใจ" auto-create (Lead CRM — Task 26)
 *     10 columns: id | ชื่อ | เบอร์โทร | ช่องทาง | สนใจ | stage |
 *                 หมายเหตุ | ผู้บันทึก | วันที่บันทึก | วันที่ปรับปรุง
 *   - stages: ใหม่ / นัดดูแล้ว / กำลังคุย / ทำสัญญา / ปิดดีล / ปิดเลิก
 *   - actions getLeads / addLead / updateLead / deleteLead
 *   - cache 60s + invalidate ตอน write
 * NEW v3.16.0:
 *   - tab "เบิกอะไหล่" auto-create (parts requisition log)
 *     10 columns: id | partId | partName | quantity | ตึก | ห้อง |
 *                 taskKey | ผู้เบิก | หมายเหตุ | วันที่เบิก
 *   - addRequisition: atomic (decrement stock + append log) under
 *     withWriteLock; clamps stock at 0
 *   - getRequisitions: list with optional partId filter
 *   - clears Part cache on write so PartsView reflects new stock
 * NEW v3.17.0:
 *   - tab "audit_log" auto-create — track who edited what (Task 18)
 *     7 cols: id | timestamp | user | action | entity | entityId | details
 *     hooked into updateRoomStatus, deleteTask, addRequisition
 *   - tab "งานประจำ" auto-create — recurring task templates
 *     10 cols: id | name | type | building | room | intervalDays |
 *              lastRunDate | nextRunDate | active | note | creator | createdAt
 *   - actions getAudit / getRecurring / addRecurring / deleteRecurring /
 *     runRecurringCheck (creates due tasks atomically)
 */

const SHEET_NAMES = {
  TASK: 'งาน',
  TEMPLATE: 'template_งาน',
  ROOM: 'ห้อง',
  METER: 'มิเตอร์',
  EQUIPMENT: 'อุปกรณ์',
  FACILITY: 'สาธารณูปโภค',
  PART: 'อะไหล่', // v3.11.0 — inventory (Task 37)
  TIME_LOG: 'บันทึกเวลา', // v3.12.0 — time tracking (Task 35)
  VEHICLE: 'ยานพาหนะ', // v3.13.0 — vehicles per room
  LEAD: 'ลูกค้าสนใจ', // v3.15.0 — Lead CRM (Task 26)
  REQUISITION: 'เบิกอะไหล่', // v3.16.0 — parts requisition log
  AUDIT: 'audit_log', // v3.17.0 — Task 18 audit log
  PHOTO: 'รูปตำหนิ', // v3.25.0 — defect-photo log (append-only)
  RECURRING: 'งานประจำ', // v3.17.0 — recurring task templates
};

const TYPE_OPTIONS   = ['ย้ายเข้า', 'ย้ายออก', 'ทำสะอาด', 'ชมห้อง', 'ซ่อม', 'อื่นๆ'];
const STATUS_OPTIONS = ['ว่าง', 'pending', 'กำลังทำ', 'เสร็จ', 'ยกเลิก'];
const ROOM_STATUS    = ['ว่าง', 'มีผู้เช่า', 'จอง', 'ซ่อม', 'ไม่ได้ใช้งาน'];
const EQUIPMENT_TYPES  = ['แอร์', 'เครื่องซักผ้า', 'ตู้เย็น', 'เครื่องทำน้ำอุ่น', 'โทรทัศน์', 'ไมโครเวฟ', 'อื่นๆ'];
const EQUIPMENT_STATUS = ['ปกติ', 'ต้องซ่อม', 'กำลังซ่อม', 'ใช้ไม่ได้'];
const FACILITY_TYPES   = ['รอบล้างแอร์', 'รอบล้างเครื่องซักผ้า', 'ปั๊มน้ำ', 'ไฟส่วนกลาง', 'ต้นไม้', 'ทางเดินส่วนกลาง', 'อื่นๆ'];
const FACILITY_STATUS  = ['ใช้งานได้', 'ต้องซ่อม', 'กำลังซ่อม', 'ปิดใช้งาน'];

// v3.11.0 — Inventory categories (Task 37). "อื่นๆ" fallback ensures
// any free-text new category still passes the dropdown.
const PART_CATEGORIES  = ['ประปา', 'ไฟฟ้า', 'แอร์', 'ของใช้ในห้องน้ำ', 'ของใช้แม่บ้าน', 'ทั่วไป', 'อื่นๆ'];

// v3.15.0 — Lead CRM stages (Task 26). Kanban columns left → right.
const LEAD_STAGES = ['ใหม่', 'นัดดูแล้ว', 'กำลังคุย', 'ทำสัญญา', 'ปิดดีล', 'ปิดเลิก'];
const LEAD_SOURCES = ['Facebook', 'LINE', 'ป้ายหน้าหอ', 'แนะนำ', 'Walk-in', 'อื่นๆ'];

// คอลัมน์ของ tab "งาน" (1-based)
const TASK_COL = {
  DATE: 1, TYPE: 2, BUILDING: 3, ROOM: 4,
  CUSTOMER: 5, PHONE: 6, NOTE: 7, STATUS: 8,
  CREATOR: 9, CREATED_AT: 10,
  COST: 11, // v3.10.0
  ID: 12,   // v3.21 — stable UUID identity; composite key kept as fallback
};

/* ========== CACHE (NEW v3.4.0) ========== */
const TASKS_CACHE_KEY = 'tasksCache_v1';
const TASKS_CACHE_TTL_SEC = 240; // v3.20: 180→240s (เดิม v3.11 ขยายจาก 60) — writers bust ทันทีอยู่แล้ว

/**
 * Shared cache plumbing (r11 dedup — was 7 near-identical getter/clearer
 * pairs). getCached_: serve JSON from CacheService or produce fresh and
 * best-effort cache it; a put failure (payload > ~100KB, e.g. the tasks
 * feed on a big sheet) skips caching but still returns the fresh data.
 */
function getCached_(key, ttlSec, producer) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* cache เสีย — fall through */ }
  }
  const fresh = producer();
  try {
    cache.put(key, JSON.stringify(fresh), ttlSec);
  } catch (e) {
    // payload ใหญ่เกิน cache — ไม่ cache แต่ยังคืนค่า
  }
  return fresh;
}
function clearCache_(key) {
  try { CacheService.getScriptCache().remove(key); } catch (e) {}
}

function getTasksCached_() { return getCached_(TASKS_CACHE_KEY, TASKS_CACHE_TTL_SEC, getTasks_); }

function clearTasksCache_() { clearCache_(TASKS_CACHE_KEY); }

/* ========== ROOMS CACHE (NEW v3.4.3) ========== */
const ROOMS_CACHE_KEY = 'roomsCache_v1';
const ROOMS_CACHE_TTL_SEC = 240; // v3.20: 60→240s — ทุก write สั่งล้าง cache อยู่แล้ว TTL ยาวจึงปลอดภัย และลด cold reads

function getRoomsCached_() { return getCached_(ROOMS_CACHE_KEY, ROOMS_CACHE_TTL_SEC, getRooms_); }

function clearRoomsCache_() { clearCache_(ROOMS_CACHE_KEY); }

/* ========== EQUIPMENT CACHE (NEW v3.6.0) ========== */
const EQUIPMENT_CACHE_KEY = 'equipmentCache_v2';
// 3 นาที — v3.11.0 ขยายจาก 60s. Vercel ฝั่งใหม่ serve stale-on-error อยู่
// แล้ว และ writes (addEquipment/updateEquipment) เรียก clearEquipmentCache_
// ทันที จึงไม่มีปัญหา consistency
const EQUIPMENT_CACHE_TTL_SEC = 240; // v3.20: 60→240s — ทุก write สั่งล้าง cache อยู่แล้ว TTL ยาวจึงปลอดภัย และลด cold reads

function getAllEquipmentCached_() { return getCached_(EQUIPMENT_CACHE_KEY, EQUIPMENT_CACHE_TTL_SEC, getAllEquipment_); }

function clearEquipmentCache_() { clearCache_(EQUIPMENT_CACHE_KEY); }

/* ========== FACILITY CACHE (NEW v3.8.0) ========== */
const FACILITY_CACHE_KEY = 'facilityCache_v1';
const FACILITY_CACHE_TTL_SEC = 240; // v3.20: 60→240s — ทุก write สั่งล้าง cache อยู่แล้ว TTL ยาวจึงปลอดภัย และลด cold reads

function getAllFacilitiesCached_() { return getCached_(FACILITY_CACHE_KEY, FACILITY_CACHE_TTL_SEC, getAllFacilities_); }

function clearFacilityCache_() { clearCache_(FACILITY_CACHE_KEY); }

/* ========== PART (INVENTORY) CACHE (NEW v3.11.0) ========== */
const PART_CACHE_KEY = 'partCache_v1';
const PART_CACHE_TTL_SEC = 240; // v3.20: 60→240s — ทุก write สั่งล้าง cache อยู่แล้ว TTL ยาวจึงปลอดภัย และลด cold reads

function getAllPartsCached_() { return getCached_(PART_CACHE_KEY, PART_CACHE_TTL_SEC, getAllParts_); }

function clearPartCache_() { clearCache_(PART_CACHE_KEY); }

/* ========== VEHICLE CACHE (NEW v3.13.0) ========== */
const VEHICLE_CACHE_KEY = 'vehicleCache_v1';
const VEHICLE_CACHE_TTL_SEC = 240; // v3.20: 60→240s — ทุก write สั่งล้าง cache อยู่แล้ว TTL ยาวจึงปลอดภัย และลด cold reads

function getAllVehiclesCached_() { return getCached_(VEHICLE_CACHE_KEY, VEHICLE_CACHE_TTL_SEC, getAllVehicles_); }

function clearVehicleCache_() { clearCache_(VEHICLE_CACHE_KEY); }

/* ========== LEAD CACHE (NEW v3.15.0) ========== */
const LEAD_CACHE_KEY = 'leadCache_v1';
const LEAD_CACHE_TTL_SEC = 240; // v3.20: 60→240s — ทุก write สั่งล้าง cache อยู่แล้ว TTL ยาวจึงปลอดภัย และลด cold reads

function getAllLeadsCached_() { return getCached_(LEAD_CACHE_KEY, LEAD_CACHE_TTL_SEC, getAllLeads_); }

function clearLeadCache_() { clearCache_(LEAD_CACHE_KEY); }

/* ========== UTIL ========== */
function norm(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
}

function fmtDate_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Asia/Bangkok', 'yyyy-MM-dd');
  }
  return norm(v);
}

/**
 * Like fmtDate_ but keeps the time component — for timestamp columns
 * (audit_log, createdAt). When Google Sheets coerces a "yyyy-MM-dd
 * HH:mm:ss" text cell into a real Date, norm() would stringify it as
 * "Mon May 25 2026 10:30:45 GMT+0700 (...)" which the client can't
 * split reliably. Formatting Date cells back to the canonical string
 * keeps the API contract stable regardless of cell type.
 */
function fmtDateTime_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  }
  return norm(v);
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ok_(payload) { return jsonOut_(Object.assign({ ok: true }, payload || {})); }
function err_(message) { return jsonOut_({ ok: false, error: String(message) }); }

/* ========== WRITE LOCK (NEW v3.9.0) ========== */
/**
 * Wrap a write function with ScriptLock.tryLock(5000). Apps Script's
 * default lock behavior is "fail immediately if held"; with concurrent
 * writers (10+ users) this causes flaky errors. We wait up to 5s and
 * release in finally. Reads do NOT use this — they're cache-served.
 */
function withWriteLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    throw new Error('busy — มีการบันทึกจากผู้ใช้รายอื่น โปรดลองอีกครั้ง');
  }
  try {
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (e) { /* ignore */ }
  }
}

/* ========== AUDITED WRITE (v3.18.0) ==========
 * Half the mutations never called logAudit_, leaving the audit sheet
 * blind to task/part/lead/vehicle/timer changes. Rather than editing 18
 * writer bodies, wrap them once at the dispatch: lock → write → log.
 * Writers that already log rich diffs internally (updateRoomStatus_,
 * deleteTask_, addRequisition_, recurring) keep their own calls and do
 * NOT go through this wrapper (avoids double rows). */
function loggedWrite_(action, entity, entityId, body, fn) {
  // The write runs inside the lock; the audit append runs AFTER release.
  // Logging inside the lock extended every critical section by a sheet
  // append (and the first-ever call by an insertSheet+format), raising
  // tryLock(5000) "busy" timeouts under concurrent writers. An audit
  // appendRow doesn't need the business-write lock.
  const result = withWriteLock_(function () { return fn(body); });
  // Skip no-op writes (e.g. addTask's duplicate-open skip) so the
  // trail records what actually changed, not what was attempted.
  if (result && result.skipped) return result;
  logAudit_(action, entity, entityId, auditDetails_(body), body.creator);
  return result;
}

/** Compact, secret-free JSON of the payload for the audit details cell. */
function auditDetails_(body) {
  try {
    const clone = {};
    for (var k in body) {
      if (k === 'action' || k === 'creator' || k === 'secret') continue;
      clone[k] = body[k];
    }
    const s = JSON.stringify(clone);
    return s.length > 300 ? s.slice(0, 297) + '...' : s;
  } catch (e) { return ''; }
}

/** Task identity for the audit log — updateTask carries it in `match`. */
function taskAuditId_(b) {
  const m = b.match || b;
  return [m.date, m.type, m.building, m.room].join('|');
}

/* ========== WEB APP ENTRY ========== */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('no body');
    const body = JSON.parse(e.postData.contents);
    if (!body || !body.action) throw new Error('missing action');

    // ---- Shared-secret gate (v3.18.0) ----
    // The Next.js routes enforce all per-role permissions, but this web
    // app URL itself used to accept ANY caller — if the URL leaks (logs,
    // git history, error messages) an attacker had full write access.
    // Set Script Property SHARED_SECRET (and the matching
    // APPS_SCRIPT_SECRET env var on Vercel) to close that. Backward
    // compatible: while the property is unset, no check happens.
    //
    // ORDER MATTERS for zero downtime — do Vercel FIRST:
    //   1. Set APPS_SCRIPT_SECRET on Vercel + redeploy. Now the frontend
    //      sends `secret`, and this gate still ignores it (property unset).
    //   2. THEN set this SHARED_SECRET property. Frontend is already
    //      sending it, so the check passes with no interruption.
    // Reverse order breaks every write in the window between setting this
    // property and Vercel redeploying (frontend not sending secret yet →
    // unauthorized). Rollback = delete this property (gate turns off).
    // (Header auth isn't an option: Apps Script doesn't expose request
    // headers to doPost, so the secret rides in the JSON body.)
    const expectedSecret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
    if (expectedSecret && body.secret !== expectedSecret) {
      return err_('unauthorized');
    }

    switch (body.action) {
      // ----- reads (no lock) -----
      case 'getTasks':         return ok_({ result: { rows: getTasksCached_() } });
      case 'getRoomTasks':     return ok_({ result: getRoomTasks_(body) }); // v3.22 — full per-room history
      case 'getRoomPhotos':    return ok_({ result: getRoomPhotos_(body) }); // v3.25 — defect photos per room
      case 'uploadRoomPhoto':  return ok_(withWriteLock_(function () { return uploadRoomPhoto_(body); })); // v3.25
      case 'updatePhotoNote':  return ok_(withWriteLock_(function () { return updatePhotoNote_(body); })); // v3.25.1 — fill-once
      case 'getRooms':         return ok_({ result: { rows: getRoomsCached_() } });
      case 'getRoomEquipment': return ok_({ result: { rows: getRoomEquipment_(body.building, body.room) } });
      case 'getAllEquipment':  return ok_({ result: { rows: getAllEquipmentCached_() } });
      case 'getFacilities':    return ok_({ result: { rows: getAllFacilitiesCached_() } });
      case 'debugFindTask':    return ok_({ row: findTaskRow_(body) });
      // ----- writes (ScriptLock 5s timeout) -----
      case 'addTask':          return ok_(loggedWrite_('addTask', 'task', taskAuditId_(body), body, addTask_));
      case 'updateTask':       return ok_(loggedWrite_('updateTask', 'task', taskAuditId_(body), body, updateTask_));
      case 'updateTaskStatus': return ok_(loggedWrite_('updateTaskStatus', 'task', taskAuditId_(body), body, updateTaskStatus_));
      case 'deleteTask':       return ok_(withWriteLock_(function () { return deleteTask_(body); }));
      // Three room-write actions share one writer (updateRoomStatus_ writes
      // only the fields present in body); the per-action field/permission
      // gating lives in the Next.js route (app/api/sheet/update). Splitting
      // the action lets the route enforce: updateRoomData = management-only
      // free-form edit, bookRoom = sales booking bundle, updateRoomStatus =
      // status/note only (PII stripped) so the status path can't write PII.
      case 'updateRoomStatus': return ok_(withWriteLock_(function () { return updateRoomStatus_(body); }));
      case 'updateRoomData':   return ok_(withWriteLock_(function () { return updateRoomStatus_(body); }));
      case 'bookRoom':         return ok_(withWriteLock_(function () { return updateRoomStatus_(body); }));
      // releaseRoom (v3.19.0): ปล่อยขาย — status → ว่าง AND blank the old
      // tenant identity. Sales can't send PII through updateRoomStatus
      // (the Next.js route strips it — by design), so the blanking is
      // FORCED here server-side from a fixed template: this action can
      // only ERASE tenant fields, never write attacker-chosen values,
      // which keeps the #252 security split intact.
      case 'releaseRoom':      return ok_(withWriteLock_(function () {
        return updateRoomStatus_({
          building: body.building, room: body.room,
          status: body.status || 'ว่าง',
          tenant: '', phone: '', contractEnd: '',
          note: body.note, creator: body.creator,
        });
      }));
      case 'addEquipment':     return ok_(loggedWrite_('addEquipment', 'equipment', body.id || (body.building + '|' + body.room), body, addEquipment_));
      case 'updateEquipment':  return ok_(loggedWrite_('updateEquipment', 'equipment', body.id || (body.building + '|' + body.room), body, updateEquipment_));
      case 'addFacility':      return ok_(loggedWrite_('addFacility', 'facility', body.id || body.building || '', body, addFacility_));
      case 'updateFacility':   return ok_(loggedWrite_('updateFacility', 'facility', body.id || body.building || '', body, updateFacility_));
      // v3.11.0 — Parts/Inventory (Task 37)
      case 'getParts':         return ok_({ result: { rows: getAllPartsCached_() } });
      case 'addPart':          return ok_(loggedWrite_('addPart', 'part', body.id || body.name || '', body, addPart_));
      case 'updatePart':       return ok_(loggedWrite_('updatePart', 'part', body.id || body.name || '', body, updatePart_));
      case 'adjustStockPart':  return ok_(loggedWrite_('adjustStockPart', 'part', body.id || body.partId || '', body, adjustStockPart_));
      // v3.12.0 — Time tracking (Task 35). Reads not cached — fresh
      // state needed so a parallel tab sees "running" within seconds.
      case 'getTimeLogs':      return ok_({ result: getTimeLogs_(body) });
      case 'getActiveTimer':   return ok_({ result: getActiveTimer_(body) });
      case 'startTimer':       return ok_(loggedWrite_('startTimer', 'timer', (body.user || '') + '|' + (body.taskKey || ''), body, startTimer_));
      case 'stopTimer':        return ok_(loggedWrite_('stopTimer', 'timer', body.id || ((body.user || '') + '|' + (body.taskKey || '')), body, stopTimer_));
      // v3.13.0 — Vehicles per room
      case 'getVehicles':      return ok_({ result: { rows: getAllVehiclesCached_() } });
      case 'addVehicle':       return ok_(loggedWrite_('addVehicle', 'vehicle', body.id || body.plate || '', body, addVehicle_));
      case 'updateVehicle':    return ok_(loggedWrite_('updateVehicle', 'vehicle', body.id || body.plate || '', body, updateVehicle_));
      case 'deleteVehicle':    return ok_(loggedWrite_('deleteVehicle', 'vehicle', body.id || body.plate || '', body, deleteVehicle_));
      // v3.15.0 — Lead CRM (Task 26)
      case 'getLeads':         return ok_({ result: { rows: getAllLeadsCached_() } });
      case 'addLead':          return ok_(loggedWrite_('addLead', 'lead', body.id || body.phone || body.name || '', body, addLead_));
      case 'updateLead':       return ok_(loggedWrite_('updateLead', 'lead', body.id || '', body, updateLead_));
      case 'deleteLead':       return ok_(loggedWrite_('deleteLead', 'lead', body.id || '', body, deleteLead_));
      // v3.16.0 — Parts requisitions
      case 'getRequisitions':  return ok_({ result: { rows: getAllRequisitions_(body) } });
      case 'addRequisition':   return ok_(withWriteLock_(function () { return addRequisition_(body); }));
      // v3.17.0 — Audit log + recurring tasks
      case 'getAudit':         return ok_({ result: { rows: getAllAudit_(body) } });
      case 'getRecurring':     return ok_({ result: { rows: getAllRecurring_() } });
      case 'addRecurring':     return ok_(withWriteLock_(function () { return addRecurring_(body); }));
      case 'deleteRecurring':  return ok_(withWriteLock_(function () { return deleteRecurring_(body); }));
      case 'runRecurringCheck':return ok_(withWriteLock_(function () { return runRecurringCheck_(body); }));
      default: throw new Error('unknown action: ' + body.action);
    }
  } catch (err) {
    return err_(err && err.message ? err.message : err);
  }
}

/**
 * Bump BACKEND_VERSION on every deploy that changes behaviour. The
 * Health banner (app/api/sheet/health) surfaces it, so a mismatch
 * against the code you just pasted is the ONLY reliable signal that a
 * "Manage deployments → New version" actually took effect. It sat at
 * '3.10.0' for eleven feature versions, which is exactly why past
 * redeploys were impossible to verify from the app.
 */
var BACKEND_VERSION = '3.25.1';

function doGet() {
  return jsonOut_({ ok: true, message: 'aptdashboard backend alive', version: BACKEND_VERSION });
}

/* ========== TASK READ ========== */
/** How far back the dashboard task feed reaches (days). CLOSED tasks
 *  older than this are omitted from getTasks_ — the sheet grows
 *  forever, and without a window the payload (and every cache layer,
 *  and the client merge loop) grows with it. OPEN tasks are always
 *  returned regardless of age (an unfinished job must never vanish).
 *  Full per-room history stays available via getRoomTasks_. */
var TASK_FEED_WINDOW_DAYS = 120;

/** Start-of-day timestamp for a task date cell (Date object, dd/MM/yyyy
 *  text, or yyyy-MM-dd text). null when unparseable. */
function taskDayTime_(v) {
  if (v instanceof Date) {
    return new Date(v.getFullYear(), v.getMonth(), v.getDate()).getTime();
  }
  const s = norm(v);
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  return null;
}

/** Map one raw sheet row to the API task shape. */
function taskRowToObj_(r, cols) {
  const costRaw = cols >= 11 ? r[10] : '';
  const idRaw = cols >= 12 ? norm(r[11]) : '';
  const costNum = parseFloat(costRaw);
  return {
    date:      fmtDate_(r[0]),
    type:      norm(r[1]),
    building:  norm(r[2]),
    room:      norm(r[3]),
    customer:  norm(r[4]),
    phone:     norm(r[5]),
    note:      norm(r[6]),
    status:    norm(r[7]),
    creator:   norm(r[8]),
    createdAt: norm(r[9]),
    cost:      isFinite(costNum) && costNum > 0 ? costNum : 0,
    id:        idRaw, // v3.21 — '' for rows predating the backfill
  };
}

function getTasks_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.TASK);
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  // v3.10.0: read up to col K (11). Use lastCol to stay backward-compat
  // when the sheet hasn't been expanded yet (existing rows < 11 cols).
  const lastCol = Math.max(sh.getLastColumn(), 10);
  const cols = Math.min(lastCol, 12); // v3.21: + id column
  const values = sh.getRange(2, 1, lastRow - 1, cols).getValues();
  // v3.22 window: keep every OPEN task + closed tasks from the last
  // TASK_FEED_WINDOW_DAYS. Unparseable dates are kept (fail open).
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    - TASK_FEED_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    const status = norm(r[7]);
    const isClosed = status === 'เสร็จ' || status === 'ยกเลิก' || status === 'done'
      || status === 'ปิดแล้ว' || status === 'cancelled' || status === 'ไม่สนใจ';
    if (isClosed) {
      const ts = taskDayTime_(r[0]);
      if (ts !== null && ts < cutoff) continue;
    }
    const obj = taskRowToObj_(r, cols);
    if (obj.date && obj.type && obj.building) out.push(obj);
  }
  return out;
}

/* ========== DEFECT PHOTOS (v3.25.0) ==========
 * รูปตำหนิสภาพห้องก่อนเข้าอยู่ — evidence for deposit disputes.
 *
 * Storage: Google Drive folder (pinned by PHOTO_FOLDER_ID script
 * property, same pattern as the backup folder) with one subfolder per
 * building. Files are shared anyone-with-link/VIEW so the app can
 * render them by fileId; links are unguessable.
 *
 * Ledger: sheet tab รูปตำหนิ — APPEND-ONLY by design (no delete/update
 * action exists), so a recorded photo can't be quietly swapped later;
 * that's what makes the set usable as evidence.
 */
function getOrCreatePhotoFolder_(building) {
  const props = PropertiesService.getScriptProperties();
  let root = null;
  const savedId = props.getProperty('PHOTO_FOLDER_ID');
  if (savedId) {
    try { root = DriveApp.getFolderById(savedId); } catch (e) { root = null; }
  }
  if (!root) {
    const it = DriveApp.getFoldersByName('รูปตำหนิหอพัก');
    root = it.hasNext() ? it.next() : DriveApp.createFolder('รูปตำหนิหอพัก');
    props.setProperty('PHOTO_FOLDER_ID', root.getId());
  }
  const name = norm(building) || 'ไม่ระบุตึก';
  const sub = root.getFoldersByName(name);
  return sub.hasNext() ? sub.next() : root.createFolder(name);
}

function getOrCreatePhotoSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAMES.PHOTO);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAMES.PHOTO);
    sh.getRange(1, 1, 1, 7).setValues([[
      'id', 'ตึก', 'ห้อง', 'fileId', 'หมายเหตุ', 'ผู้บันทึก', 'วันที่บันทึก',
    ]]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#FCE7F3');
  }
  return sh;
}

/**
 * Save one defect photo. Body: { building, room, dataBase64, mimeType?,
 * note?, creator? }. Returns { id, fileId }.
 */
function uploadRoomPhoto_(b) {
  const building = norm(b.building);
  const room = norm(b.room);
  if (!building || !room) throw new Error('building/room required');
  if (!b.dataBase64) throw new Error('dataBase64 required');
  // ~0.75 bytes per base64 char; client compresses to ~200-400KB, so
  // anything past 8MB decoded means compression was bypassed — reject
  // rather than slowly eat Drive space with camera originals.
  if (String(b.dataBase64).length > 11000000) throw new Error('รูปใหญ่เกินไป (ย่อรูปก่อนส่ง)');
  const mime = norm(b.mimeType) || 'image/jpeg';
  const bytes = Utilities.base64Decode(String(b.dataBase64));
  const stamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd_HHmmss');
  const blob = Utilities.newBlob(bytes, mime, room + '_' + stamp + '.jpg');
  const folder = getOrCreatePhotoFolder_(building);
  const file = folder.createFile(blob);
  // anyone-with-link VIEW — required for <img> rendering in the app.
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const sh = getOrCreatePhotoSheet_();
  const id = Utilities.getUuid();
  const createdAt = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
  sh.appendRow([id, building, room, file.getId(), norm(b.note), norm(b.creator), createdAt]);
  logAudit_('uploadRoomPhoto', 'photo', building + ' ' + room, norm(b.note), b.creator);
  return { id: id, fileId: file.getId(), createdAt: createdAt };
}

/**
 * Add a description to a photo AFTER upload (v3.25.1) — the natural
 * flow is snap first, describe second, and the ledger had no way to do
 * that. FILL-ONCE, not edit: a note can only be set while the cell is
 * still empty (same-note replays are OK = idempotent retry). An existing
 * description can never be changed, which keeps the append-only
 * evidence property intact.
 */
function updatePhotoNote_(b) {
  const id = norm(b.id);
  const note = norm(b.note);
  if (!id) throw new Error('id required');
  if (!note) throw new Error('note required');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.PHOTO);
  if (!sh) throw new Error('ไม่พบรูป (ยังไม่มีแท็บรูปตำหนิ)');
  const row = findRowById_(sh, id);
  if (row < 0) throw new Error('ไม่พบรูปนี้');
  const existing = norm(sh.getRange(row, 5).getValue());
  if (existing) {
    if (existing === note) return { id: id, note: note }; // idempotent replay
    throw new Error('รูปนี้มีคำอธิบายแล้ว แก้ไม่ได้ (เป็นหลักฐาน)');
  }
  sh.getRange(row, 5).setValue(note);
  logAudit_('updatePhotoNote', 'photo', id, note, b.creator);
  return { id: id, note: note };
}

/** All photos for one room, newest first. */
function getRoomPhotos_(b) {
  const building = norm(b.building);
  const room = norm(b.room);
  if (!building || !room) throw new Error('building/room required');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.PHOTO);
  if (!sh) return { rows: [] };
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { rows: [] };
  const data = sh.getRange(2, 1, lastRow - 1, 7).getValues();
  const rows = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (norm(r[1]) !== building || norm(r[2]) !== room) continue;
    rows.push({
      id: norm(r[0]),
      building: building,
      room: room,
      fileId: norm(r[3]),
      note: norm(r[4]),
      creator: norm(r[5]),
      createdAt: fmtDateTime_(r[6]),
    });
  }
  rows.reverse(); // newest first
  return { rows: rows };
}

/**
 * Full task history for ONE room — no date window. Powers the RoomModal
 * ประวัติงาน list + completed-cost totals, which need older-than-window
 * rows that getTasks_ no longer carries. Small payload (one room's rows),
 * read-only, fetched lazily when the modal opens.
 */
function getRoomTasks_(b) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.TASK);
  if (!sh) return { rows: [] };
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { rows: [] };
  const lastCol = Math.max(sh.getLastColumn(), 10);
  const cols = Math.min(lastCol, 12);
  const values = sh.getRange(2, 1, lastRow - 1, cols).getValues();
  const qBld = norm(b.building);
  const qRoom = norm(b.room);
  const rows = [];
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    if (norm(r[2]) !== qBld || norm(r[3]) !== qRoom) continue;
    const obj = taskRowToObj_(r, cols);
    if (obj.date && obj.type) rows.push(obj);
  }
  return { rows: rows };
}

/**
 * Ensure the "งาน" sheet has column K = "ค่าใช้จ่าย" (v3.10.0).
 * Idempotent — if the column already exists, do nothing. Used by
 * addTask_ before append so existing tabs auto-expand on first write.
 */
function ensureTaskCostColumn_(sh) {
  const lastCol = sh.getLastColumn();
  if (lastCol >= 11) return;
  sh.getRange(1, 11).setValue('ค่าใช้จ่าย').setFontWeight('bold');
}

/* ========== TASK IDs (v3.21) ==========
 * The composite key (date|type|building|room) is NOT unique — two quick
 * repairs on the same room the same day collide, so edit hits the first
 * match and delete removes both. Every task row now carries a UUID; the
 * writers look it up first and fall back to the composite key for rows
 * that predate the backfill (or old clients that don't send id yet). */
function ensureTaskIdColumn_(sh) {
  const lastCol = sh.getLastColumn();
  if (lastCol >= TASK_COL.ID) return;
  sh.getRange(1, TASK_COL.ID).setValue('id').setFontWeight('bold');
}

/**
 * 1-based sheet row whose col-1 id matches, or -1 (r11 dedup — replaces
 * nine identical scan loops across equipment/facility/part/vehicle/lead/
 * requisition handlers).
 */
function findRowById_(sh, id) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sh.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (norm(ids[i][0]) === norm(id)) return i + 2;
  }
  return -1;
}

/** 1-based row whose ID column matches, or -1. */
function findTaskRowById_(id) {
  if (!id) return -1;
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.TASK);
  if (!sh || sh.getLastColumn() < TASK_COL.ID) return -1;
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sh.getRange(2, TASK_COL.ID, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (norm(ids[i][0]) === norm(id)) return i + 2;
  }
  return -1;
}

/** Backfill core — stamps a UUID on every task row that lacks one.
 *  Returns how many were filled. Callers handle locking/flagging. */
function backfillTaskIdsCore_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.TASK);
  if (!sh) return 0;
  ensureTaskIdColumn_(sh);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;
  const range = sh.getRange(2, TASK_COL.ID, lastRow - 1, 1);
  const vals = range.getValues();
  let filled = 0;
  for (let i = 0; i < vals.length; i++) {
    if (!norm(vals[i][0])) { vals[i][0] = Utilities.getUuid(); filled++; }
  }
  if (filled > 0) { range.setValues(vals); clearTasksCache_(); }
  return filled;
}

/**
 * AUTO backfill — zero manual steps. Runs once (script-property flag)
 * on the first task write after this version deploys; every write after
 * that costs a single property read. Callers are already inside
 * withWriteLock_, so no extra locking here. Rows created before the
 * flag flips are still safe: every reader/writer falls back to the
 * composite key when a row has no id.
 */
function autoBackfillTaskIds_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('TASK_ID_BACKFILL_DONE')) return;
  backfillTaskIdsCore_();
  props.setProperty('TASK_ID_BACKFILL_DONE', '1');
}

/** Optional manual variant (editor → Run) — same core, plus a toast.
 *  Not required anymore; kept for ops visibility. */
function backfillTaskIds() {
  const filled = backfillTaskIdsCore_();
  PropertiesService.getScriptProperties().setProperty('TASK_ID_BACKFILL_DONE', '1');
  SpreadsheetApp.getActive().toast('เติม id ให้งานเก่า ' + filled + ' แถวแล้ว ✅', 'หอพัก', 5);
}

/* ========== ROOMS READ (NEW v3.4.3) ========== */
/**
 * Read the ห้อง sheet and return RoomRow[] for the dashboard.
 * Maps Thai column headers to English keys (matches lib/parseSheet
 * ROOM_HEADER_ALIASES). Tolerates schema variations (header order,
 * column-name aliases). Empty rows are dropped.
 */
/**
 * Canonical room-sheet header resolver (r11 dedup). One alias table for
 * READERS AND WRITERS — previously getRooms_ accepted alias headers
 * ('อาคาร', 'เลขห้อง', 'ผู้เช่าปัจจุบัน', …) while updateRoomStatus_
 * matched exact names only, so a sheet using an alias could be READ but
 * every write threw 'headers missing'. All indexes are 0-based; -1 when
 * the column is absent.
 */
function roomHeaderCols_(headers) {
  const findIdx = function (aliases) {
    for (let a = 0; a < aliases.length; a++) {
      const idx = headers.indexOf(aliases[a]);
      if (idx >= 0) return idx;
    }
    return -1;
  };
  return {
    bld:    findIdx(['ตึก', 'อาคาร']),
    room:   findIdx(['ห้อง', 'เลขห้อง']),
    floor:  findIdx(['ชั้น']),
    status: findIdx(['สถานะ']),
    tenant: findIdx(['ผู้เช่า', 'ผู้เช่าปัจจุบัน', 'ชื่อผู้เช่า']),
    phone:  findIdx(['เบอร์', 'เบอร์ติดต่อ', 'เบอร์โทร']),
    cntr:   findIdx(['สัญญา', 'วันสัญญาหมด', 'สัญญาหมด', 'วันหมดสัญญา']),
    price:  findIdx(['ค่าเช่า', 'ราคา/เดือน', 'ราคา', 'ค่าเช่ารายเดือน']),
    images: findIdx(['รูป', 'ภาพ', 'รูปภาพ', 'images', 'photos']),
  };
}

function getRooms_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.ROOM);
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(norm);

  const cols = roomHeaderCols_(headers);
  var iBld = cols.bld, iRoom = cols.room, iFloor = cols.floor,
      iStatus = cols.status, iTenant = cols.tenant, iPhone = cols.phone,
      iCntr = cols.cntr, iPrice = cols.price, iImages = cols.images;

  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    var building = iBld    >= 0 ? norm(r[iBld])    : '';
    var room     = iRoom   >= 0 ? norm(r[iRoom])   : '';
    if (!building || !room) continue;
    rows.push({
      building:    building,
      room:        room,
      floor:       iFloor  >= 0 ? norm(r[iFloor])  : '',
      status:      iStatus >= 0 ? norm(r[iStatus]) : '',
      tenant:      iTenant >= 0 ? norm(r[iTenant]) : '',
      phone:       iPhone  >= 0 ? norm(r[iPhone])  : '',
      contractEnd: iCntr   >= 0 ? fmtDate_(r[iCntr]) : '',
      price:       iPrice  >= 0 ? norm(r[iPrice])  : '',
      images:      iImages >= 0 ? norm(r[iImages]) : '',
    });
  }
  return rows;
}

/* ========== TASK FIND (composite key) ========== */
function findTaskRow_(q) {
  const rows = findAllTaskRows_(q);
  return rows.length ? rows[0] : -1;
}

/**
 * All 1-based rows matching the composite key (date|type|building|room).
 * The whole system treats this key as a task's identity (find/update/
 * delete), so when stray duplicate rows share it they're the "same" task.
 * Returned so a status close can flip every duplicate at once — otherwise
 * closing the first match leaves an open twin that pops the task back open
 * after the client's optimistic window lapses ("เด้งกลับ").
 */
function findAllTaskRows_(q) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.TASK);
  if (!sh) throw new Error('sheet "งาน" not found');
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const data = sh.getRange(2, 1, lastRow - 1, 8).getValues();
  const qDate = norm(q.date);
  const qType = norm(q.type);
  const qBld  = norm(q.building);
  const qRoom = norm(q.room);
  const out = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (
      fmtDate_(r[0]) === qDate &&
      norm(r[1]) === qType &&
      norm(r[2]) === qBld &&
      norm(r[3]) === qRoom
    ) {
      out.push(i + 2); // 1-based row
    }
  }
  return out;
}

/* ========== TASK MUTATE ========== */
function addTask_(b) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.TASK);
  if (!sh) throw new Error('sheet "งาน" not found');
  ensureTaskCostColumn_(sh); // v3.10.0
  ensureTaskIdColumn_(sh);   // v3.21
  autoBackfillTaskIds_();    // v3.21 — one-time, then a no-op property read

  // Idempotency guard — server-side mirror of the client's hasOpenPrepTask
  // check. The client check can race (two staff clicking near-simultaneously,
  // optimistic state not yet reconciled, BulkAdd issuing a batch). Without
  // this guard those races landed identical rows in the sheet — the cause of
  // the duplicate "ย้ายเข้า" appointments that #216 papered over on the
  // client. Skip the append when an OPEN task with the same composite
  // identity (date|type|building|room) already exists; closed/cancelled
  // duplicates don't block — those are historical.
  const existingRows = findAllTaskRows_({
    date: b.date, type: b.type, building: b.building, room: b.room,
  });
  if (existingRows.length > 0) {
    for (let i = 0; i < existingRows.length; i++) {
      const existingStatus = norm(sh.getRange(existingRows[i], TASK_COL.STATUS).getValue());
      if (existingStatus !== 'เสร็จ' && existingStatus !== 'ยกเลิก') {
        return { appended: false, skipped: 'duplicate-open', row: existingRows[i] };
      }
    }
  }

  const costNum = parseFloat(b.cost);
  const row = [
    b.date || '',
    b.type || '',
    b.building || '',
    b.room || '',
    b.customer || '',
    b.phone || '',
    b.note || '',
    b.status || 'pending',
    b.creator || '',
    // createdAt — ISO yyyy-MM-dd HH:mm to match every other createdAt
    // column in the workbook (equipment / facility / part / vehicle /
    // lead / recurring all use ISO). The previous Thai dd/MM/yyyy
    // format made cross-sheet time comparisons need a special-case.
    Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm'),
    isFinite(costNum) && costNum > 0 ? costNum : '',
  ];
  const newId = Utilities.getUuid(); // v3.21 — stable identity
  row.push(newId);
  sh.appendRow(row);
  clearTasksCache_();
  return { appended: true, row: sh.getLastRow(), id: newId };
}

/**
 * One-off cleanup utility — collapses pre-existing duplicate task rows in
 * the งาน sheet to a single row per composite key. Safe to run repeatedly
 * (idempotent: a sheet that's already clean exits with deleted=0).
 *
 * To run: Apps Script editor → select `dedupeTasksSheet_` from the function
 * dropdown → ▶ Run. Check the execution log for the count of merged keys
 * and the audit sheet for per-key entries.
 *
 * Strategy mirrors lib/useDashboardData.dedupTasks: group by
 * (date|type|building|room), keep the row with the richest info payload
 * (customer + phone + note total length), delete the rest. Iterates rows
 * descending so deleteRow doesn't shift the indices of rows still to touch.
 */
function dedupeTasksSheet_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.TASK);
  if (!sh) throw new Error('sheet "งาน" not found');
  const lastRow = sh.getLastRow();
  if (lastRow < 3) return { scanned: 0, deleted: 0, mergedKeys: 0 };

  // Read through the id column (v3.21) when present — the survivor
  // choice must prefer the id-bearing twin, or dedupe would delete the
  // row a client's stored UUID points at (findTaskRowById_ then misses
  // and silently falls back to the ambiguous composite key, and the
  // id-less survivor stays id-less because the one-time auto-backfill
  // flag is already set).
  const width = Math.min(sh.getLastColumn(), TASK_COL.ID);
  const data = sh.getRange(2, 1, lastRow - 1, width).getValues();
  const info = function (r) {
    return String(r[4] || '').length + String(r[5] || '').length + String(r[6] || '').length;
  };
  const hasId = function (r) {
    return width >= TASK_COL.ID && !!norm(r[TASK_COL.ID - 1]);
  };
  // Rank: id beats no-id; within the same id-ness, richer info wins.
  const beats = function (a, b) { // does row a beat row b?
    if (hasId(a) !== hasId(b)) return hasId(a);
    return info(a) > info(b);
  };
  const groups = {}; // key → { keepRowAbs, keepRow, dupRowsAbs[] }
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const rowAbs = i + 2; // sheet row (1-based, header at 1)
    const key = fmtDate_(r[0]) + '|' + norm(r[1]) + '|' + norm(r[2]) + '|' + norm(r[3]);
    if (!key || key === '|||') continue;
    const g = groups[key];
    if (!g) {
      groups[key] = { keepRowAbs: rowAbs, keepRow: r, dupRowsAbs: [] };
    } else {
      if (beats(r, g.keepRow)) {
        g.dupRowsAbs.push(g.keepRowAbs);
        g.keepRowAbs = rowAbs;
        g.keepRow = r;
      } else {
        g.dupRowsAbs.push(rowAbs);
      }
    }
  }
  // Collect every row to delete, sort descending so deleteRow doesn't shift
  // the indices of remaining targets.
  const toDelete = [];
  let mergedKeys = 0;
  for (const k in groups) {
    if (groups[k].dupRowsAbs.length > 0) {
      mergedKeys++;
      for (let i = 0; i < groups[k].dupRowsAbs.length; i++) {
        toDelete.push(groups[k].dupRowsAbs[i]);
      }
    }
  }
  toDelete.sort(function (a, b) { return b - a; });
  for (let i = 0; i < toDelete.length; i++) {
    sh.deleteRow(toDelete[i]);
  }
  if (toDelete.length > 0) {
    clearTasksCache_();
    logAudit_('dedupe', 'task', '', 'merged ' + mergedKeys + ' keys, deleted ' + toDelete.length + ' rows', 'cleanup');
  }
  Logger.log('dedupeTasksSheet_: scanned=%s, mergedKeys=%s, deleted=%s', data.length, mergedKeys, toDelete.length);
  return { scanned: data.length, mergedKeys: mergedKeys, deleted: toDelete.length };
}

function updateTask_(b) {
  // v3.21: id pins the EXACT row; the composite key stays as fallback
  // for pre-backfill rows / older clients. With twins sharing the key,
  // only the id can tell them apart.
  autoBackfillTaskIds_();
  let row = findTaskRowById_(b.id);
  if (row < 0) {
    row = findTaskRow_({
      date: b.matchDate || b.date,
      type: b.matchType || b.type,
      building: b.matchBuilding || b.building,
      room: b.matchRoom || b.room,
    });
  }
  if (row < 0) throw new Error('task not found');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.TASK);
  if (b.date !== undefined)     sh.getRange(row, TASK_COL.DATE).setValue(b.date);
  if (b.type !== undefined)     sh.getRange(row, TASK_COL.TYPE).setValue(b.type);
  if (b.building !== undefined) sh.getRange(row, TASK_COL.BUILDING).setValue(b.building);
  if (b.room !== undefined)     sh.getRange(row, TASK_COL.ROOM).setValue(b.room);
  if (b.customer !== undefined) sh.getRange(row, TASK_COL.CUSTOMER).setValue(b.customer);
  if (b.phone !== undefined)    sh.getRange(row, TASK_COL.PHONE).setValue(b.phone);
  if (b.note !== undefined)     sh.getRange(row, TASK_COL.NOTE).setValue(b.note);
  if (b.status !== undefined)   sh.getRange(row, TASK_COL.STATUS).setValue(b.status);
  if (b.cost !== undefined) {
    ensureTaskCostColumn_(sh); // v3.10.0 — backward compat for old tabs
    const n = parseFloat(b.cost);
    sh.getRange(row, TASK_COL.COST).setValue(isFinite(n) && n > 0 ? n : '');
  }
  clearTasksCache_();
  return { updated: true, row: row };
}

function updateTaskStatus_(b) {
  // v3.21: with an id, flip ONLY that row. Composite fallback keeps the
  // old flip-every-duplicate behaviour for pre-backfill rows.
  autoBackfillTaskIds_();
  const idRow = findTaskRowById_(b.id);
  const rows = idRow >= 0 ? [idRow] : findAllTaskRows_(b);
  if (rows.length === 0) throw new Error('task not found');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.TASK);
  const status = b.status || 'เสร็จ';
  // v3.23 (audit r8 bug #3): closing an OVERDUE task also moves its date
  // to today. Without this the done row failed the kanban's
  // "เสร็จวันนี้" date check and vanished from the board with no trace,
  // and the daily done-KPI under-counted. Only past dates move — closing
  // a future-dated task early keeps its scheduled date.
  const isDoneWrite = status === 'เสร็จ' || status === 'done' || status === 'ปิดแล้ว';
  const todayTs = (function () {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  })();
  const todayStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy');
  // Flip every duplicate sharing this key, not just the first — see
  // findAllTaskRows_. Prevents the "close → pops back open" bounce.
  for (let i = 0; i < rows.length; i++) {
    sh.getRange(rows[i], TASK_COL.STATUS).setValue(status);
    if (isDoneWrite) {
      const ts = taskDayTime_(sh.getRange(rows[i], TASK_COL.DATE).getValue());
      if (ts !== null && ts < todayTs) {
        sh.getRange(rows[i], TASK_COL.DATE).setValue(todayStr);
      }
    }
  }
  clearTasksCache_();
  return { updated: true, rows: rows, count: rows.length };
}

function deleteTask_(b) {
  // v3.21: with an id, delete ONLY that row (composite fallback below).
  autoBackfillTaskIds_();
  const idRow = findTaskRowById_(b.id);
  const rows = idRow >= 0 ? [idRow] : findAllTaskRows_(b);
  if (rows.length === 0) throw new Error('task not found');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.TASK);
  // Delete every duplicate row sharing this key, not just the first
  // (mirrors updateTaskStatus_ — the whole system treats this composite
  // key as a single task's identity, so the deletion has to too).
  // Iterate descending so each deleteRow doesn't shift the indices of
  // the rows we still need to touch.
  for (let i = rows.length - 1; i >= 0; i--) {
    sh.deleteRow(rows[i]);
  }
  clearTasksCache_();
  // Audit log — destructive op, always record
  const match = (b && b.match) || b;
  const taskId = (match.date || '') + '|' + (match.building || '') + '|' + (match.room || '') + '|' + (match.type || '');
  logAudit_('deleteTask', 'task', taskId, '', b.creator);
  return { deleted: true, rows: rows, count: rows.length };
}

/* ========== ROOM MUTATE ========== */
function updateRoomStatus_(b) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.ROOM);
  if (!sh) throw new Error('sheet "ห้อง" not found');
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(norm);
  // Shared resolver (r11) — same alias table as getRooms_, so any sheet
  // the app can READ it can also WRITE (was exact-name-only here).
  const cols = roomHeaderCols_(headers);
  const idxBld = cols.bld, idxRoom = cols.room, idxStatus = cols.status,
        idxTenant = cols.tenant, idxPhone = cols.phone,
        idxCntr = cols.cntr, idxPrice = cols.price;
  if (idxBld < 0 || idxRoom < 0 || idxStatus < 0) throw new Error('headers missing on ห้อง');
  for (let i = 1; i < data.length; i++) {
    if (norm(data[i][idxBld]) === norm(b.building) && norm(data[i][idxRoom]) === norm(b.room)) {
      // Snapshot every field we might write so we can diff after the
      // write and produce a single human-readable audit entry. v3.17
      // only audited status changes; v3.18 covers tenant/phone/contract;
      // v3.20 adds price — which the UI sent all along but the backend
      // silently dropped (room price edits reverted on refresh).
      const oldStatus = norm(data[i][idxStatus]);
      const oldTenant = idxTenant >= 0 ? norm(data[i][idxTenant]) : '';
      const oldPhone  = idxPhone  >= 0 ? norm(data[i][idxPhone])  : '';
      const oldCntr   = idxCntr   >= 0 ? norm(data[i][idxCntr])   : '';
      const oldPrice  = idxPrice  >= 0 ? norm(data[i][idxPrice])  : '';

      if (b.status      !== undefined) sh.getRange(i+1, idxStatus+1).setValue(b.status);
      if (b.tenant      !== undefined && idxTenant >= 0) sh.getRange(i+1, idxTenant+1).setValue(b.tenant);
      if (b.phone       !== undefined && idxPhone  >= 0) sh.getRange(i+1, idxPhone+1).setValue(b.phone);
      if (b.contractEnd !== undefined && idxCntr   >= 0) sh.getRange(i+1, idxCntr+1).setValue(b.contractEnd);
      if (b.price       !== undefined && idxPrice  >= 0) sh.getRange(i+1, idxPrice+1).setValue(b.price);
      clearRoomsCache_();

      // Field-level diff for the audit log. Empty diffs (caller sent a
      // value identical to what was there) collapse to nothing, so a
      // no-op save doesn't pollute the log.
      const diffs = [];
      if (b.status !== undefined && norm(b.status) !== oldStatus) {
        diffs.push('สถานะ: ' + (oldStatus || '∅') + ' → ' + norm(b.status));
      }
      if (b.tenant !== undefined && norm(b.tenant) !== oldTenant) {
        diffs.push('ผู้เช่า: ' + (oldTenant || '∅') + ' → ' + (norm(b.tenant) || '∅'));
      }
      if (b.phone !== undefined && norm(b.phone) !== oldPhone) {
        diffs.push('เบอร์: ' + (oldPhone || '∅') + ' → ' + (norm(b.phone) || '∅'));
      }
      if (b.contractEnd !== undefined && norm(b.contractEnd) !== oldCntr) {
        diffs.push('สัญญา: ' + (oldCntr || '∅') + ' → ' + (norm(b.contractEnd) || '∅'));
      }
      if (b.price !== undefined && idxPrice >= 0 && norm(b.price) !== oldPrice) {
        diffs.push('ค่าเช่า: ' + (oldPrice || '∅') + ' → ' + (norm(b.price) || '∅'));
      }
      if (diffs.length > 0) {
        // Choose the action label by what dominated the edit so the
        // audit-viewer's filter chips still group nicely:
        //   - status changed → updateRoomStatus
        //   - else any data field changed → updateRoomData
        const action = (b.status !== undefined && norm(b.status) !== oldStatus)
          ? 'updateRoomStatus'
          : 'updateRoomData';
        logAudit_(action, 'room', b.building + '|' + b.room, diffs.join(', '), b.creator);
      }
      return { updated: true, row: i+1 };
    }
  }
  throw new Error('room not found: ' + b.building + ' ' + b.room);
}

/* ========== EQUIPMENT (NEW v3.6.0) ========== */
/**
 * Auto-create tab 'อุปกรณ์' on first write. Returns the sheet.
 * Header has 12 columns (v3.7.0 added col L 'รอบบำรุง(วัน)'); row 1 frozen.
 * Backward compat: if tab exists with 11 cols, add the 12th header in-place.
 */
function getOrCreateEquipmentSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAMES.EQUIPMENT);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAMES.EQUIPMENT);
    sh.appendRow([
      'id', 'ตึก', 'ห้อง', 'ประเภท', 'ยี่ห้อ/รุ่น',
      'วันติดตั้ง', 'วันซ่อมล่าสุด', 'สถานะ', 'หมายเหตุ',
      'ผู้บันทึก', 'วันที่บันทึก', 'รอบบำรุง(วัน)',
    ]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 12).setFontWeight('bold').setBackground('#FFF7ED');
  } else {
    // backward compat: ensure column L header exists
    const lastCol = sh.getLastColumn();
    if (lastCol < 12) {
      sh.getRange(1, 12).setValue('รอบบำรุง(วัน)')
        .setFontWeight('bold').setBackground('#FFF7ED');
    }
  }
  return sh;
}

function getAllEquipment_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.EQUIPMENT);
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const lastCol = Math.max(sh.getLastColumn(), 11);
  const cols = Math.min(lastCol, 12);
  const data = sh.getRange(2, 1, lastRow - 1, cols).getValues();
  const rows = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const building = norm(r[1]);
    const room = norm(r[2]);
    if (!building || !room) continue;
    const intervalRaw = cols >= 12 ? r[11] : '';
    const intervalNum = parseInt(intervalRaw, 10);
    rows.push({
      id:           norm(r[0]),
      building:     building,
      room:         room,
      type:         norm(r[3]),
      brand:        norm(r[4]),
      installDate:  fmtDate_(r[5]),
      lastService:  fmtDate_(r[6]),
      status:       norm(r[7]) || 'ปกติ',
      note:         norm(r[8]),
      creator:      norm(r[9]),
      createdAt:    norm(r[10]),
      intervalDays: isFinite(intervalNum) && intervalNum > 0 ? intervalNum : 0,
    });
  }
  return rows;
}

function getRoomEquipment_(building, room) {
  const b = norm(building);
  const r = norm(room);
  if (!b || !r) return [];
  const all = getAllEquipmentCached_();
  const filtered = [];
  for (let i = 0; i < all.length; i++) {
    if (all[i].building === b && all[i].room === r) filtered.push(all[i]);
  }
  // Sort by installDate desc (newest first), fall back to id for stability
  filtered.sort(function (a, c) {
    return (c.installDate || '').localeCompare(a.installDate || '');
  });
  return filtered;
}

/**
 * Append a new equipment entry. Auto-creates the sheet if missing.
 * Required: building, room, type. Optional: brand, installDate,
 * lastService, status, note.
 */
function addEquipment_(b) {
  if (!b.building || !b.room) throw new Error('building/room required');
  if (!b.type) throw new Error('type required');
  const sh = getOrCreateEquipmentSheet_();
  const id = Utilities.getUuid();
  const createdAt = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
  const intervalNum = parseInt(b.intervalDays, 10);
  sh.appendRow([
    id,
    b.building,
    b.room,
    b.type,
    b.brand || '',
    b.installDate || '',
    b.lastService || '',
    b.status || 'ปกติ',
    b.note || '',
    b.creator || '',
    createdAt,
    isFinite(intervalNum) && intervalNum > 0 ? intervalNum : '',
  ]);
  clearEquipmentCache_();
  return { appended: true, id: id, row: sh.getLastRow() };
}

/**
 * Update an existing equipment entry by id. Only provided fields are
 * written; others are left untouched. Commonly used to update status
 * + lastService when an engineer marks a unit repaired.
 */
function updateEquipment_(b) {
  if (!b.id) throw new Error('id required');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.EQUIPMENT);
  if (!sh) throw new Error('sheet "อุปกรณ์" not found');
  const lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error('no equipment rows');
  const found = findRowById_(sh, b.id); // r11 shared scan
  if (found < 0) throw new Error('equipment not found: ' + b.id);
  // Column index map (1-based)
  // 2:ตึก 3:ห้อง 4:ประเภท 5:ยี่ห้อ 6:วันติดตั้ง 7:วันซ่อมล่าสุด 8:สถานะ 9:หมายเหตุ 12:รอบบำรุง(วัน)
  if (b.type        !== undefined) sh.getRange(found, 4).setValue(b.type);
  if (b.brand       !== undefined) sh.getRange(found, 5).setValue(b.brand);
  if (b.installDate !== undefined) sh.getRange(found, 6).setValue(b.installDate);
  if (b.lastService !== undefined) sh.getRange(found, 7).setValue(b.lastService);
  if (b.status      !== undefined) sh.getRange(found, 8).setValue(b.status);
  if (b.note        !== undefined) sh.getRange(found, 9).setValue(b.note);
  if (b.intervalDays !== undefined) {
    const n = parseInt(b.intervalDays, 10);
    sh.getRange(found, 12).setValue(isFinite(n) && n > 0 ? n : '');
  }
  clearEquipmentCache_();
  return { updated: true, row: found };
}

/* ========== FACILITY (NEW v3.8.0) ========== */
/**
 * Auto-create tab 'สาธารณูปโภค' on first write. Returns the sheet.
 * 11 columns; row 1 frozen.
 */
function getOrCreateFacilitySheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAMES.FACILITY);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAMES.FACILITY);
    sh.appendRow([
      'id', 'ตึก', 'ประเภท', 'ชื่อ/รุ่น',
      'วันติดตั้ง', 'วันบริการล่าสุด', 'สถานะ', 'หมายเหตุ',
      'ผู้บันทึก', 'วันที่บันทึก', 'รอบบำรุง(วัน)',
    ]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#ECFDF5');
  }
  return sh;
}

function getAllFacilities_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.FACILITY);
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const data = sh.getRange(2, 1, lastRow - 1, 11).getValues();
  const rows = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const building = norm(r[1]);
    if (!building) continue;
    const intervalNum = parseInt(r[10], 10);
    rows.push({
      id:           norm(r[0]),
      building:     building,
      type:         norm(r[2]),
      name:         norm(r[3]),
      installDate:  fmtDate_(r[4]),
      lastService:  fmtDate_(r[5]),
      status:       norm(r[6]) || 'ใช้งานได้',
      note:         norm(r[7]),
      creator:      norm(r[8]),
      createdAt:    norm(r[9]),
      intervalDays: isFinite(intervalNum) && intervalNum > 0 ? intervalNum : 0,
    });
  }
  return rows;
}

/**
 * Append a new facility. Auto-creates the sheet if missing.
 * Required: building, type. Optional: name, installDate, lastService,
 * status, note, intervalDays.
 */
function addFacility_(b) {
  if (!b.building) throw new Error('building required');
  if (!b.type) throw new Error('type required');
  const sh = getOrCreateFacilitySheet_();
  const id = Utilities.getUuid();
  const createdAt = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
  const intervalNum = parseInt(b.intervalDays, 10);
  sh.appendRow([
    id,
    b.building,
    b.type,
    b.name || '',
    b.installDate || '',
    b.lastService || '',
    b.status || 'ใช้งานได้',
    b.note || '',
    b.creator || '',
    createdAt,
    isFinite(intervalNum) && intervalNum > 0 ? intervalNum : '',
  ]);
  clearFacilityCache_();
  return { appended: true, id: id, row: sh.getLastRow() };
}

/**
 * Update an existing facility by id. Only provided fields are written.
 */
function updateFacility_(b) {
  if (!b.id) throw new Error('id required');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.FACILITY);
  if (!sh) throw new Error('sheet "สาธารณูปโภค" not found');
  const lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error('no facility rows');
  const found = findRowById_(sh, b.id); // r11 shared scan
  if (found < 0) throw new Error('facility not found: ' + b.id);
  // 2:ตึก 3:ประเภท 4:ชื่อ 5:วันติดตั้ง 6:วันบริการล่าสุด 7:สถานะ 8:หมายเหตุ 11:รอบบำรุง
  if (b.type        !== undefined) sh.getRange(found, 3).setValue(b.type);
  if (b.name        !== undefined) sh.getRange(found, 4).setValue(b.name);
  if (b.installDate !== undefined) sh.getRange(found, 5).setValue(b.installDate);
  if (b.lastService !== undefined) sh.getRange(found, 6).setValue(b.lastService);
  if (b.status      !== undefined) sh.getRange(found, 7).setValue(b.status);
  if (b.note        !== undefined) sh.getRange(found, 8).setValue(b.note);
  if (b.intervalDays !== undefined) {
    const n = parseInt(b.intervalDays, 10);
    sh.getRange(found, 11).setValue(isFinite(n) && n > 0 ? n : '');
  }
  clearFacilityCache_();
  return { updated: true, row: found };
}

/* ========== PART / INVENTORY (NEW v3.11.0 — Task 37) ========== */
/**
 * Auto-create tab 'อะไหล่' on first write. Returns the sheet.
 * 10 columns; row 1 frozen.
 *
 * Schema (1-based):
 *   1:id  2:ชื่อ  3:หมวด  4:จำนวนคงเหลือ  5:จุดสั่งซื้อ
 *   6:หน่วย  7:หมายเหตุ  8:ผู้บันทึก  9:วันที่บันทึก  10:วันที่ปรับปรุง
 *
 * "จุดสั่งซื้อ" (reorder threshold) drives the low-stock alert badge
 * in the UI. Empty = no alert.
 */
function getOrCreatePartSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAMES.PART);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAMES.PART);
    sh.appendRow([
      'id', 'ชื่อ', 'หมวด', 'จำนวนคงเหลือ', 'จุดสั่งซื้อ',
      'หน่วย', 'หมายเหตุ', 'ผู้บันทึก', 'วันที่บันทึก', 'วันที่ปรับปรุง',
    ]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#FEF3C7');
    sh.setColumnWidth(2, 220); // name
    sh.setColumnWidth(7, 260); // note
  }
  return sh;
}

/** v3.23: column K (11) "ราคา/หน่วย" — per-unit price in THB, powering
 *  stock valuation + parts-cost visibility. Same lazy-migration pattern
 *  as the task cost/id columns: header appears on first write. */
var PART_PRICE_COL = 11;
function ensurePartPriceColumn_(sh) {
  if (sh.getLastColumn() >= PART_PRICE_COL) return;
  sh.getRange(1, PART_PRICE_COL).setValue('ราคา/หน่วย').setFontWeight('bold');
}

function getAllParts_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.PART);
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const cols = Math.min(Math.max(sh.getLastColumn(), 10), PART_PRICE_COL);
  const data = sh.getRange(2, 1, lastRow - 1, cols).getValues();
  const rows = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const name = norm(r[1]);
    if (!name) continue;
    const stockNum = parseFloat(r[3]);
    const threshNum = parseFloat(r[4]);
    const priceNum = cols >= PART_PRICE_COL ? parseFloat(r[10]) : NaN;
    rows.push({
      id:        norm(r[0]),
      name:      name,
      category:  norm(r[2]) || 'ทั่วไป',
      stock:     isFinite(stockNum) ? stockNum : 0,
      threshold: isFinite(threshNum) && threshNum >= 0 ? threshNum : 0,
      unit:      norm(r[5]) || 'ชิ้น',
      note:      norm(r[6]),
      creator:   norm(r[7]),
      createdAt: norm(r[8]),
      updatedAt: norm(r[9]),
      price:     isFinite(priceNum) && priceNum > 0 ? priceNum : 0, // v3.23
    });
  }
  return rows;
}

/**
 * Append a new part. Required: name. Optional: category, stock,
 * threshold, unit, note. New rows stamp creator + createdAt + updatedAt.
 */
function addPart_(b) {
  if (!b.name) throw new Error('name required');
  const sh = getOrCreatePartSheet_();
  ensurePartPriceColumn_(sh); // v3.23
  const id = Utilities.getUuid();
  const now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
  const stockNum = parseFloat(b.stock);
  const threshNum = parseFloat(b.threshold);
  const priceNum = parseFloat(b.price);
  sh.appendRow([
    id,
    b.name,
    b.category || 'ทั่วไป',
    isFinite(stockNum) ? stockNum : 0,
    isFinite(threshNum) && threshNum >= 0 ? threshNum : '',
    b.unit || 'ชิ้น',
    b.note || '',
    b.creator || '',
    now,
    now,
    isFinite(priceNum) && priceNum > 0 ? priceNum : '', // v3.23 ราคา/หน่วย
  ]);
  clearPartCache_();
  return { appended: true, id: id, row: sh.getLastRow() };
}

/**
 * Update an existing part by id. Only provided fields are written.
 * Always bumps the updatedAt timestamp so the UI can show "เพิ่ง
 * อัปเดต" relative time.
 */
function updatePart_(b) {
  if (!b.id) throw new Error('id required');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.PART);
  if (!sh) throw new Error('sheet "อะไหล่" not found');
  const lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error('no part rows');
  const found = findRowById_(sh, b.id); // r11 shared scan
  if (found < 0) throw new Error('part not found: ' + b.id);
  // Cols: 2:name 3:category 4:stock 5:threshold 6:unit 7:note 10:updatedAt
  if (b.name      !== undefined) sh.getRange(found, 2).setValue(b.name);
  if (b.category  !== undefined) sh.getRange(found, 3).setValue(b.category);
  if (b.stock     !== undefined) {
    const n = parseFloat(b.stock);
    sh.getRange(found, 4).setValue(isFinite(n) ? n : 0);
  }
  if (b.threshold !== undefined) {
    const n = parseFloat(b.threshold);
    sh.getRange(found, 5).setValue(isFinite(n) && n >= 0 ? n : '');
  }
  if (b.unit      !== undefined) sh.getRange(found, 6).setValue(b.unit);
  if (b.note      !== undefined) sh.getRange(found, 7).setValue(b.note);
  if (b.price     !== undefined) { // v3.23 ราคา/หน่วย
    ensurePartPriceColumn_(sh);
    const n = parseFloat(b.price);
    sh.getRange(found, PART_PRICE_COL).setValue(isFinite(n) && n > 0 ? n : '');
  }
  const now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
  sh.getRange(found, 10).setValue(now);
  clearPartCache_();
  return { updated: true, row: found };
}

/**
 * Convenient stock adjustment — atomic +/- delta. Frontend uses this
 * for inline "+/-" buttons so a race between two users adjusting
 * the same row doesn't lose updates (the cell read+write happens
 * inside withWriteLock at the caller).
 */
function adjustStockPart_(b) {
  if (!b.id) throw new Error('id required');
  if (b.delta === undefined || b.delta === null) throw new Error('delta required');
  const delta = parseFloat(b.delta);
  if (!isFinite(delta)) throw new Error('delta must be a number');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.PART);
  if (!sh) throw new Error('sheet "อะไหล่" not found');
  const lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error('no part rows');
  const found = findRowById_(sh, b.id); // r11 shared scan
  if (found < 0) throw new Error('part not found: ' + b.id);
  const cell = sh.getRange(found, 4);
  const current = parseFloat(cell.getValue());
  const next = (isFinite(current) ? current : 0) + delta;
  // Clamp at 0 — stock can't go negative. The frontend should prevent
  // this too, but enforce server-side as the source of truth.
  const clamped = next < 0 ? 0 : next;
  cell.setValue(clamped);
  const now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
  sh.getRange(found, 10).setValue(now);
  clearPartCache_();
  return { adjusted: true, row: found, stock: clamped };
}

/* ========== TIME LOG (NEW v3.12.0 — Task 35) ========== */
/**
 * Auto-create tab 'บันทึกเวลา' on first write. Returns the sheet.
 * 8 columns; row 1 frozen.
 *
 * Schema (1-based):
 *   1:id  2:taskKey  3:startedAt  4:endedAt
 *   5:durationMin  6:user  7:note  8:createdAt
 *
 * taskKey = "date|building|room|type" — same composite key used by
 * the dashboard client to identify a task row. We don't FK to the
 * task sheet directly because the user may delete a task without
 * affecting its historical time records (useful for payroll).
 *
 * endedAt empty + durationMin empty = "running" state.
 */
function getOrCreateTimeLogSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAMES.TIME_LOG);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAMES.TIME_LOG);
    sh.appendRow([
      'id', 'taskKey', 'startedAt', 'endedAt',
      'durationMin', 'user', 'note', 'createdAt',
    ]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#DBEAFE');
    sh.setColumnWidth(2, 280); // taskKey
    sh.setColumnWidth(7, 240); // note
  }
  return sh;
}

/** Parse all rows; helper for the read actions. Skips header. */
function readTimeLogRows_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.TIME_LOG);
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const data = sh.getRange(2, 1, lastRow - 1, 8).getValues();
  const rows = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const id = norm(r[0]);
    if (!id) continue;
    const durRaw = parseFloat(r[4]);
    rows.push({
      id:          id,
      taskKey:     norm(r[1]),
      startedAt:   norm(r[2]),
      endedAt:     norm(r[3]),
      durationMin: isFinite(durRaw) ? durRaw : 0,
      user:        norm(r[5]),
      note:        norm(r[6]),
      createdAt:   norm(r[7]),
      sheetRow:    i + 2,
    });
  }
  return rows;
}

/**
 * GET: optionally filter by taskKey or user. Empty filter returns all.
 * Returned rows omit `sheetRow` (internal pointer).
 */
function getTimeLogs_(b) {
  const taskKey = b && b.taskKey ? norm(b.taskKey) : '';
  const user = b && b.user ? norm(b.user) : '';
  const rows = readTimeLogRows_();
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (taskKey && r.taskKey !== taskKey) continue;
    if (user && r.user !== user) continue;
    out.push({
      id: r.id,
      taskKey: r.taskKey,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      durationMin: r.durationMin,
      user: r.user,
      note: r.note,
      createdAt: r.createdAt,
    });
  }
  return rows.length ? { rows: out } : { rows: [] };
}

/**
 * Find the user's currently-running timer (open row = endedAt empty),
 * if any. Frontend uses this to render the "▶ resume" / "⏸ stop" state
 * on page load.
 */
function getActiveTimer_(b) {
  const user = b && b.user ? norm(b.user) : '';
  if (!user) throw new Error('user required');
  const rows = readTimeLogRows_();
  // If a user has multiple open timers (shouldn't happen — startTimer
  // refuses — but defensive), return the most recent.
  let found = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.user !== user) continue;
    if (r.endedAt) continue;
    if (!found || r.startedAt > found.startedAt) found = r;
  }
  if (!found) return { active: null };
  return {
    active: {
      id: found.id,
      taskKey: found.taskKey,
      startedAt: found.startedAt,
      user: found.user,
    },
  };
}

/**
 * Start a timer. Requires taskKey + user. Refuses if user already has
 * an open timer for the same task (avoids double-start), but allows
 * the user to have one open timer per distinct task.
 */
function startTimer_(b) {
  if (!b.taskKey) throw new Error('taskKey required');
  if (!b.user) throw new Error('user required');
  const taskKey = norm(b.taskKey);
  const user = norm(b.user);
  // Refuse if there's already an open row for this {user, taskKey}
  const rows = readTimeLogRows_();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.user === user && r.taskKey === taskKey && !r.endedAt) {
      throw new Error('มี timer ที่กำลังจับเวลาอยู่แล้วสำหรับงานนี้');
    }
  }
  const sh = getOrCreateTimeLogSheet_();
  const id = Utilities.getUuid();
  const now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  sh.appendRow([
    id,
    taskKey,
    now,           // startedAt
    '',            // endedAt
    '',            // durationMin
    user,
    norm(b.note),
    now,           // createdAt
  ]);
  return { started: true, id: id, startedAt: now, row: sh.getLastRow() };
}

/**
 * Stop a timer. Two lookup modes:
 *   - by id: explicit row
 *   - by {user, taskKey}: find the user's open row for that task
 *
 * Computes durationMin (rounded) and writes both endedAt and duration.
 * Optional note appended.
 */
function stopTimer_(b) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.TIME_LOG);
  if (!sh) throw new Error('sheet "บันทึกเวลา" not found');
  const rows = readTimeLogRows_();
  let target = null;
  if (b.id) {
    const id = norm(b.id);
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].id === id) { target = rows[i]; break; }
    }
  } else if (b.user && b.taskKey) {
    const user = norm(b.user);
    const taskKey = norm(b.taskKey);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.user === user && r.taskKey === taskKey && !r.endedAt) {
        target = r; break;
      }
    }
  } else {
    throw new Error('id or {user, taskKey} required');
  }
  if (!target) throw new Error('ไม่พบ timer ที่กำลังจับเวลา');
  if (target.endedAt) throw new Error('timer นี้หยุดไปแล้ว');

  // Parse in Bangkok explicitly — `new Date("yyyy-MM-ddTHH:mm:ss")` uses
  // the script host's TZ, so a non-Bangkok host would skew the duration
  // by the TZ offset (payroll-relevant). startedAt is always written by
  // startTimer_ in this exact format.
  const startMs = Utilities.parseDate(target.startedAt, 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss').getTime();
  const nowDate = new Date();
  const endStr = Utilities.formatDate(nowDate, 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  const durMin = Math.max(0, Math.round((nowDate.getTime() - startMs) / 60000));

  sh.getRange(target.sheetRow, 4).setValue(endStr);
  sh.getRange(target.sheetRow, 5).setValue(durMin);
  if (b.note !== undefined) {
    // Append to existing note (don't blow away the user's note from start)
    const existing = target.note ? target.note + ' / ' : '';
    sh.getRange(target.sheetRow, 7).setValue(existing + norm(b.note));
  }
  return { stopped: true, id: target.id, durationMin: durMin, endedAt: endStr };
}

/* ========== VEHICLE (NEW v3.13.0) ========== */
/**
 * Auto-create tab 'ยานพาหนะ' on first write. Returns the sheet.
 * 10 columns; row 1 frozen.
 *
 * Schema (1-based):
 *   1:id  2:ตึก  3:ห้อง  4:ทะเบียน  5:ยี่ห้อ/รุ่น
 *   6:สี  7:หมายเหตุ  8:ผู้บันทึก  9:วันที่บันทึก  10:วันที่ปรับปรุง
 *
 * Multiple vehicles per room are supported — the {ตึก, ห้อง} pair is
 * not unique. Vehicle stays even if tenant moves out (clean-up is a
 * manual action). License plate is treated as the natural identifier
 * the user remembers; uuid is for internal API.
 */
function getOrCreateVehicleSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAMES.VEHICLE);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAMES.VEHICLE);
    sh.appendRow([
      'id', 'ตึก', 'ห้อง', 'ทะเบียน', 'ยี่ห้อ/รุ่น',
      'สี', 'หมายเหตุ', 'ผู้บันทึก', 'วันที่บันทึก', 'วันที่ปรับปรุง',
    ]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#FCE7F3');
    sh.setColumnWidth(4, 140); // plate
    sh.setColumnWidth(5, 200); // model
    sh.setColumnWidth(7, 260); // note
  }
  return sh;
}

function getAllVehicles_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.VEHICLE);
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const data = sh.getRange(2, 1, lastRow - 1, 10).getValues();
  const rows = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const id = norm(r[0]);
    if (!id) continue;
    rows.push({
      id:        id,
      building:  norm(r[1]),
      room:      norm(r[2]),
      plate:     norm(r[3]),
      model:     norm(r[4]),
      color:     norm(r[5]),
      note:      norm(r[6]),
      creator:   norm(r[7]),
      createdAt: norm(r[8]),
      updatedAt: norm(r[9]),
    });
  }
  return rows;
}

/**
 * Append a new vehicle. Required: building, room, plate. Optional:
 * model, color, note. Server stamps creator + createdAt + updatedAt.
 */
function addVehicle_(b) {
  if (!b.building) throw new Error('building required');
  if (!b.room) throw new Error('room required');
  if (!b.plate) throw new Error('plate required');
  const sh = getOrCreateVehicleSheet_();
  const id = Utilities.getUuid();
  const now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
  sh.appendRow([
    id,
    b.building,
    b.room,
    b.plate,
    b.model || '',
    b.color || '',
    b.note || '',
    b.creator || '',
    now,
    now,
  ]);
  clearVehicleCache_();
  return { appended: true, id: id, row: sh.getLastRow() };
}

/**
 * Update an existing vehicle by id. Partial — only provided fields
 * are written. Always bumps updatedAt.
 */
function updateVehicle_(b) {
  if (!b.id) throw new Error('id required');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.VEHICLE);
  if (!sh) throw new Error('sheet "ยานพาหนะ" not found');
  const lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error('no vehicle rows');
  const found = findRowById_(sh, b.id); // r11 shared scan
  if (found < 0) throw new Error('vehicle not found: ' + b.id);
  // Cols: 2:ตึก 3:ห้อง 4:ทะเบียน 5:ยี่ห้อ/รุ่น 6:สี 7:หมายเหตุ 10:updatedAt
  if (b.building !== undefined) sh.getRange(found, 2).setValue(b.building);
  if (b.room     !== undefined) sh.getRange(found, 3).setValue(b.room);
  if (b.plate    !== undefined) sh.getRange(found, 4).setValue(b.plate);
  if (b.model    !== undefined) sh.getRange(found, 5).setValue(b.model);
  if (b.color    !== undefined) sh.getRange(found, 6).setValue(b.color);
  if (b.note     !== undefined) sh.getRange(found, 7).setValue(b.note);
  const now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
  sh.getRange(found, 10).setValue(now);
  clearVehicleCache_();
  return { updated: true, row: found };
}

/**
 * Delete a vehicle by id. Used when the vehicle no longer belongs to
 * the property (sold, moved out with tenant, etc.).
 */
function deleteVehicle_(b) {
  if (!b.id) throw new Error('id required');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.VEHICLE);
  if (!sh) throw new Error('sheet "ยานพาหนะ" not found');
  const lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error('no vehicle rows');
  const found = findRowById_(sh, b.id); // r11 shared scan
  if (found < 0) throw new Error('vehicle not found: ' + b.id);
  sh.deleteRow(found);
  clearVehicleCache_();
  return { deleted: true, row: found };
}

/* ========== LEAD CRM (NEW v3.15.0 — Task 26) ========== */
/**
 * Auto-create tab 'ลูกค้าสนใจ' on first write. Returns the sheet.
 * 10 columns; row 1 frozen.
 *
 * Schema (1-based):
 *   1:id  2:ชื่อ  3:เบอร์โทร  4:ช่องทาง  5:สนใจ (text: ตึก/ห้อง/ราคา)
 *   6:stage  7:หมายเหตุ  8:ผู้บันทึก  9:วันที่บันทึก  10:วันที่ปรับปรุง
 *
 * Stage values must match LEAD_STAGES. Frontend renders a Kanban
 * board with one column per stage; moving a lead = updating stage.
 */
function getOrCreateLeadSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAMES.LEAD);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAMES.LEAD);
    sh.appendRow([
      'id', 'ชื่อ', 'เบอร์โทร', 'ช่องทาง', 'สนใจ',
      'stage', 'หมายเหตุ', 'ผู้บันทึก', 'วันที่บันทึก', 'วันที่ปรับปรุง',
    ]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#FEF9C3');
    sh.setColumnWidth(2, 180); // name
    sh.setColumnWidth(5, 260); // interest
    sh.setColumnWidth(7, 280); // note
  }
  return sh;
}

function getAllLeads_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.LEAD);
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const data = sh.getRange(2, 1, lastRow - 1, 10).getValues();
  const rows = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const id = norm(r[0]);
    if (!id) continue;
    rows.push({
      id:        id,
      name:      norm(r[1]),
      phone:     norm(r[2]),
      source:    norm(r[3]),
      interest:  norm(r[4]),
      stage:     norm(r[5]) || 'ใหม่',
      note:      norm(r[6]),
      creator:   norm(r[7]),
      createdAt: norm(r[8]),
      updatedAt: norm(r[9]),
    });
  }
  return rows;
}

function addLead_(b) {
  if (!b.name) throw new Error('name required');
  const sh = getOrCreateLeadSheet_();
  const id = Utilities.getUuid();
  const now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
  sh.appendRow([
    id, b.name, b.phone || '', b.source || '', b.interest || '',
    b.stage || 'ใหม่', b.note || '', b.creator || '', now, now,
  ]);
  clearLeadCache_();
  return { appended: true, id: id, row: sh.getLastRow() };
}

function updateLead_(b) {
  if (!b.id) throw new Error('id required');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.LEAD);
  if (!sh) throw new Error('sheet "ลูกค้าสนใจ" not found');
  const lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error('no lead rows');
  const found = findRowById_(sh, b.id); // r11 shared scan
  if (found < 0) throw new Error('lead not found: ' + b.id);
  // 2:name 3:phone 4:source 5:interest 6:stage 7:note 10:updatedAt
  if (b.name     !== undefined) sh.getRange(found, 2).setValue(b.name);
  if (b.phone    !== undefined) sh.getRange(found, 3).setValue(b.phone);
  if (b.source   !== undefined) sh.getRange(found, 4).setValue(b.source);
  if (b.interest !== undefined) sh.getRange(found, 5).setValue(b.interest);
  if (b.stage    !== undefined) sh.getRange(found, 6).setValue(b.stage);
  if (b.note     !== undefined) sh.getRange(found, 7).setValue(b.note);
  const now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
  sh.getRange(found, 10).setValue(now);
  clearLeadCache_();
  return { updated: true, row: found };
}

function deleteLead_(b) {
  if (!b.id) throw new Error('id required');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.LEAD);
  if (!sh) throw new Error('sheet "ลูกค้าสนใจ" not found');
  const lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error('no lead rows');
  const found = findRowById_(sh, b.id); // r11 shared scan
  if (found < 0) throw new Error('lead not found: ' + b.id);
  sh.deleteRow(found);
  clearLeadCache_();
  return { deleted: true, row: found };
}

/* ========== REQUISITION (NEW v3.16.0 — parts checkout log) ========== */
/**
 * Auto-create tab 'เบิกอะไหล่' on first write. 10 columns; row 1 frozen.
 *
 * Schema:
 *   1:id  2:partId  3:partName  4:quantity  5:ตึก  6:ห้อง
 *   7:taskKey  8:ผู้เบิก  9:หมายเหตุ  10:วันที่เบิก
 *
 * `partName` is a snapshot at requisition time — historical record
 * stays meaningful even if the part is renamed/deleted later.
 *
 * `taskKey` (optional) format: "date|building|room|type" — same key
 * used by time-tracking + Kanban for cross-feature linking.
 */
function getOrCreateRequisitionSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAMES.REQUISITION);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAMES.REQUISITION);
    sh.appendRow([
      'id', 'partId', 'partName', 'quantity', 'ตึก', 'ห้อง',
      'taskKey', 'ผู้เบิก', 'หมายเหตุ', 'วันที่เบิก',
    ]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#FCE7F3');
    sh.setColumnWidth(3, 220); // partName
    sh.setColumnWidth(9, 280); // note
  }
  return sh;
}

function getAllRequisitions_(b) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.REQUISITION);
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const partFilter = b && b.partId ? norm(b.partId) : '';
  const data = sh.getRange(2, 1, lastRow - 1, 10).getValues();
  const rows = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const id = norm(r[0]);
    if (!id) continue;
    const partId = norm(r[1]);
    if (partFilter && partId !== partFilter) continue;
    const qNum = parseFloat(r[3]);
    rows.push({
      id:        id,
      partId:    partId,
      partName:  norm(r[2]),
      quantity:  isFinite(qNum) ? qNum : 0,
      building:  norm(r[4]),
      room:      norm(r[5]),
      taskKey:   norm(r[6]),
      user:      norm(r[7]),
      note:      norm(r[8]),
      createdAt: norm(r[9]),
    });
  }
  // v3.24: newest-first + capped like the audit log — the unfiltered
  // path used to return every requisition ever recorded, a latent
  // scaling cliff once an "all requisitions" screen exists.
  rows.reverse();
  const cap = partFilter ? 500 : 200;
  return rows.length > cap ? rows.slice(0, cap) : rows;
}

/**
 * Atomically record a requisition + decrement stock. Both writes
 * happen under withWriteLock at the caller, so a race between two
 * concurrent requisitions can't double-deduct the same row.
 *
 * Required: partId, quantity (positive int). Optional: building, room,
 * taskKey, note.
 *
 * Stock clamps at 0 — if requested qty > stock, log the requisition
 * with what was actually deducted (returns `actualQuantity`).
 */
function addRequisition_(b) {
  if (!b.partId) throw new Error('partId required');
  const reqQty = parseFloat(b.quantity);
  if (!isFinite(reqQty) || reqQty <= 0) throw new Error('quantity must be a positive number');

  // 1. Decrement stock in อะไหล่ sheet
  const partsSh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.PART);
  if (!partsSh) throw new Error('sheet "อะไหล่" not found — เพิ่มอะไหล่ก่อนเบิก');
  const row = findRowById_(partsSh, b.partId); // r11 shared scan
  if (row < 0) throw new Error('part not found: ' + b.partId);
  const nameCell = partsSh.getRange(row, 2).getValue();
  const stockCell = partsSh.getRange(row, 4);
  const current = parseFloat(stockCell.getValue());
  const cur = isFinite(current) ? current : 0;
  const actualQty = Math.min(reqQty, cur); // clamp at 0
  const newStock = cur - actualQty;
  stockCell.setValue(newStock);
  // bump part's updatedAt
  const now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
  partsSh.getRange(row, 10).setValue(now);
  clearPartCache_();

  // 2. Append requisition log row
  const reqSh = getOrCreateRequisitionSheet_();
  const id = Utilities.getUuid();
  reqSh.appendRow([
    id,
    b.partId,
    norm(nameCell),
    actualQty,
    b.building || '',
    b.room || '',
    b.taskKey || '',
    b.user || '',
    b.note || '',
    now,
  ]);

  // Audit log — captures full requisition context for "who took what
  // when for which room" trail (Task 18 + v3.16 link).
  logAudit_('addRequisition', 'part', b.partId,
    norm(nameCell) + ' x' + actualQty + (b.building || b.room ? ' → ' + (b.building || '') + '/' + (b.room || '') : ''),
    b.user);

  return {
    appended: true,
    id: id,
    requestedQuantity: reqQty,
    actualQuantity: actualQty,
    newStock: newStock,
    clamped: actualQty < reqQty,
  };
}

/* ========== AUDIT LOG (NEW v3.17.0 — Task 18) ========== */
/**
 * Auto-create tab 'audit_log' on first write. 7 cols; row 1 frozen.
 *
 * Schema (1-based):
 *   1:id  2:timestamp  3:user  4:action  5:entity  6:entityId  7:details
 *
 * Append-only. No deletes. Single source of truth for "ใครเปลี่ยน
 * อะไรเมื่อไหร่" — investigators read the sheet directly when
 * something looks off.
 */
function getOrCreateAuditSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAMES.AUDIT);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAMES.AUDIT);
    sh.appendRow(['id', 'timestamp', 'user', 'action', 'entity', 'entityId', 'details']);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#E0E7FF');
    sh.setColumnWidth(7, 360); // details
  }
  return sh;
}

/**
 * Best-effort audit log append. Errors swallowed so business writes
 * never fail because of audit-log issues (e.g. quota exhausted).
 */
function logAudit_(action, entity, entityId, details, user) {
  try {
    const sh = getOrCreateAuditSheet_();
    const now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
    sh.appendRow([
      Utilities.getUuid(), now, user || '', action || '', entity || '',
      entityId || '', details || '',
    ]);
  } catch (e) { /* silent */ }
}

function getAllAudit_(b) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.AUDIT);
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const limit = b && b.limit ? parseInt(b.limit, 10) : 200;
  // Most recent first — Apps Script append puts new rows at bottom, so
  // pull last `limit` rows.
  const startRow = Math.max(2, lastRow - limit + 1);
  const numRows = lastRow - startRow + 1;
  const data = sh.getRange(startRow, 1, numRows, 7).getValues();
  const rows = [];
  for (let i = data.length - 1; i >= 0; i--) {
    const r = data[i];
    if (!norm(r[0])) continue;
    rows.push({
      id: norm(r[0]),
      // fmtDateTime_ guards against Sheets coercing the timestamp text
      // into a Date cell (which norm would stringify unparseably).
      timestamp: fmtDateTime_(r[1]),
      user: norm(r[2]),
      action: norm(r[3]),
      entity: norm(r[4]),
      entityId: norm(r[5]),
      details: norm(r[6]),
    });
  }
  return rows;
}

/* ========== RECURRING TASK TEMPLATES (NEW v3.17.0) ========== */
/**
 * Auto-create tab 'งานประจำ' on first write. 11 cols; row 1 frozen.
 *
 * Schema (1-based):
 *   1:id  2:name  3:type  4:ตึก  5:ห้อง  6:intervalDays
 *   7:lastRunDate  8:nextRunDate  9:active  10:หมายเหตุ
 *   11:ผู้สร้าง  12:วันที่สร้าง
 *
 * Run policy:
 *   - User calls runRecurringCheck (manual button or daily)
 *   - For each active template with nextRunDate <= today:
 *       1. Create task row in งาน sheet (today's date)
 *       2. Update template's lastRunDate=today, nextRunDate=today+interval
 *   - Atomic per template (withWriteLock at the doPost layer)
 */
function getOrCreateRecurringSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAMES.RECURRING);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAMES.RECURRING);
    sh.appendRow([
      'id', 'ชื่อ', 'ประเภทงาน', 'ตึก', 'ห้อง', 'รอบ(วัน)',
      'รันล่าสุด', 'รันถัดไป', 'active', 'หมายเหตุ',
      'ผู้สร้าง', 'วันที่สร้าง',
    ]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 12).setFontWeight('bold').setBackground('#ECFCCB');
    sh.setColumnWidth(2, 220); // name
    sh.setColumnWidth(10, 280); // note
  }
  return sh;
}

function getAllRecurring_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.RECURRING);
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const data = sh.getRange(2, 1, lastRow - 1, 12).getValues();
  const rows = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (!norm(r[0])) continue;
    const interval = parseInt(r[5], 10);
    rows.push({
      id: norm(r[0]),
      name: norm(r[1]),
      type: norm(r[2]),
      building: norm(r[3]),
      room: norm(r[4]),
      intervalDays: isFinite(interval) ? interval : 0,
      lastRunDate: fmtDate_(r[6]),
      nextRunDate: fmtDate_(r[7]),
      active: norm(r[8]) === 'TRUE' || norm(r[8]) === 'true' || r[8] === true || norm(r[8]) === '1',
      note: norm(r[9]),
      creator: norm(r[10]),
      createdAt: norm(r[11]),
    });
  }
  return rows;
}

function addRecurring_(b) {
  if (!b.name) throw new Error('name required');
  if (!b.type) throw new Error('type required');
  const interval = parseInt(b.intervalDays, 10);
  if (!isFinite(interval) || interval <= 0) throw new Error('intervalDays must be positive');
  const sh = getOrCreateRecurringSheet_();
  const id = Utilities.getUuid();
  const today = new Date();
  const next = new Date(today.getTime() + interval * 24 * 60 * 60 * 1000);
  const todayStr = Utilities.formatDate(today, 'Asia/Bangkok', 'yyyy-MM-dd');
  const nextStr = Utilities.formatDate(next, 'Asia/Bangkok', 'yyyy-MM-dd');
  const createdAt = Utilities.formatDate(today, 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
  sh.appendRow([
    id, b.name, b.type, b.building || '', b.room || '', interval,
    '', // lastRunDate empty until first run
    nextStr,
    'TRUE',
    b.note || '',
    b.creator || '', createdAt,
  ]);
  logAudit_('add', 'recurring', id, b.name + ' / ' + b.type + ' / ' + interval + 'd', b.creator);
  return { appended: true, id: id, nextRunDate: nextStr };
}

function deleteRecurring_(b) {
  if (!b.id) throw new Error('id required');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.RECURRING);
  if (!sh) throw new Error('sheet "งานประจำ" not found');
  const lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error('no recurring rows');
  const found = findRowById_(sh, b.id); // r11 shared scan
  if (found < 0) throw new Error('recurring not found: ' + b.id);
  sh.deleteRow(found);
  logAudit_('delete', 'recurring', b.id, '', b.creator);
  return { deleted: true, row: found };
}

/**
 * Run the recurring check: for each active template with nextRunDate
 * <= today, create a task in งาน sheet + update template's run dates.
 *
 * Returns { created: N, skipped: M } so the UI can show progress.
 */
function runRecurringCheck_(b) {
  const recurringSh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.RECURRING);
  if (!recurringSh) return { created: 0, skipped: 0 };
  const lastRow = recurringSh.getLastRow();
  if (lastRow < 2) return { created: 0, skipped: 0 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const todayStr = Utilities.formatDate(today, 'Asia/Bangkok', 'yyyy-MM-dd');
  // Task DATE column uses ISO yyyy-MM-dd everywhere else (addTask + the
  // app's <input type="date"> writes ISO). The previous Thai dd/MM/yyyy
  // string here put recurring-generated tasks in a different date
  // format than manually-added ones in the same sheet.
  const taskDateStr = todayStr;

  const data = recurringSh.getRange(2, 1, lastRow - 1, 12).getValues();
  const taskSh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.TASK);
  if (!taskSh) throw new Error('sheet "งาน" not found');
  ensureTaskCostColumn_(taskSh);
  ensureTaskIdColumn_(taskSh); // v3.24 — recurring rows get UUIDs too
  const createdAt = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
  const user = (b && b.user) || 'recurring';

  // v3.24 (audit r9 risk #4): validate the template's target against the
  // ROOM sheet. A room deleted/renumbered after the template was made
  // used to silently spawn an orphan task every cycle — open forever,
  // driving nothing. Common-area targets (ส่วนกลาง / ส่วนกลาง:จุด) are
  // exempt: they're not rooms.
  const roomSet = (function () {
    const set = {};
    const roomSh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.ROOM);
    if (!roomSh || roomSh.getLastRow() < 2) return set;
    const headers = roomSh.getRange(1, 1, 1, roomSh.getLastColumn()).getValues()[0].map(norm);
    const cols = roomHeaderCols_(headers); // r11 shared resolver
    const iBld = cols.bld >= 0 ? cols.bld : 0;
    const iRoom = cols.room >= 0 ? cols.room : 2;
    const full = roomSh.getRange(2, 1, roomSh.getLastRow() - 1, Math.max(iBld, iRoom) + 1).getValues();
    for (let j = 0; j < full.length; j++) {
      const bld = norm(full[j][iBld]);
      const rm = norm(full[j][iRoom]);
      if (bld && rm) set[bld + '|' + rm] = true;
    }
    return set;
  })();
  const isCommonTarget = function (rm) {
    return rm === 'ส่วนกลาง' || rm.indexOf('ส่วนกลาง:') === 0;
  };

  let created = 0;
  let skipped = 0;
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const id = norm(r[0]);
    if (!id) { skipped++; continue; }
    const active = norm(r[8]) === 'TRUE' || norm(r[8]) === 'true' || r[8] === true || norm(r[8]) === '1';
    if (!active) { skipped++; continue; }
    const interval = parseInt(r[5], 10);
    if (!isFinite(interval) || interval <= 0) { skipped++; continue; }
    const nextStr = fmtDate_(r[7]);
    if (!nextStr) { skipped++; continue; }
    const nextDate = new Date(nextStr.replace(/-/g, '/'));
    if (isNaN(nextDate.getTime())) { skipped++; continue; }
    nextDate.setHours(0, 0, 0, 0);
    if (nextDate.getTime() > todayMs) { skipped++; continue; }

    // Due — create task row
    const name = norm(r[1]);
    const type = norm(r[2]);
    const building = norm(r[3]);
    const room = norm(r[4]);
    // Dedup guard — skip if a task with the same key already exists
    // (e.g. cron + manual trigger raced, or the template was bumped
    // and the task wasn't yet cleared). Otherwise repeated runs pile
    // identical rows that #178's "close all matching" can mask but
    // never untangle.
    //
    // Audit r5: STILL advance this template's dates on a dedup skip.
    // Previously the skip ran before the bump, so a template colliding
    // with another (same type+room, e.g. two ทำสะอาด templates on room
    // 101) never advanced nextRunDate — it stayed "due" and was skipped
    // on EVERY run, forever. Treat the existing task as this cycle's
    // occurrence and move on to the next cycle.
    if (findTaskRow_({ date: taskDateStr, type: type, building: building, room: room }) >= 0) {
      const dupNext = new Date(today.getTime() + interval * 24 * 60 * 60 * 1000);
      recurringSh.getRange(i + 2, 7).setValue(todayStr); // lastRunDate
      recurringSh.getRange(i + 2, 8).setValue(
        Utilities.formatDate(dupNext, 'Asia/Bangkok', 'yyyy-MM-dd')); // nextRunDate
      logAudit_('run', 'recurring', id, name + ' — task วันนี้มีอยู่แล้ว (ข้ามแต่เลื่อนรอบถัดไป)', user);
      skipped++;
      continue;
    }
    // Orphan-target guard (v3.24) — skip + advance + audit so a dead
    // template self-flags in the audit log instead of spawning forever.
    if (!isCommonTarget(room) && !roomSet[building + '|' + room]) {
      const orphanNext = new Date(today.getTime() + interval * 24 * 60 * 60 * 1000);
      recurringSh.getRange(i + 2, 7).setValue(todayStr);
      recurringSh.getRange(i + 2, 8).setValue(
        Utilities.formatDate(orphanNext, 'Asia/Bangkok', 'yyyy-MM-dd'));
      logAudit_('run', 'recurring', id, name + ' — ห้อง ' + building + ' ' + room + ' ไม่พบในชีตห้อง (ข้าม)', user);
      skipped++;
      continue;
    }
    const note = (norm(r[9]) || '') + (norm(r[9]) ? ' · ' : '') + 'จากงานประจำ: ' + name;
    // Task sheet cols: DATE, TYPE, BUILDING, ROOM, CUSTOMER, PHONE, NOTE,
    // STATUS, CREATOR, CREATED_AT, COST, ID (v3.24: UUID stamped here
    // too — recurring-created rows used to miss the id column).
    taskSh.appendRow([
      taskDateStr, type, building, room, '', '', note,
      'pending', user, createdAt, '', Utilities.getUuid(),
    ]);
    // Bump template dates
    const newNext = new Date(today.getTime() + interval * 24 * 60 * 60 * 1000);
    const newNextStr = Utilities.formatDate(newNext, 'Asia/Bangkok', 'yyyy-MM-dd');
    recurringSh.getRange(i + 2, 7).setValue(todayStr); // lastRunDate
    recurringSh.getRange(i + 2, 8).setValue(newNextStr); // nextRunDate
    logAudit_('run', 'recurring', id, name + ' → task ' + taskDateStr, user);
    created++;
  }
  return { created: created, skipped: skipped };
}

/* ========== PHASE 1: SETUP / FORMATTING / DROPDOWNS / FILTER VIEWS ========== */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  freezeAll_(ss);
  setDropdowns_(ss);
  setConditionalFormatting_(ss);
  fixDates_(ss);
  setupFilterViews_(ss);
  SpreadsheetApp.getActive().toast('Setup v3.10.0 เสร็จ ✅', 'หอพัก', 5);
}

function freezeAll_(ss) {
  [SHEET_NAMES.TASK, SHEET_NAMES.TEMPLATE, SHEET_NAMES.ROOM, SHEET_NAMES.METER].forEach(function (name) {
    const sh = ss.getSheetByName(name);
    if (sh) sh.setFrozenRows(1);
  });
}

function setDropdowns_(ss) {
  const roomSh = ss.getSheetByName(SHEET_NAMES.ROOM);
  const buildings = roomSh
    ? Array.from(new Set(roomSh.getRange(2, 1, Math.max(1, roomSh.getLastRow()-1), 1).getValues().flat().filter(Boolean)))
    : [];

  [SHEET_NAMES.TASK, SHEET_NAMES.TEMPLATE].forEach(function (name) {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    const lastRow = Math.max(sh.getMaxRows(), 1000);
    sh.getRange(2, 1, lastRow - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false)
        .setHelpText('กรอกวันที่เท่านั้น').build()
    );
    sh.getRange(2, 2, lastRow - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(TYPE_OPTIONS, true).setAllowInvalid(true).build()
    );
    if (buildings.length) {
      sh.getRange(2, 3, lastRow - 1, 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(buildings, true).setAllowInvalid(true).build()
      );
    }
    sh.getRange(2, 8, lastRow - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(STATUS_OPTIONS, true).setAllowInvalid(true).build()
    );
  });

  if (roomSh) {
    const lastRow = Math.max(roomSh.getMaxRows(), 1000);
    if (buildings.length) {
      roomSh.getRange(2, 1, lastRow - 1, 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(buildings, true).setAllowInvalid(true).build()
      );
    }
    roomSh.getRange(2, 4, lastRow - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(ROOM_STATUS, true).setAllowInvalid(true).build()
    );
    roomSh.getRange(2, 8, lastRow - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(true).build()
    );
    roomSh.getRange(2, 9, lastRow - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(true).build()
    );
  }
}

function setConditionalFormatting_(ss) {
  const taskSh = ss.getSheetByName(SHEET_NAMES.TASK);
  if (taskSh) {
    const range = taskSh.getRange('A2:H1000');
    const rules = [
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$H2="เสร็จ"')
        .setBackground('#E0E0E0').setFontColor('#666666').setRanges([range]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$H2="ยกเลิก"')
        .setBackground('#F5F5F5').setFontColor('#999999').setRanges([range]).build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=AND($A2<TODAY(), $H2<>"เสร็จ", $H2<>"ยกเลิก", $A2<>"")')
        .setBackground('#F4CCCC').setFontColor('#990000').setRanges([range]).build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=AND($A2=TODAY(), $H2<>"เสร็จ", $H2<>"ยกเลิก")')
        .setBackground('#FFF2CC').setFontColor('#7F6000').setRanges([range]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$H2="กำลังทำ"')
        .setBackground('#CFE2F3').setRanges([range]).build(),
    ];
    taskSh.setConditionalFormatRules(rules);
    taskSh.getRange('A2:A1000').setNumberFormat('yyyy-MM-dd');
  }
  const roomSh = ss.getSheetByName(SHEET_NAMES.ROOM);
  if (roomSh) {
    const range = roomSh.getRange('A2:Z1000');
    const rules = [
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$D2="ว่าง"')
        .setBackground('#D9EAD3').setRanges([range]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$D2="ซ่อม"')
        .setBackground('#FCE5CD').setRanges([range]).build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=AND(ISDATE($I2), $I2-TODAY()<=30, $I2-TODAY()>=0)')
        .setBackground('#FCE5CD').setFontColor('#B45F06').setRanges([range]).build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=AND(ISDATE($I2), $I2<TODAY())')
        .setBackground('#F4CCCC').setFontColor('#990000').setRanges([range]).build(),
    ];
    roomSh.setConditionalFormatRules(rules);
    roomSh.getRange('H2:I1000').setNumberFormat('yyyy-MM-dd');
  }
}

function fixDates_(ss) {
  [SHEET_NAMES.TASK, SHEET_NAMES.TEMPLATE].forEach(function (name) {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return;
    const range = sh.getRange(2, 1, lastRow - 1, 1);
    const values = range.getValues();
    const fixed = values.map(function (arr) {
      const v = arr[0];
      if (v instanceof Date) return [v];
      if (typeof v === 'string' && v.trim()) {
        let m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) return [new Date(+m[3], +m[2]-1, +m[1])];
        m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (m) return [new Date(+m[1], +m[2]-1, +m[3])];
      }
      return [v];
    });
    range.setValues(fixed);
    range.setNumberFormat('yyyy-MM-dd');
  });
}

function setupFilterViews_(ss) {
  try {
    const ssId = ss.getId();
    const taskSh = ss.getSheetByName(SHEET_NAMES.TASK);
    const roomSh = ss.getSheetByName(SHEET_NAMES.ROOM);
    if (!taskSh || !roomSh) return;
    const meta = Sheets.Spreadsheets.get(ssId, {ranges:[], includeGridData:false});
    const requests = [];
    (meta.sheets || []).forEach(function (s) {
      (s.filterViews || []).forEach(function (fv) {
        if (fv.title && fv.title.indexOf('🏠 ') === 0) {
          requests.push({deleteFilterView: {filterId: fv.filterViewId}});
        }
      });
    });
    const taskId = taskSh.getSheetId();
    const roomId = roomSh.getSheetId();
    requests.push(
      {addFilterView:{filter:{title:'🏠 งานวันนี้',
        range:{sheetId:taskId, startRowIndex:0, startColumnIndex:0, endColumnIndex:10},
        criteria:{0:{condition:{type:'DATE_EQ', values:[{userEnteredValue:'=TODAY()'}]}}}}}},
      {addFilterView:{filter:{title:'🏠 เกินกำหนด',
        range:{sheetId:taskId, startRowIndex:0, startColumnIndex:0, endColumnIndex:10},
        criteria:{
          0:{condition:{type:'DATE_BEFORE', values:[{userEnteredValue:'=TODAY()'}]}},
          7:{condition:{type:'TEXT_NOT_CONTAINS', values:[{userEnteredValue:'เสร็จ'}]}}
        }}}},
      {addFilterView:{filter:{title:'🏠 ห้องว่าง',
        range:{sheetId:roomId, startRowIndex:0, startColumnIndex:0, endColumnIndex:14},
        criteria:{3:{condition:{type:'TEXT_EQ', values:[{userEnteredValue:'ว่าง'}]}}}}}},
      {addFilterView:{filter:{title:'🏠 สัญญาใกล้หมด',
        range:{sheetId:roomId, startRowIndex:0, startColumnIndex:0, endColumnIndex:14},
        criteria:{8:{condition:{type:'DATE_BEFORE', values:[{userEnteredValue:'=TODAY()+30'}]}}}}}}
    );
    Sheets.Spreadsheets.batchUpdate({requests:requests}, ssId);
  } catch (e) {
    SpreadsheetApp.getActive().toast('Filter views ข้าม: ' + e.message, 'หอพัก', 8);
  }
}

/* ========== ON-EDIT TRIGGER ========== */
function onEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (sh.getName() !== SHEET_NAMES.TASK) return;
  if (e.range.getColumn() !== TASK_COL.STATUS) return;
  if (e.value !== 'เสร็จ') return;
  const row = e.range.getRow();
  const taskRow = sh.getRange(row, 1, 1, 8).getValues()[0];
  const type = taskRow[1];
  const building = taskRow[2];
  const roomNum = taskRow[3];
  if (!building || !roomNum) return;
  const roomSh = e.source.getSheetByName(SHEET_NAMES.ROOM);
  if (!roomSh) return;
  // Resolve columns BY HEADER like getRooms_/updateRoomStatus_ do —
  // this block used to hardcode building=1/room=3/status=4, so a
  // reordered room sheet made it read the wrong cells and write status
  // into the wrong column (silent data corruption).
  const lastRoomRow = roomSh.getLastRow();
  if (lastRoomRow < 2) return;
  const roomData = roomSh.getRange(1, 1, lastRoomRow, roomSh.getLastColumn()).getValues();
  const headers = roomData[0].map(norm);
  const cols = roomHeaderCols_(headers); // r11 shared resolver
  const iBld = cols.bld, iRoom = cols.room, iStatus = cols.status,
        iTenant = cols.tenant, iPhone = cols.phone, iCntr = cols.cntr;
  if (iBld < 0 || iRoom < 0 || iStatus < 0) return;
  for (let i = 1; i < roomData.length; i++) {
    if (norm(roomData[i][iBld]) === norm(building) && norm(roomData[i][iRoom]) === norm(roomNum)) {
      const newStatus = (type === 'ย้ายออก') ? 'ว่าง' : (type === 'ย้ายเข้า') ? 'มีผู้เช่า' : null;
      if (newStatus) {
        roomSh.getRange(i + 1, iStatus + 1).setValue(newStatus);
        // ย้ายออก → ว่าง must ALSO blank the old tenant identity, same
        // as the app's releaseRoom template — otherwise the "available"
        // room keeps showing the previous tenant's name/phone/contract.
        if (type === 'ย้ายออก') {
          if (iTenant >= 0) roomSh.getRange(i + 1, iTenant + 1).setValue('');
          if (iPhone  >= 0) roomSh.getRange(i + 1, iPhone + 1).setValue('');
          if (iCntr   >= 0) roomSh.getRange(i + 1, iCntr + 1).setValue('');
        }
        clearTasksCache_();
        clearRoomsCache_();
        SpreadsheetApp.getActive().toast('ห้อง ' + building + ' ' + roomNum + ' → ' + newStatus, 'หอพัก', 5);
      }
      break;
    }
  }
}

/* ========== CUSTOM MENU ========== */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🏠 หอพัก')
    .addItem('▶ ตั้งค่าทุกอย่าง (รันครั้งเดียว)', 'setup')
    .addSeparator()
    .addItem('✅ ปิดงานวันนี้ที่เลือก', 'markSelectedDone')
    .addItem('📋 คัดลอก template เป็นงานวันนี้', 'copyTemplateToToday')
    .addSeparator()
    .addItem('🔧 แปลงวันที่เก่าให้เป็น date', 'fixDatesNow')
    .addToUi();
}

function fixDatesNow() {
  fixDates_(SpreadsheetApp.getActiveSpreadsheet());
  SpreadsheetApp.getActive().toast('แปลงวันที่เสร็จ ✅', 'หอพัก', 5);
}

function markSelectedDone() {
  const sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== SHEET_NAMES.TASK) {
    SpreadsheetApp.getUi().alert('ใช้ได้เฉพาะแท็บ "งาน" เท่านั้น');
    return;
  }
  const sel = sh.getActiveRange();
  const startRow = sel.getRow();
  const numRows = sel.getNumRows();
  if (startRow < 2) return;
  sh.getRange(startRow, TASK_COL.STATUS, numRows, 1).setValue('เสร็จ');
}

function copyTemplateToToday() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tpl = ss.getSheetByName(SHEET_NAMES.TEMPLATE);
  const task = ss.getSheetByName(SHEET_NAMES.TASK);
  if (!tpl || !task) return;
  const data = tpl.getRange(2, 1, tpl.getLastRow()-1, 8).getValues()
    .filter(function (r) { return r.some(function (c) { return c !== ''; }); });
  if (!data.length) {
    SpreadsheetApp.getUi().alert('template_งาน ว่างเปล่า');
    return;
  }
  const today = new Date();
  data.forEach(function (r) { r[0] = today; });
  task.getRange(task.getLastRow()+1, 1, data.length, 8).setValues(data);
  SpreadsheetApp.getActive().toast('คัดลอก ' + data.length + ' รายการแล้ว ✅', 'หอพัก', 5);
}

/* ========== DAILY BACKUP (v3.19.0) ==========
 * The whole business lives in this one spreadsheet and there was no
 * backup at all — a bad bulk edit, broken formula, or accidental sheet
 * delete meant permanent data loss. A nightly time-driven trigger calls
 * dailyBackup(): full-file copy into a Drive folder, keep 30 days,
 * trash older copies (Drive trash keeps them another 30 as a bonus).
 *
 * Setup (once): run dailyBackup manually from the editor to grant the
 * Drive permission, then add a time-driven trigger (see README).
 * Restore: open the dated copy in aptdashboard-backups, copy the rows
 * (or whole sheet tabs) back into the live spreadsheet.
 */
var BACKUP_FOLDER_NAME = 'aptdashboard-backups';
var BACKUP_RETENTION_DAYS = 30;

function dailyBackup() {
  const ss = SpreadsheetApp.getActive();
  const folder = getOrCreateBackupFolder_();
  const stamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
  const name = 'backup-' + stamp + ' — ' + ss.getName();
  // Idempotent: trigger retries / a manual run the same day won't pile
  // up duplicate copies.
  if (folder.getFilesByName(name).hasNext()) return;
  DriveApp.getFileById(ss.getId()).makeCopy(name, folder);
  cleanupOldBackups_(folder);
}

function getOrCreateBackupFolder_() {
  // Pin the folder by ID in Script Properties instead of resolving by
  // name each run: getFoldersByName spans ALL of Drive including folders
  // OTHER accounts shared with us — a shared folder named
  // "aptdashboard-backups" would silently receive full-PII spreadsheet
  // copies. An ID minted by createFolder is ours for good.
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('BACKUP_FOLDER_ID');
  if (savedId) {
    try {
      const f = DriveApp.getFolderById(savedId);
      if (!f.isTrashed()) return f;
    } catch (e) { /* deleted or inaccessible — recreate below */ }
  }
  const folder = DriveApp.createFolder(BACKUP_FOLDER_NAME);
  props.setProperty('BACKUP_FOLDER_ID', folder.getId());
  return folder;
}

function cleanupOldBackups_(folder) {
  const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    // Only touch files this job created (backup-YYYY-MM-DD prefix) so a
    // stray manual file in the folder is never deleted.
    if (f.getName().indexOf('backup-') === 0 && f.getDateCreated().getTime() < cutoff) {
      f.setTrashed(true); // trash, not hard delete — extra 30-day net
    }
  }
}
