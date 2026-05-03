# เพิ่มความเร็ว Apps Script ด้วย CacheService

ตอนนี้ทุกครั้งที่แอปเรียก `getTasks` Apps Script ต้องอ่านชีตทั้งตับ (~2-5 วินาที)
ถ้าเพิ่ม cache แค่ 60 วินาที → ผู้ใช้หลายคนใช้งานพร้อมกัน → คนที่ 2-N ได้ผลลัพธ์ **< 200 ms**

> ⚠️ ก่อนเริ่ม: copy `Code.gs` เก็บไว้ก่อน (Apps Script editor → File → Make a copy)

---

## ขั้นตอน

เปิด Apps Script editor (`Extensions → Apps Script`) แล้วทำตามนี้:

### 1) เพิ่ม helper ที่หัวไฟล์

```javascript
// ====== CACHE HELPERS (ใหม่) ======
var TASKS_CACHE_KEY = 'tasksCache_v1';
var TASKS_CACHE_TTL_SEC = 60; // 60 วินาที — ปรับได้

function getTasksCached_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(TASKS_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      // cache เสีย — ไม่เอา
    }
  }
  // miss → อ่านจริง
  var fresh = getTasks_();
  if (fresh && fresh.ok) {
    try {
      cache.put(TASKS_CACHE_KEY, JSON.stringify(fresh), TASKS_CACHE_TTL_SEC);
    } catch (e) {
      // payload อาจใหญ่เกิน 100KB — ไม่ cache แต่ยังคืนค่า
    }
  }
  return fresh;
}

function clearTasksCache_() {
  try {
    CacheService.getScriptCache().remove(TASKS_CACHE_KEY);
  } catch (e) {}
}
```

### 2) เปลี่ยน `doPost` — ให้ getTasks ใช้ตัว cached version

หาบรรทัดที่ route action `getTasks` แล้วเปลี่ยน:

```javascript
// เดิม:
if (action === 'getTasks') return jsonOut_(getTasks_());

// ใหม่:
if (action === 'getTasks') return jsonOut_(getTasksCached_());
```

### 3) Invalidate cache ทุกครั้งที่ "เขียน"

ในทุก function ที่แก้ข้อมูล (addTask / updateTask / updateTaskStatus / deleteTask) — เพิ่ม `clearTasksCache_();` ก่อน return:

```javascript
function addTask_(p) {
  // ... โค้ดเดิม ...
  sh.appendRow(row);
  clearTasksCache_();   // <-- เพิ่มบรรทัดนี้
  return { ok: true };
}

function updateTask_(p) {
  // ... โค้ดเดิม ...
  clearTasksCache_();   // <-- เพิ่ม
  return { ok: true };
}

function updateTaskStatus_(p) {
  // ... โค้ดเดิม ...
  clearTasksCache_();   // <-- เพิ่ม
  return { ok: true };
}

function deleteTask_(p) {
  // ... โค้ดเดิม ...
  clearTasksCache_();   // <-- เพิ่ม
  return { ok: true };
}
```

ถ้ามี `updateRoomStatus_` ที่ส่งผลต่อ status งาน ก็เพิ่มด้วย

### 4) Deploy ใหม่

Apps Script editor → **Deploy** → **Manage deployments** → แก้ Web app deployment → **New version** → Deploy

URL `SHEET_WRITE_URL` คงเดิม

---

## ผลที่คาดหวัง

| ครั้ง | ก่อน | หลัง |
|---|---|---|
| ครั้งแรก (cache miss) | 2-5 วินาที | 2-5 วินาที (เหมือนเดิม) |
| ครั้งที่ 2-N ภายใน 60 วินาที | 2-5 วินาที | **< 200 ms** ⚡ |
| หลังเพิ่ม/แก้/ลบงาน | - | cache โดน clear → ครั้งต่อไปอ่านสด |

ถ้าหลายคนเปิดแอปพร้อมกัน — คนแรกรอ 2-5 วิ คนที่ 2 เป็นต้นไปได้ทันที

---

## ปรับ TTL ตามความถี่ใช้งาน

- `TASKS_CACHE_TTL_SEC = 30` — แทบ real-time, hit rate ต่ำ
- `TASKS_CACHE_TTL_SEC = 60` — **แนะนำ** balance ดี
- `TASKS_CACHE_TTL_SEC = 300` — เร็วที่สุด แต่ถ้ามีคนแก้ในชีตโดยตรง (ไม่ผ่านแอป) จะเห็นช้า 5 นาที

หมายเหตุ: cache จะ invalidate อัตโนมัติเมื่อแก้ผ่านแอป — ปัญหานี้เกิดเฉพาะตอนแก้ใน sheet โดยตรง

---

## ทำไมไม่ cache `rooms` ด้วย?

- `/api/sheet/rooms` อ่าน CSV publish จาก Google Sheet โดยตรง — Google cache 5 นาทีอยู่แล้ว
- ฝั่งแอปเราก็ revalidate 60 วินาที + Vercel CDN ช่วยอีกชั้น
- รวมแล้วเร็วพออยู่แล้ว

ถ้าเปลี่ยนเป็นอ่านผ่าน Apps Script แทน CSV ค่อยมา cache เพิ่มอีกที

---

## (Optional) Cache hit rate logging

ถ้าอยากดู cache hit/miss ratio:

```javascript
function getTasksCached_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(TASKS_CACHE_KEY);
  if (cached) {
    Logger.log('[cache] HIT');
    return JSON.parse(cached);
  }
  Logger.log('[cache] MISS');
  var fresh = getTasks_();
  if (fresh && fresh.ok) {
    cache.put(TASKS_CACHE_KEY, JSON.stringify(fresh), TASKS_CACHE_TTL_SEC);
  }
  return fresh;
}
```

ดู log ที่ Apps Script editor → **Executions**
