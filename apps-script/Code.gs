/**
 * Code.gs v3.11.0 — Dashboard หอพัก
 * รวม: Phase 1 setup/UI + Web App backend สำหรับ Vercel
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
 */

const SHEET_NAMES = {
  TASK: 'งาน',
  TEMPLATE: 'template_งาน',
  ROOM: 'ห้อง',
  METER: 'มิเตอร์',
  EQUIPMENT: 'อุปกรณ์',
  FACILITY: 'สาธารณูปโภค',
  PART: 'อะไหล่', // v3.11.0 — inventory (Task 37)
};

const TYPE_OPTIONS   = ['ย้ายเข้า', 'ย้ายออก', 'ทำสะอาด', 'ชมห้อง', 'ซ่อม', 'อื่นๆ'];
const STATUS_OPTIONS = ['ว่าง', 'pending', 'กำลังทำ', 'เสร็จ', 'ยกเลิก'];
const ROOM_STATUS    = ['ว่าง', 'มีผู้เช่า', 'จอง', 'ซ่อม'];
const EQUIPMENT_TYPES  = ['แอร์', 'เครื่องซักผ้า', 'ตู้เย็น', 'เครื่องทำน้ำอุ่น', 'โทรทัศน์', 'ไมโครเวฟ', 'อื่นๆ'];
const EQUIPMENT_STATUS = ['ปกติ', 'ต้องซ่อม', 'กำลังซ่อม', 'ใช้ไม่ได้'];
const FACILITY_TYPES   = ['ลิฟต์', 'สระว่ายน้ำ', 'เครื่องปั่นไฟ', 'ปั๊มน้ำ', 'WiFi', 'CCTV', 'อื่นๆ'];
const FACILITY_STATUS  = ['ใช้งานได้', 'ต้องซ่อม', 'กำลังซ่อม', 'ปิดใช้งาน'];

// v3.11.0 — Inventory categories (Task 37). "อื่นๆ" fallback ensures
// any free-text new category still passes the dropdown.
const PART_CATEGORIES  = ['ประปา', 'ไฟฟ้า', 'แอร์', 'ของใช้ในห้องน้ำ', 'ทั่วไป', 'อื่นๆ'];

// คอลัมน์ของ tab "งาน" (1-based)
const TASK_COL = {
  DATE: 1, TYPE: 2, BUILDING: 3, ROOM: 4,
  CUSTOMER: 5, PHONE: 6, NOTE: 7, STATUS: 8,
  CREATOR: 9, CREATED_AT: 10,
  COST: 11, // v3.10.0
};

/* ========== CACHE (NEW v3.4.0) ========== */
const TASKS_CACHE_KEY = 'tasksCache_v1';
const TASKS_CACHE_TTL_SEC = 180; // 3 นาที — v3.11.0: ขยายจาก 60s ลด cold-start hits

function getTasksCached_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(TASKS_CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* cache เสีย — fall through */ }
  }
  const fresh = getTasks_();
  try {
    cache.put(TASKS_CACHE_KEY, JSON.stringify(fresh), TASKS_CACHE_TTL_SEC);
  } catch (e) {
    // payload > 100KB — ไม่ cache แต่ยังคืนค่า
  }
  return fresh;
}

function clearTasksCache_() {
  try { CacheService.getScriptCache().remove(TASKS_CACHE_KEY); } catch (e) {}
}

/* ========== ROOMS CACHE (NEW v3.4.3) ========== */
const ROOMS_CACHE_KEY = 'roomsCache_v1';
const ROOMS_CACHE_TTL_SEC = 60;

function getRoomsCached_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(ROOMS_CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* fall through */ }
  }
  const fresh = getRooms_();
  try {
    cache.put(ROOMS_CACHE_KEY, JSON.stringify(fresh), ROOMS_CACHE_TTL_SEC);
  } catch (e) {}
  return fresh;
}

function clearRoomsCache_() {
  try { CacheService.getScriptCache().remove(ROOMS_CACHE_KEY); } catch (e) {}
}

/* ========== EQUIPMENT CACHE (NEW v3.6.0) ========== */
const EQUIPMENT_CACHE_KEY = 'equipmentCache_v2';
// 3 นาที — v3.11.0 ขยายจาก 60s. Vercel ฝั่งใหม่ serve stale-on-error อยู่
// แล้ว และ writes (addEquipment/updateEquipment) เรียก clearEquipmentCache_
// ทันที จึงไม่มีปัญหา consistency
const EQUIPMENT_CACHE_TTL_SEC = 180;

function getAllEquipmentCached_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(EQUIPMENT_CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* fall through */ }
  }
  const fresh = getAllEquipment_();
  try {
    cache.put(EQUIPMENT_CACHE_KEY, JSON.stringify(fresh), EQUIPMENT_CACHE_TTL_SEC);
  } catch (e) {}
  return fresh;
}

function clearEquipmentCache_() {
  try { CacheService.getScriptCache().remove(EQUIPMENT_CACHE_KEY); } catch (e) {}
}

/* ========== FACILITY CACHE (NEW v3.8.0) ========== */
const FACILITY_CACHE_KEY = 'facilityCache_v1';
const FACILITY_CACHE_TTL_SEC = 60;

function getAllFacilitiesCached_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(FACILITY_CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* fall through */ }
  }
  const fresh = getAllFacilities_();
  try {
    cache.put(FACILITY_CACHE_KEY, JSON.stringify(fresh), FACILITY_CACHE_TTL_SEC);
  } catch (e) {}
  return fresh;
}

function clearFacilityCache_() {
  try { CacheService.getScriptCache().remove(FACILITY_CACHE_KEY); } catch (e) {}
}

/* ========== PART (INVENTORY) CACHE (NEW v3.11.0) ========== */
const PART_CACHE_KEY = 'partCache_v1';
const PART_CACHE_TTL_SEC = 60;

function getAllPartsCached_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(PART_CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* fall through */ }
  }
  const fresh = getAllParts_();
  try {
    cache.put(PART_CACHE_KEY, JSON.stringify(fresh), PART_CACHE_TTL_SEC);
  } catch (e) {}
  return fresh;
}

function clearPartCache_() {
  try { CacheService.getScriptCache().remove(PART_CACHE_KEY); } catch (e) {}
}

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

/* ========== WEB APP ENTRY ========== */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('no body');
    const body = JSON.parse(e.postData.contents);
    if (!body || !body.action) throw new Error('missing action');

    switch (body.action) {
      // ----- reads (no lock) -----
      case 'getTasks':         return ok_({ result: { rows: getTasksCached_() } });
      case 'getRooms':         return ok_({ result: { rows: getRoomsCached_() } });
      case 'getRoomEquipment': return ok_({ result: { rows: getRoomEquipment_(body.building, body.room) } });
      case 'getAllEquipment':  return ok_({ result: { rows: getAllEquipmentCached_() } });
      case 'getFacilities':    return ok_({ result: { rows: getAllFacilitiesCached_() } });
      case 'debugFindTask':    return ok_({ row: findTaskRow_(body) });
      // ----- writes (ScriptLock 5s timeout) -----
      case 'addTask':          return ok_(withWriteLock_(function () { return addTask_(body); }));
      case 'updateTask':       return ok_(withWriteLock_(function () { return updateTask_(body); }));
      case 'updateTaskStatus': return ok_(withWriteLock_(function () { return updateTaskStatus_(body); }));
      case 'deleteTask':       return ok_(withWriteLock_(function () { return deleteTask_(body); }));
      case 'updateRoomStatus': return ok_(withWriteLock_(function () { return updateRoomStatus_(body); }));
      case 'addEquipment':     return ok_(withWriteLock_(function () { return addEquipment_(body); }));
      case 'updateEquipment':  return ok_(withWriteLock_(function () { return updateEquipment_(body); }));
      case 'addFacility':      return ok_(withWriteLock_(function () { return addFacility_(body); }));
      case 'updateFacility':   return ok_(withWriteLock_(function () { return updateFacility_(body); }));
      // v3.11.0 — Parts/Inventory (Task 37)
      case 'getParts':         return ok_({ result: { rows: getAllPartsCached_() } });
      case 'addPart':          return ok_(withWriteLock_(function () { return addPart_(body); }));
      case 'updatePart':       return ok_(withWriteLock_(function () { return updatePart_(body); }));
      case 'adjustStockPart':  return ok_(withWriteLock_(function () { return adjustStockPart_(body); }));
      default: throw new Error('unknown action: ' + body.action);
    }
  } catch (err) {
    return err_(err && err.message ? err.message : err);
  }
}

function doGet() {
  return jsonOut_({ ok: true, message: 'aptdashboard backend alive', version: '3.10.0' });
}

/* ========== TASK READ ========== */
function getTasks_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.TASK);
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  // v3.10.0: read up to col K (11). Use lastCol to stay backward-compat
  // when the sheet hasn't been expanded yet (existing rows < 11 cols).
  const lastCol = Math.max(sh.getLastColumn(), 10);
  const cols = Math.min(lastCol, 11);
  const values = sh.getRange(2, 1, lastRow - 1, cols).getValues();
  return values
    .map(function (r) {
      const costRaw = cols >= 11 ? r[10] : '';
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
      };
    })
    .filter(function (r) { return r.date && r.type && r.building; });
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

/* ========== ROOMS READ (NEW v3.4.3) ========== */
/**
 * Read the ห้อง sheet and return RoomRow[] for the dashboard.
 * Maps Thai column headers to English keys (matches lib/parseSheet
 * ROOM_HEADER_ALIASES). Tolerates schema variations (header order,
 * column-name aliases). Empty rows are dropped.
 */
function getRooms_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.ROOM);
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(norm);

  // Multi-alias resolver — first match wins
  function findIdx(aliases) {
    for (var i = 0; i < aliases.length; i++) {
      var idx = headers.indexOf(aliases[i]);
      if (idx >= 0) return idx;
    }
    return -1;
  }
  var iBld    = findIdx(['ตึก', 'อาคาร']);
  var iRoom   = findIdx(['ห้อง', 'เลขห้อง']);
  var iFloor  = findIdx(['ชั้น']);
  var iStatus = findIdx(['สถานะ']);
  var iTenant = findIdx(['ผู้เช่า', 'ผู้เช่าปัจจุบัน', 'ชื่อผู้เช่า']);
  var iPhone  = findIdx(['เบอร์', 'เบอร์ติดต่อ', 'เบอร์โทร']);
  var iCntr   = findIdx(['สัญญา', 'วันสัญญาหมด', 'สัญญาหมด', 'วันหมดสัญญา']);
  var iPrice  = findIdx(['ค่าเช่า', 'ราคา/เดือน', 'ราคา', 'ค่าเช่ารายเดือน']);

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
    });
  }
  return rows;
}

/* ========== TASK FIND (composite key) ========== */
function findTaskRow_(q) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.TASK);
  if (!sh) throw new Error('sheet "งาน" not found');
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  const data = sh.getRange(2, 1, lastRow - 1, 8).getValues();
  const qDate = norm(q.date);
  const qType = norm(q.type);
  const qBld  = norm(q.building);
  const qRoom = norm(q.room);
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (
      fmtDate_(r[0]) === qDate &&
      norm(r[1]) === qType &&
      norm(r[2]) === qBld &&
      norm(r[3]) === qRoom
    ) {
      return i + 2; // 1-based row
    }
  }
  return -1;
}

/* ========== TASK MUTATE ========== */
function addTask_(b) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.TASK);
  if (!sh) throw new Error('sheet "งาน" not found');
  ensureTaskCostColumn_(sh); // v3.10.0
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
    Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm'),
    isFinite(costNum) && costNum > 0 ? costNum : '',
  ];
  sh.appendRow(row);
  clearTasksCache_();
  return { appended: true, row: sh.getLastRow() };
}

function updateTask_(b) {
  const row = findTaskRow_({
    date: b.matchDate || b.date,
    type: b.matchType || b.type,
    building: b.matchBuilding || b.building,
    room: b.matchRoom || b.room,
  });
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
  const row = findTaskRow_(b);
  if (row < 0) throw new Error('task not found');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.TASK);
  sh.getRange(row, TASK_COL.STATUS).setValue(b.status || 'เสร็จ');
  clearTasksCache_();
  return { updated: true, row: row };
}

function deleteTask_(b) {
  const row = findTaskRow_(b);
  if (row < 0) throw new Error('task not found');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.TASK);
  sh.deleteRow(row);
  clearTasksCache_();
  return { deleted: true, row: row };
}

/* ========== ROOM MUTATE ========== */
function updateRoomStatus_(b) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.ROOM);
  if (!sh) throw new Error('sheet "ห้อง" not found');
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(norm);
  const idxBld    = headers.indexOf('ตึก');
  const idxRoom   = headers.indexOf('ห้อง');
  const idxStatus = headers.indexOf('สถานะ');
  const idxTenant = headers.indexOf('ผู้เช่า');
  const idxPhone  = headers.indexOf('เบอร์');
  const idxCntr   = headers.indexOf('สัญญา');
  if (idxBld < 0 || idxRoom < 0 || idxStatus < 0) throw new Error('headers missing on ห้อง');
  for (let i = 1; i < data.length; i++) {
    if (norm(data[i][idxBld]) === norm(b.building) && norm(data[i][idxRoom]) === norm(b.room)) {
      if (b.status      !== undefined) sh.getRange(i+1, idxStatus+1).setValue(b.status);
      if (b.tenant      !== undefined && idxTenant >= 0) sh.getRange(i+1, idxTenant+1).setValue(b.tenant);
      if (b.phone       !== undefined && idxPhone  >= 0) sh.getRange(i+1, idxPhone+1).setValue(b.phone);
      if (b.contractEnd !== undefined && idxCntr   >= 0) sh.getRange(i+1, idxCntr+1).setValue(b.contractEnd);
      clearRoomsCache_();
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
  const ids = sh.getRange(2, 1, lastRow - 1, 1).getValues();
  let found = -1;
  for (let i = 0; i < ids.length; i++) {
    if (norm(ids[i][0]) === norm(b.id)) { found = i + 2; break; }
  }
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
  const ids = sh.getRange(2, 1, lastRow - 1, 1).getValues();
  let found = -1;
  for (let i = 0; i < ids.length; i++) {
    if (norm(ids[i][0]) === norm(b.id)) { found = i + 2; break; }
  }
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

function getAllParts_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.PART);
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const data = sh.getRange(2, 1, lastRow - 1, 10).getValues();
  const rows = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const name = norm(r[1]);
    if (!name) continue;
    const stockNum = parseFloat(r[3]);
    const threshNum = parseFloat(r[4]);
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
  const id = Utilities.getUuid();
  const now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
  const stockNum = parseFloat(b.stock);
  const threshNum = parseFloat(b.threshold);
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
  const ids = sh.getRange(2, 1, lastRow - 1, 1).getValues();
  let found = -1;
  for (let i = 0; i < ids.length; i++) {
    if (norm(ids[i][0]) === norm(b.id)) { found = i + 2; break; }
  }
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
  const ids = sh.getRange(2, 1, lastRow - 1, 1).getValues();
  let found = -1;
  for (let i = 0; i < ids.length; i++) {
    if (norm(ids[i][0]) === norm(b.id)) { found = i + 2; break; }
  }
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
  const data = roomSh.getRange(2, 1, roomSh.getLastRow()-1, 4).getValues();
  for (let i = 0; i < data.length; i++) {
    if (norm(data[i][0]) === norm(building) && norm(data[i][2]) === norm(roomNum)) {
      const newStatus = (type === 'ย้ายออก') ? 'ว่าง' : (type === 'ย้ายเข้า') ? 'มีผู้เช่า' : null;
      if (newStatus) {
        roomSh.getRange(i+2, 4).setValue(newStatus);
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
