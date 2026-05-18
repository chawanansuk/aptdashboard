/**
 * Code.gs v3.7.0 — Dashboard หอพัก
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
 */

const SHEET_NAMES = {
  TASK: 'งาน',
  TEMPLATE: 'template_งาน',
  ROOM: 'ห้อง',
  METER: 'มิเตอร์',
  EQUIPMENT: 'อุปกรณ์',
};

const TYPE_OPTIONS   = ['ย้ายเข้า', 'ย้ายออก', 'ทำสะอาด', 'ชมห้อง', 'ซ่อม', 'อื่นๆ'];
const STATUS_OPTIONS = ['ว่าง', 'pending', 'กำลังทำ', 'เสร็จ', 'ยกเลิก'];
const ROOM_STATUS    = ['ว่าง', 'มีผู้เช่า', 'จอง', 'ซ่อม'];
const EQUIPMENT_TYPES  = ['แอร์', 'เครื่องซักผ้า', 'ตู้เย็น', 'เครื่องทำน้ำอุ่น', 'โทรทัศน์', 'ไมโครเวฟ', 'อื่นๆ'];
const EQUIPMENT_STATUS = ['ปกติ', 'ต้องซ่อม', 'กำลังซ่อม', 'ใช้ไม่ได้'];

// คอลัมน์ของ tab "งาน" (1-based)
const TASK_COL = {
  DATE: 1, TYPE: 2, BUILDING: 3, ROOM: 4,
  CUSTOMER: 5, PHONE: 6, NOTE: 7, STATUS: 8,
  CREATOR: 9, CREATED_AT: 10,
};

/* ========== CACHE (NEW v3.4.0) ========== */
const TASKS_CACHE_KEY = 'tasksCache_v1';
const TASKS_CACHE_TTL_SEC = 60; // 60 วินาที — ปรับได้

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
const EQUIPMENT_CACHE_TTL_SEC = 60;

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

/* ========== WEB APP ENTRY ========== */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('no body');
    const body = JSON.parse(e.postData.contents);
    if (!body || !body.action) throw new Error('missing action');

    switch (body.action) {
      case 'getTasks':         return ok_({ result: { rows: getTasksCached_() } });
      case 'getRooms':         return ok_({ result: { rows: getRoomsCached_() } });
      case 'getRoomEquipment': return ok_({ result: { rows: getRoomEquipment_(body.building, body.room) } });
      case 'getAllEquipment':  return ok_({ result: { rows: getAllEquipmentCached_() } });
      case 'addTask':          return ok_(addTask_(body));
      case 'updateTask':       return ok_(updateTask_(body));
      case 'updateTaskStatus': return ok_(updateTaskStatus_(body));
      case 'deleteTask':       return ok_(deleteTask_(body));
      case 'updateRoomStatus': return ok_(updateRoomStatus_(body));
      case 'addEquipment':     return ok_(addEquipment_(body));
      case 'updateEquipment':  return ok_(updateEquipment_(body));
      case 'debugFindTask':    return ok_({ row: findTaskRow_(body) });
      default: throw new Error('unknown action: ' + body.action);
    }
  } catch (err) {
    return err_(err && err.message ? err.message : err);
  }
}

function doGet() {
  return jsonOut_({ ok: true, message: 'aptdashboard backend alive', version: '3.7.0' });
}

/* ========== TASK READ ========== */
function getTasks_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.TASK);
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const values = sh.getRange(2, 1, lastRow - 1, 10).getValues();
  return values
    .map(function (r) {
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
      };
    })
    .filter(function (r) { return r.date && r.type && r.building; });
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

/* ========== PHASE 1: SETUP / FORMATTING / DROPDOWNS / FILTER VIEWS ========== */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  freezeAll_(ss);
  setDropdowns_(ss);
  setConditionalFormatting_(ss);
  fixDates_(ss);
  setupFilterViews_(ss);
  SpreadsheetApp.getActive().toast('Setup v3.7.0 เสร็จ ✅', 'หอพัก', 5);
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
