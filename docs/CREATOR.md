# Creator field — บันทึกผู้กรอกงานในชีต `งาน`

Frontend ส่ง `creator` (ชื่อจาก localStorage) ไปกับทุก write action แล้ว
หากไม่อัปเดต Apps Script แอปยังทำงานปกติ (Apps Script จะ ignore field ที่ไม่รู้จัก) แค่ sheet จะไม่บันทึกชื่อ

## ขั้นตอนเปิดใช้งานบันทึกใน sheet

### 1) เพิ่ม column ในชีต `งาน`

ปัจจุบันมี 8 column (A..H): `วันที่ | ประเภท | ตึก | ห้อง | ลูกค้า | เบอร์ | หมายเหตุ | สถานะ`

เพิ่ม 2 column ต่อท้าย:
- **I**: `ผู้สร้าง`
- **J**: `วันที่สร้าง`

### 2) แก้ Apps Script `Code.gs` (v3.2.1 ที่ใช้อยู่)

หา function `addTask_` แล้วเพิ่ม 2 ค่าต่อท้าย row ที่ append:

```js
function addTask_(p) {
  var sh = getSheet_('งาน');
  var row = [
    p.date || '',
    p.type || '',
    p.building || '',
    p.room || '',
    p.customer || '',
    p.phone || '',
    p.note || '',
    p.status || '',
    p.creator || '',                            // I: ผู้สร้าง
    Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm') // J: วันที่สร้าง
  ];
  sh.appendRow(row);
  return { ok: true };
}
```

หา function `getTasks_` แล้วเพิ่ม `creator` + `createdAt` ใน object ที่ส่งกลับ:

```js
function getTasks_() {
  var sh = getSheet_('งาน');
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return { ok: true, result: { rows: [] } };
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (!r[0] && !r[2] && !r[3]) continue; // skip empty
    rows.push({
      date: String(r[0] || ''),
      type: String(r[1] || ''),
      building: String(r[2] || ''),
      room: String(r[3] || ''),
      customer: String(r[4] || ''),
      phone: String(r[5] || ''),
      note: String(r[6] || ''),
      status: String(r[7] || ''),
      creator: String(r[8] || ''),
      createdAt: String(r[9] || ''),
    });
  }
  return { ok: true, result: { rows: rows } };
}
```

(ปรับให้เข้ากับโครงเดิมของ Code.gs ที่ใช้อยู่ — แค่เพิ่ม 2 field ใน array/object เท่านั้น)

### 3) Deploy ใหม่

Apps Script editor → **Deploy** → **Manage deployments** → แก้ Web app deployment → **New version** → Deploy

URL `SHEET_WRITE_URL` คงเดิม (เป็น Web app URL ของ deployment ที่อยู่)

### 4) ทดสอบ

- เปิดแอป → คลิก avatar มุมขวาบน → ตั้งชื่อ
- กด `+ เพิ่มงาน` → บันทึก
- ดู sheet `งาน` → column I ควรมีชื่อ + column J มี timestamp
- รีเฟรช → task list บรรทัด 2 ควรขึ้น `· โดย <ชื่อ>`

## หมายเหตุ

- ชื่อเก็บใน localStorage ของ browser ผู้ใช้คนนั้น (แต่ละเครื่อง/แต่ละ browser ตั้งคนละชื่อได้)
- ถ้าลูกน้องลบ cache → ต้องตั้งชื่อใหม่
- ถ้ายังไม่ตั้งชื่อ ระบบจะบังคับเปิด modal ให้ตั้งก่อนกด `+ เพิ่มงาน` ครั้งแรก
- การ edit/delete งานยังไม่ได้บันทึก lastEditBy — ถ้าต้องการ ขอเพิ่มภายหลัง
