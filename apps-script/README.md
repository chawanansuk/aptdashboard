# Apps Script — Code.gs (mirror)

ไฟล์ในโฟลเดอร์นี้คือ **mirror ของ Code.gs ที่รันจริงใน Google Apps Script editor**
(ผูกกับ Google Sheet ของหอพัก) เก็บใน repo เพื่อ:

- diff/review การแก้ก่อน deploy
- ย้อนกลับได้ถ้า deploy แล้วพบบัก
- ทำงานร่วมกันผ่าน PR

> ⚠️ **Source of truth ยังอยู่ใน Apps Script editor** — repo เป็นแค่ mirror
> ทุกครั้งที่จะแก้ Code.gs ต้องผ่าน flow นี้: แก้ใน repo → PR → review → paste ทับ editor → Save → Deploy

## ไฟล์ในโฟลเดอร์

- `Code.gs` — Web App backend + setup helpers (ปัจจุบัน v3.4.2)

### Version history

- **v3.4.2** (current) — `addTask_` default status `'pending'` (เดิม `'ว่าง'` ผิด context — `'ว่าง'` เป็นสถานะของห้อง). `STATUS_OPTIONS` คงเดิม
- **v3.4.1** — frontend-only fix ที่ `components/SummaryDrawer.tsx` (ISO date parser) — ไม่กระทบ Apps Script
- **v3.4.0** — เพิ่ม `getTasksCached_` (CacheService 60s) + column I=ผู้สร้าง, J=วันที่สร้าง
- **v3.3.0** — baseline ที่ import เข้า repo ครั้งแรก

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

## Deploy — ขั้นตอน (user ทำเอง)

> Path เดียวกันทุก version: paste ทับ → Save → Manage deployments → New version → Deploy

### 1. เพิ่ม column ในชีต `งาน` (เฉพาะ first-time deploy v3.4.0+)

- คลิกหัว column I → ใส่ `ผู้สร้าง`
- คลิกหัว column J → ใส่ `วันที่สร้าง`
- (ไม่ต้องกรอกข้อมูลแถวเก่า — เว้น blank ได้ Code.gs จะคืนค่าเป็น string ว่าง)
- ถ้า deploy v3.4.2 จาก v3.4.0 ที่มี column I/J อยู่แล้ว — ข้ามขั้นนี้

### 2. สำรอง Code.gs เดิม (กันพลาด)

- เปิด Apps Script editor (Extensions → Apps Script)
- File → Make a copy → ตั้งชื่อตาม version ปัจจุบัน เช่น `Code.gs.backup-v3.4.0`

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
- Description: ใส่ version + summary เช่น `v3.4.2 — default task status pending`
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

---

## Keep-alive (กัน Apps Script cold start)

ปัญหา: Apps Script ที่ไม่มีคนใช้ ~5-15 นาที จะ cold start ครั้งแรกของวันช้า ~5-10s

แก้: ตั้ง time-driven trigger ให้ runtime ตื่นตลอด

### วิธีตั้ง (Apps Script editor)

1. เปิด Apps Script editor (Extensions → Apps Script)
2. เพิ่ม function ตัวนี้ที่ท้ายไฟล์ Code.gs (หรือไฟล์แยกก็ได้):

```javascript
/**
 * Keep-alive — เรียก getTasksCached_ ทุก N นาทีเพื่อให้ Apps Script ตื่น
 * ไม่ได้ทำอะไรนอกจากอ่าน sheet (ผ่าน cache) แล้วทิ้งผลลัพธ์
 */
function keepAlive() {
  try {
    getTasksCached_();
  } catch (e) {
    Logger.log('keepAlive failed: ' + e.message);
  }
}
```

3. เปิด **Triggers** (รูปนาฬิกาด้านซ้าย)
4. **Add Trigger** → ตั้งค่า:
   - Function: `keepAlive`
   - Event source: `Time-driven`
   - Type: `Minutes timer`
   - Interval: `Every 5 minutes` (ถี่กว่านี้ก็ได้ แต่จะใช้ quota เร็ว)
5. Save

### ข้อจำกัด
- Apps Script Free quota: **6 ชม./วัน** ของ runtime — ทุก 5 นาทีเรียก ใช้ ~0.05s × 288 = **15 วินาที/วัน** (ไม่กระทบ quota)
- ถ้ามี cache hit (60s TTL): keepAlive แค่ดึง JSON จาก CacheService = แทบไม่ใช้ runtime

### Verify

หลังตั้งแล้ว 5 นาที ดู **Executions** — ควรเห็น `keepAlive` รันเป็น series เวลา ~5 นาทีต่อครั้ง

ถ้าระบบ cold start ผ่าน trigger นี้ (ไม่ใช่ user เปิดเว็บ) → user ครั้งแรกของวันจะได้ cache hit ทันที
