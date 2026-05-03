# คู่มือปรับปรุง Google Sheet ให้ลูกน้องใช้งานง่ายขึ้น

ทำเรียงลำดับจากง่าย → ยาก ผลที่ได้คือ:
- ลูกน้องกรอกผิดได้ยากขึ้น
- เห็นข้อมูลสำคัญ (งานวันนี้, สัญญาใกล้หมด, ค่าค้างจ่าย) เด่นชัด
- คำนวณค่าน้ำ-ไฟ-ยอดรวมอัตโนมัติ
- ปุ่ม "สร้างเดือนใหม่" / "ปิดงาน" ทำได้คลิกเดียว

> ⚠️ **ก่อนเริ่ม**: copy ชีตเก็บไว้ 1 backup ก่อน (File → Make a copy) เผื่อพลาด

---

## ส่วนที่ 1 — Dropdown ทุก column (15 นาที)

### tab `งาน`

| Column | ค่าที่ใส่ |
|---|---|
| **B (ประเภท)** | `ทำสะอาด, ย้ายเข้า, ย้ายออก, ชมห้อง, ซ่อม, อื่นๆ` |
| **C (ตึก)** | `มั่งมี, มีทรัพย์, KL, มายทรี, มีทอง` |
| **H (สถานะ)** | `ว่าง, เสร็จ, ยกเลิก` |

**วิธีทำ** (ทำซ้ำกับทั้ง 3 columns):
1. คลิก header column (เช่น `B`) → เลือกทั้ง column
2. menu **Data** → **Data validation** → **+ Add rule**
3. **Apply to range**: `งาน!B2:B` (ข้าม row 1)
4. **Criteria** → **Dropdown**
5. ใส่ค่าตามตารางข้างบน คั่นด้วยกด **+ Add another item**
6. **Show warning** (กันลูกน้องใส่ค่าอื่น)
7. **Done**

### tab `ห้อง`

| Column | ค่า |
|---|---|
| **A (ตึก)** | `มั่งมี, มีทรัพย์, KL, มายทรี, มีทอง` |
| **D (สถานะ)** | `มีคนอยู่, ว่าง, รอสัญญา, แจ้งย้ายออก, ปรับปรุง` |

### tab `มิเตอร์`

| Column | ค่า |
|---|---|
| **A (เดือน)** | `2025-01, 2025-02, ... 2025-12, 2026-01, ...` (หรือใช้ Date validation) |
| **B (ตึก)** | `มั่งมี, มีทรัพย์, KL, มายทรี, มีทอง` |

---

## ส่วนที่ 2 — Freeze + Filter views (5 นาที)

### Freeze
ทุก tab:
1. **View** → **Freeze** → **1 row** (ล็อก header)
2. ถ้าอยากเห็น `ตึก/ห้อง` ตอน scroll ขวา: **Freeze** → **2 columns**

### Filter views (เซฟกรองสำเร็จรูป)

**tab `งาน`** สร้าง 3 views:

1. **"งานวันนี้"**
   - **Data → Create filter view → Save**
   - column A (วันที่) → filter by condition → **Date is today**

2. **"งานเกินกำหนด"**
   - column A: **Date is before today**
   - column H (สถานะ): ติ๊กเฉพาะ `ว่าง` (ที่ยังไม่เสร็จ)

3. **"งาน 7 วันข้างหน้า"**
   - column A: **Date is between today + 7 days**

**tab `ห้อง`**:

4. **"ห้องว่าง"** — column D = `ว่าง`
5. **"สัญญาใกล้หมด"** — column I (สัญญาหมด): date is before today+30

ลูกน้องคลิก dropdown filter view มุมซ้ายบน → เลือก preset → ได้เลย

---

## ส่วนที่ 3 — Conditional Formatting (10 นาที)

ทำที่ tab `งาน` ทั้งแถว (range `A2:H`):

**Format → Conditional formatting → Add another rule**

### Rule 1 — งานวันนี้ ยังไม่เสร็จ → เหลืองอ่อน
- Apply to range: `A2:H`
- Custom formula:
  ```
  =AND($A2=TODAY(), $H2<>"เสร็จ", $H2<>"ยกเลิก")
  ```
- Background: เหลืองอ่อน `#FEF3C7`

### Rule 2 — งานเกินกำหนด ยังไม่เสร็จ → แดงอ่อน
- Custom formula:
  ```
  =AND($A2<TODAY(), $A2<>"", $H2<>"เสร็จ", $H2<>"ยกเลิก")
  ```
- Background: แดงอ่อน `#FEE2E2`

### Rule 3 — งานเสร็จแล้ว → เทา + strikethrough
- Custom formula: `=$H2="เสร็จ"`
- Background: `#E5E7EB` + Text: strikethrough

### Rule 4 — ยกเลิก → เทาอ่อน
- Custom formula: `=$H2="ยกเลิก"`
- Background: `#F3F4F6` + Text color: `#9CA3AF`

ที่ tab `ห้อง`:

### Rule 5 — สัญญาหมดใน 30 วัน → ส้ม
- Apply to: `A2:Q` (หรือเท่าที่มี column)
- Custom formula:
  ```
  =AND($I2<>"", DATEVALUE($I2)-TODAY()<=30, DATEVALUE($I2)>=TODAY())
  ```
- Background: ส้มอ่อน `#FED7AA`

### Rule 6 — สัญญาหมดแล้ว → แดงเข้ม
- Custom formula: `=AND($I2<>"", DATEVALUE($I2)<TODAY())`
- Background: `#FCA5A5`

> ถ้า column สัญญาเก็บเป็น text format `dd/MM/yyyy` ต้องใช้ `DATEVALUE()` — ถ้าเป็น Date จริง ใช้ `$I2` ตรง ๆ

ที่ tab `มิเตอร์`:

### Rule 7 — ยังไม่จ่าย → แดง
- Custom formula: `=$Q2=""` (column Q = วันที่โอน, แก้ตามจริง)
- Background: `#FEE2E2`

---

## ส่วนที่ 4 — Protected Ranges (กันลูกน้องลบของสำคัญ)

### Protect header row ทุก tab
1. เลือก row 1 ของ tab `งาน`
2. **Data → Protect sheets and ranges**
3. **Set permissions** → **Restrict who can edit** → **Only you**
4. ทำซ้ำกับ tab `ห้อง`, `มิเตอร์`

### Protect ทั้ง tab ที่ลูกน้องไม่ควรแก้
- ถ้ามี tab `ผู้เช่าเก่า` หรือ tab สรุป → protect ทั้ง tab

### ให้ลูกน้องแก้ได้เฉพาะ data row
- **Protect range** = `งาน!A1:H1` (header เท่านั้น)
- ที่เหลือ row 2 ลงไปลูกน้องแก้ได้ปกติ

---

## ส่วนที่ 5 — Auto Formula tab `มิเตอร์` (15 นาที — คุ้มสุด)

> เป้าหมาย: ลูกน้องกรอกแค่ **มิเตอร์ใหม่** + **วันที่โอน** ที่เหลือคำนวณเอง

โครงเดิม 18 columns:
```
A เดือน | B ตึก | C ห้อง | D มิเตอร์ไฟเดิม | E มิเตอร์ไฟใหม่ |
F ยูนิตไฟ | G ค่าไฟ | H มิเตอร์น้ำเดิม | I มิเตอร์น้ำใหม่ |
J ยูนิตน้ำ | K ค่าน้ำ | L ค่าเช่า | M กุญแจสำรอง | N จอดรถ |
O อื่นๆ | P ยอดรวม | Q วันที่โอน | R หมายเหตุ
```

ใส่สูตรพวกนี้ใน row 2 แล้ว drag ลงทั้ง column:

### F (ยูนิตไฟ)
```
=IF(AND(D2<>"",E2<>""), E2-D2, "")
```

### G (ค่าไฟ) — lookup อัตราจาก tab `ห้อง`
```
=IFERROR(F2 * VLOOKUP(C2, 'ห้อง'!C:L, 10, FALSE), "")
```
- `'ห้อง'!C:L` = column C(ห้อง) ถึง L(อัตราค่าไฟ)
- `10` = column ที่ 10 จาก C → คืออัตราค่าไฟ (ปรับเลขถ้าตำแหน่ง column ต่าง)

### J (ยูนิตน้ำ)
```
=IF(AND(H2<>"",I2<>""), I2-H2, "")
```

### K (ค่าน้ำ) — max(ขั้นต่ำ, ยูนิต × อัตรา)
```
=IFERROR(MAX(VLOOKUP(C2, 'ห้อง'!C:N, 12, FALSE), J2 * VLOOKUP(C2, 'ห้อง'!C:M, 11, FALSE)), "")
```

### L (ค่าเช่า) — lookup จาก ห้อง tab
```
=IFERROR(VLOOKUP(C2, 'ห้อง'!C:J, 8, FALSE), "")
```

### P (ยอดรวม)
```
=IFERROR(SUM(G2,K2,L2,M2,N2,O2), "")
```

### มิเตอร์เดิม auto-fill จากเดือนก่อน

ถ้ากรอก `มิเตอร์ใหม่` เดือน 2025-01 ห้อง 101 = `1500` แล้วเดือน 2025-02 อยากให้ `D` (มิเตอร์ไฟเดิม) = 1500 อัตโนมัติ:

### D (มิเตอร์ไฟเดิม)
```
=IFERROR(INDEX('มิเตอร์'!E:E, MATCH(1, ('มิเตอร์'!A:A=TEXT(EDATE(DATEVALUE(A2&"-01"),-1),"yyyy-MM"))*('มิเตอร์'!C:C=C2), 0)), "")
```

⚠️ array formula — ต้องกด **Ctrl+Shift+Enter** ตอนพิมพ์ครั้งแรก

ทางเลือกง่ายกว่า — ใช้ Apps Script แทน (ดูส่วนที่ 6)

---

## ส่วนที่ 6 — Apps Script: onEdit + Menu (สูงสุด — สบายลูกน้องที่สุด)

เปิด **Extensions → Apps Script** ใส่ code นี้ต่อท้าย `Code.gs` ที่มีอยู่:

```javascript
// =============================================
// onEdit Trigger — auto-stamp ตอนกรอก/แก้
// =============================================
function onEdit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  var name = sh.getName();
  var row = e.range.getRow();
  var col = e.range.getColumn();
  if (row === 1) return; // skip header

  // tab "งาน" — เปลี่ยนสถานะเป็นเสร็จ → log timestamp ใน column ถัดไป
  if (name === 'งาน' && col === 8) {
    var status = e.value;
    if (status === 'เสร็จ' || status === 'ยกเลิก') {
      // ถ้ามี column "วันที่ปิด" (เช่น column K = 11) ให้ใส่
      // sh.getRange(row, 11).setValue(new Date());
    }
  }

  // tab "ห้อง" — สถานะ = "ว่าง" → clear ผู้เช่า/เบอร์/สัญญา
  if (name === 'ห้อง' && col === 4) {
    if (e.value === 'ว่าง') {
      sh.getRange(row, 5).clearContent(); // E ผู้เช่า
      sh.getRange(row, 7).clearContent(); // G เบอร์
      sh.getRange(row, 9).clearContent(); // I สัญญา
    }
  }

  // tab "มิเตอร์" — กรอก "มิเตอร์ใหม่" → auto fill มิเตอร์เดิมเดือนถัดไป (จะทำใน menu)
}

// =============================================
// Custom Menu — ปุ่มสั่งการบน Sheet
// =============================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🏠 หอพัก')
    .addItem('สร้างเดือนใหม่ใน "มิเตอร์"', 'createNextMonth')
    .addItem('Auto-fill มิเตอร์เดิมจากเดือนก่อน', 'fillPreviousMeter')
    .addSeparator()
    .addItem('ปิดงานที่เลือก', 'closeSelectedTask')
    .addItem('สรุปงานวันนี้ → ส่ง email', 'sendTodayTasksEmail')
    .addToUi();
}

// สร้างเดือนใหม่ — copy ห้องทั้งหมดมาเป็น row ใหม่ใน tab มิเตอร์
function createNextMonth() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var roomsSh = ss.getSheetByName('ห้อง');
  var meterSh = ss.getSheetByName('มิเตอร์');
  var ui = SpreadsheetApp.getUi();

  var resp = ui.prompt('สร้างเดือนใหม่', 'พิมพ์เดือน (yyyy-MM):', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var month = resp.getResponseText().trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    ui.alert('รูปแบบไม่ถูก ต้องเป็น yyyy-MM เช่น 2026-05');
    return;
  }

  var rooms = roomsSh.getDataRange().getValues();
  var newRows = [];
  for (var i = 1; i < rooms.length; i++) {
    var r = rooms[i];
    if (!r[0] || !r[2]) continue; // skip blank
    // [เดือน, ตึก, ห้อง, ...] — ที่เหลือเว้น
    newRows.push([month, r[0], r[2], '', '', '', '', '', '', '', '', r[9] || '', '', '', '', '', '', '']);
  }
  if (newRows.length === 0) { ui.alert('ไม่มีห้องในชีต ห้อง'); return; }

  meterSh.getRange(meterSh.getLastRow() + 1, 1, newRows.length, 18).setValues(newRows);
  ui.alert('สร้างเดือน ' + month + ' เรียบร้อย ' + newRows.length + ' ห้อง');

  fillPreviousMeter(); // auto-fill มิเตอร์เดิม
}

// Auto-fill มิเตอร์เดิม (D, H) จากเดือนก่อนที่มี
function fillPreviousMeter() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('มิเตอร์');
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return;

  // map (เดือน|ตึก|ห้อง) → {ไฟใหม่, น้ำใหม่}
  var map = {};
  for (var i = 1; i < values.length; i++) {
    var key = values[i][0] + '|' + values[i][1] + '|' + values[i][2];
    map[key] = { electric: values[i][4], water: values[i][8] };
  }

  var updates = 0;
  for (var i = 1; i < values.length; i++) {
    var month = values[i][0];
    var building = values[i][1];
    var room = values[i][2];
    if (!month || !room) continue;

    // คำนวณเดือนก่อน
    var parts = String(month).split('-');
    if (parts.length !== 2) continue;
    var y = parseInt(parts[0]);
    var m = parseInt(parts[1]);
    var prevY = m === 1 ? y - 1 : y;
    var prevM = m === 1 ? 12 : m - 1;
    var prev = prevY + '-' + (prevM < 10 ? '0' + prevM : prevM);
    var prevKey = prev + '|' + building + '|' + room;

    if (map[prevKey]) {
      // เติมเฉพาะถ้ายังว่าง (ไม่ทับของเดิม)
      if (!values[i][3] && map[prevKey].electric) {
        sh.getRange(i + 1, 4).setValue(map[prevKey].electric);
        updates++;
      }
      if (!values[i][7] && map[prevKey].water) {
        sh.getRange(i + 1, 8).setValue(map[prevKey].water);
      }
    }
  }
  SpreadsheetApp.getUi().alert('Auto-fill เสร็จ — อัปเดต ' + updates + ' rows');
}

// ปิดงานที่เลือก (active row ใน tab งาน)
function closeSelectedTask() {
  var sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== 'งาน') {
    SpreadsheetApp.getUi().alert('ใช้ใน tab "งาน" เท่านั้น');
    return;
  }
  var row = sh.getActiveCell().getRow();
  if (row < 2) return;
  sh.getRange(row, 8).setValue('เสร็จ'); // column H = สถานะ
}

// ส่งสรุปงานวันนี้ → email
function sendTodayTasksEmail() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('งาน');
  var data = sh.getDataRange().getValues();
  var today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy');
  var lines = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    var date = r[0];
    if (date instanceof Date) date = Utilities.formatDate(date, 'Asia/Bangkok', 'dd/MM/yyyy');
    if (String(date) === today && r[7] !== 'เสร็จ' && r[7] !== 'ยกเลิก') {
      lines.push('- ' + r[1] + ' | ' + r[2] + '-' + r[3] + ' | ' + (r[4] || '') + ' ' + (r[6] || ''));
    }
  }
  var body = lines.length ? lines.join('\n') : 'วันนี้ไม่มีงาน';
  var email = Session.getActiveUser().getEmail();
  MailApp.sendEmail(email, 'งานวันนี้ ' + today, body);
  SpreadsheetApp.getUi().alert('ส่ง email ไปที่ ' + email + ' แล้ว');
}
```

### วิธีติดตั้ง:
1. **Extensions → Apps Script** เปิด editor
2. paste code ต่อท้าย `Code.gs` ที่มีอยู่ (อย่าลบ function เดิม)
3. **Save** (Ctrl+S)
4. กลับไปที่ sheet → **refresh** browser
5. จะเห็นเมนู **🏠 หอพัก** บน menu bar
6. คลิกเมนูแรก → ขอ permission → อนุมัติ

---

## สรุปลำดับที่แนะนำให้ทำตามนี้:

1. ⏱️ **15 นาที** — ส่วนที่ 1 (Dropdown) + ส่วนที่ 2 (Freeze + Filter views)
2. ⏱️ **10 นาที** — ส่วนที่ 3 (Conditional formatting)
3. ⏱️ **5 นาที** — ส่วนที่ 4 (Protected ranges)
4. ⏱️ **15 นาที** — ส่วนที่ 5 (มิเตอร์ formula) — **คุ้มที่สุด**
5. ⏱️ **20 นาที** — ส่วนที่ 6 (Apps Script menu) — สำหรับสร้างเดือนใหม่ คลิกเดียว

รวม **~1 ชั่วโมง** ลูกน้องทำงานง่ายขึ้นเยอะ

---

## ⚠️ ข้อควรระวัง

- **อย่าเปลี่ยนตำแหน่ง column** — แอป dashboard + Apps Script เดิมอ่านตามลำดับ
- **เพิ่ม column ต่อท้าย** ปลอดภัยกว่าใส่กลาง (เช่น เพิ่ม column "ผู้สร้าง" column I ตามที่เตรียมไว้ใน `docs/CREATOR.md`)
- **VLOOKUP column index** อาจต้องปรับถ้า column ใน tab `ห้อง` จริง ๆ ไม่ตรงตาม schema ใน `PROGRESS.md` — เปิด tab `ห้อง` ดูก่อนว่า column ไหนคืออัตราค่าไฟ/ค่าน้ำ
- **Test ใน sheet copy** ก่อน apply กับ sheet จริง โดยเฉพาะ Apps Script

ถ้าติดที่ตรงไหน — ส่ง screenshot/error message มา ผมช่วย debug ครับ
