/**
 * Code.gs v3.4.0 — Dashboard หอพัก
 * รวม: Phase 1 setup/UI + Web App backend สำหรับ Vercel
 * NEW v3.4.0:
 *   - CacheService 60s TTL สำหรับ getTasks (10x faster repeat reads)
 *   - column I=ผู้สร้าง, J=วันที่สร้าง บันทึกผู้กรอกงาน
 */

const SHEET_NAMES = {
  TASK: 'งาน',
  TEMPLATE: 'template_งาน',
  ROOM: 'ห้อง',
  METER: 'มิเตอร์',
};

const TYPE_OPTIONS   = ['ย้ายเข้า', 'ย้ายออก', 'ทำสะอาด', 'ชมห้อง', 'ซ่อม', 'อื่นๆ'];
const STATUS_OPTIONS = ['ว่าง', 'pending', 'กำลังทำ', 'เสร็จ', 'ยกเลิก'];
const ROOM_STATUS    = ['ว่าง', 'มีผู้เช่า', 'จอง', 'ซ่อม'];

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
      case 'addTask':          return ok_(addTask_(body));
      case 'updateTask':       return ok_(updateTask_(body));
      case 'updateTaskStatus': return ok_(updateTaskStatus_(body));
      case 'deleteTask':       return ok_(deleteTask_(body));
      case 'updateRoomStatus': return ok_(updateRoomStatus_(body));
      case 'debugFindTask':    return ok_({ row: findTaskRow_(body) });
      default: throw new Error('unknown action: ' + body.action);
    }
  } catch (err) {
    return err_(err && err.message ? err.message : err);
  }
}

function doGet() {
  return jsonOut_({ ok: true, message: 'aptdashboard backend alive', version: '3.4.0' });
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
    b.status || 'ว่าง',
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
      return { updated: true, row: i+1 };
    }
  }
  throw new Error('room not found: ' + b.building + ' ' + b.room);
}

/* ========== PHASE 1: SETUP / FORMATTING / DROPDOWNS / FILTER VIEWS ========== */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  freezeAll_(ss);
  setDropdowns_(ss);
  setConditionalFormatting_(ss);
  fixDates_(ss);
  setupFilterViews_(ss);
  SpreadsheetApp.getActive().toast('Setup v3.4 เสร็จ ✅', 'หอพัก', 5);
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
