# SETUP — ApartCloud Dashboard

คู่มือตั้งค่าระบบให้พร้อมใช้งาน — ต่อข้อมูลจริงจาก Google Sheet และรองรับการแก้สถานะห้องผ่าน web app

---

## 1) โครงสร้าง Google Sheet

สร้าง Spreadsheet 1 ไฟล์ มี 2 ชีต:

### ชีต `ห้อง` (rooms master)
คอลัมน์ (แถวแรก):

| ตึก | ห้อง | ชั้น | ราคา/เดือน | สถานะ | ผู้เช่าปัจจุบัน | เบอร์ | วันสัญญาหมด |

ค่าสถานะที่รองรับ: `มีคนอยู่` / `ว่าง` / `ปรับปรุง` / `รอสัญญา` / `แจ้งย้ายออก`

ดูตัวอย่างที่ `template_ห้อง.csv` ใน root ของ repo

### ชีต `งาน` (tasks)
คอลัมน์:

| วันที่ | ประเภท | ตึก | ห้อง | ลูกค้า | เบอร์ | หมายเหตุ | สถานะ |

- `วันที่` รูปแบบ `dd/MM/yyyy`
- `ประเภท`: ทำสะอาด / ย้ายเข้า / ย้ายออก / ชมห้อง
- `สถานะ`: `ว่าง` (ยังไม่เสร็จ) / `เสร็จ`

---

## 2) Publish Sheet เป็น CSV

ที่แต่ละชีตให้ทำ:
1. ไฟล์ > แชร์ไปยังเว็บ > Publish to web
2. เลือกชีตที่ต้องการ และ format = ค่าที่คั่นด้วยจุลภาค (CSV)
3. Copy ลิงก์ (.../pub?gid=...&single=true&output=csv)

---

## 3) ตั้งค่า ENV บน Vercel

ไปที่ Vercel Project > Settings > Environment Variables:

| ชื่อ | ค่า |
|---|---|
| `NEXT_PUBLIC_SHEET_CSV_URL` | URL CSV ของชีต "งาน" |
| `NEXT_PUBLIC_SHEET_ROOMS_CSV_URL` | URL CSV ของชีต "ห้อง" |
| `SHEET_WRITE_URL` | URL ของ Apps Script Web App (ดูขั้น 4) |

โปรด redeploy 1 รอบหลังตั้งค่า

---

## 4) Google Apps Script — Web App สำหรับเขียนกลับชีต

เปิด Sheet > Extensions > Apps Script แล้ววางโค้ดต่อไปนี้:

\`\`\`javascript
const ROOM_SHEET = 'ห้อง';
const TASK_SHEET = 'งาน';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (!body || !body.action) throw new Error('missing action');

    if (body.action === 'updateRoomStatus') {
      return ok(updateRoomStatus(body));
    }
    if (body.action === 'addTask') {
      return ok(addTask(body));
    }
    throw new Error('unknown action');
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function ok(payload) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, ...payload }))
    .setMimeType(ContentService.MimeType.JSON);
}

function updateRoomStatus({ building, room, status, tenant, phone, contractEnd, note }) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(ROOM_SHEET);
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const idxBuilding = headers.indexOf('ตึก');
  const idxRoom = headers.indexOf('ห้อง');
  const idxStatus = headers.indexOf('สถานะ');
  const idxTenant = headers.indexOf('ผู้เช่าปัจจุบัน');
  const idxPhone = headers.indexOf('เบอร์');
  const idxContract = headers.indexOf('วันสัญญาหมด');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idxBuilding]).trim() === String(building).trim()
     && String(data[i][idxRoom]).trim() === String(room).trim()) {
      if (status !== undefined) sh.getRange(i+1, idxStatus+1).setValue(status);
      if (tenant !== undefined) sh.getRange(i+1, idxTenant+1).setValue(tenant);
      if (phone !== undefined) sh.getRange(i+1, idxPhone+1).setValue(phone);
      if (contractEnd !== undefined) sh.getRange(i+1, idxContract+1).setValue(contractEnd);
      return { row: i+1 };
    }
  }
  throw new Error('room not found: ' + building + ' ' + room);
}

function addTask({ date, type, building, room, customer, phone, note, status }) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(TASK_SHEET);
  sh.appendRow([date, type, building, room, customer || '', phone || '', note || '', status || 'ว่าง']);
  return { appended: true };
}
\`\`\`

จากนั้น:
1. Deploy > New deployment > Type = **Web app**
2. Execute as: **Me**
3. Who has access: **Anyone**
4. Copy URL (ขึ้นต้นด้วย https://script.google.com/macros/s/.../exec)
5. เอา URL ไปใส่ Vercel ENV `SHEET_WRITE_URL`

---

## 5) ข้อจำกัด และขั้นถัดไป

- ยังไม่มี auth — แอปเปลี่ยนสถานะได้ไม่ระบุตัวตน (Phase 3)
- ไม่มี history ของการเปลี่ยนแปลง
- แคช 60 วินาที — กดปุ่ม ⏳ บนนาวเพื่อฟอร์ซรีเฟรช
- Phase 2: writeback fully wired • Phase 3: NextAuth + audit • Phase 4: PWA + offline
