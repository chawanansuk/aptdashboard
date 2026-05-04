# Apps Script — Code.gs (mirror)

ไฟล์ในโฟลเดอร์นี้คือ **mirror ของ Code.gs ที่รันจริงใน Google Apps Script editor**
(ผูกกับ Google Sheet ของหอพัก) เก็บใน repo เพื่อ:

- diff/review การแก้ก่อน deploy
- ย้อนกลับได้ถ้า deploy แล้วพบบัก
- ทำงานร่วมกันผ่าน PR

> ⚠️ **Source of truth ยังอยู่ใน Apps Script editor** — repo เป็นแค่ mirror
> ทุกครั้งที่จะแก้ Code.gs ต้องผ่าน flow นี้: แก้ใน repo → PR → review → paste ทับ editor → Save → Deploy

## ไฟล์ในโฟลเดอร์

- `Code.gs` — Web App backend + setup helpers (ปัจจุบัน v3.4.0)

## Sheet schema ที่ Code.gs คาดหวัง

ชีต `งาน` (10 คอลัมน์):

| Col | ชื่อ | ตัวอย่าง |
|---|---|---|
| A | วันที่ | 2026-05-04 |
| B | ประเภท | ย้ายเข้า / ย้ายออก / ทำสะอาด / ชมห้อง / ซ่อม / อื่นๆ |
| C | ตึก | KL / SR / ... |
| D | ห้อง | 103 |
| E | ลูกค้า | มิณทร์ |
| F | เบอร์ | 065-9096997 |
| G | หมายเหตุ | (free text) |
| H | สถานะ | ว่าง / pending / กำลังทำ / เสร็จ / ยกเลิก |
| I | **ผู้สร้าง** (NEW v3.4.0) | ชื่อจาก localStorage ของ browser ผู้กรอก |
| J | **วันที่สร้าง** (NEW v3.4.0) | dd/MM/yyyy HH:mm (Asia/Bangkok) |

ชีต `ห้อง` ต้องมี header: `ตึก`, `ห้อง`, `สถานะ`, (optional) `ผู้เช่า`, `เบอร์`, `สัญญา`

## Deploy v3.4.0 — ขั้นตอน (user ทำเอง)

### 1. เพิ่ม column ในชีต `งาน`

- คลิกหัว column I → ใส่ `ผู้สร้าง`
- คลิกหัว column J → ใส่ `วันที่สร้าง`
- (ไม่ต้องกรอกข้อมูลแถวเก่า — เว้น blank ได้ Code.gs จะคืนค่าเป็น string ว่าง)

### 2. สำรอง Code.gs เดิม (กันพลาด)

- เปิด Apps Script editor (Extensions → Apps Script)
- File → Make a copy → ตั้งชื่อ `Code.gs.backup-v3.3.0`

### 3. Paste Code.gs ใหม่

- ใน Apps Script editor เปิดไฟล์ `Code.gs`
- Ctrl+A เลือกทั้งหมด → Delete
- เปิด `apps-script/Code.gs` ใน repo (branch ที่ merge แล้ว)
- คลิก "Copy raw file" → paste ลง Apps Script editor
- กด **Save** (💾 หรือ Ctrl+S)

### 4. Deploy version ใหม่

- Deploy → Manage deployments
- คลิก ✏️ (edit) ตรง Web app deployment ที่ใช้อยู่
- Version dropdown → **New version**
- Description: `v3.4.0 — cache + creator fields`
- คลิก **Deploy**

> URL `SHEET_WRITE_URL` คงเดิม — ไม่ต้องแก้ Vercel env

### 5. ทดสอบ

- เปิด https://aptdashboard-six.vercel.app/
- Refresh ครั้งแรก (cache miss) → เปิด tab `งานทั้งหมด` → time ปกติ ~2-3 วิ
- Refresh ครั้งที่ 2 ภายใน 60 วินาที → ต้อง **< 200 ms** ⚡
- คลิก avatar มุมขวาบน → ตั้งชื่อ → บันทึก
- กด `+ เพิ่มงาน` → กรอก → บันทึก
- เปิดชีต `งาน` → row ล่าสุด column I ต้องมีชื่อ + column J มี timestamp

## Cache TTL — ปรับได้

ใน `Code.gs` แก้ค่า:

- 30 = แทบ real-time, hit rate ต่ำ
- 60 = แนะนำ (default)
- 300 = เร็วสุด แต่ถ้ามีคนแก้ในชีตโดยตรง (ไม่ผ่านแอป) จะเห็นช้า 5 นาที

cache invalidate อัตโนมัติเมื่อแก้ผ่านแอป (addTask/updateTask/updateTaskStatus/deleteTask + onEdit ตอนเปลี่ยน room status)

## Workflow ครั้งหน้า

1. แก้ `apps-script/Code.gs` ใน feature branch
2. เปิด PR + รอ review
3. หลัง merge → user ทำขั้นตอน Deploy ข้างบน

ห้าม push ตรงเข้า main / ห้าม Claude Code Save+Deploy แทน user
