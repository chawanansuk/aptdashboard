# Dashboard หอพัก

เว็บ Dashboard สำหรับดูแลงานหอพัก 5 ตึก (Kl, มายทรี48, G48, มั่งมี, มีทรัพย์)

## ฟีเจอร์

- **KPI Cards** — งานวันนี้ / ทำสะอาดสัปดาห์นี้ / ย้ายเข้าเดือนนี้
- **งานวันนี้** — รายการทั้งหมดพร้อมปุ่มโทรจากมือถือ
- **แจ้งเตือนเกินกำลัง** — เมื่อทำสะอาดเกิน 2 ห้อง/วัน/ตึก
- **Bar Chart** — ภาระทำสะอาดแต่ละตึกในสัปดาห์นี้
- Mobile-first, Dark mode, ภาษาไทยทั้งหมด, Timezone Bangkok

---

## วิธีตั้งค่า URL ของ Google Sheet

1. เปิด Google Sheet ของคุณ
2. ไปที่ **File → Share → Publish to web**
3. เลือก **Entire Document** → เลือกรูปแบบ **CSV** → กด **Publish**
4. คัดลอก URL ที่ได้
5. เปิดไฟล์ `.env.local` แล้ววาง URL:

```env
NEXT_PUBLIC_SHEET_CSV_URL=https://docs.google.com/spreadsheets/d/xxx/pub?output=csv
```

> **หมายเหตุ:** ถ้า Sheet มีหลาย tab ต้องเพิ่ม `&gid=0` (หรือ gid ของ tab นั้น) ต่อท้าย URL

---

## โครงสร้างคอลัมน์ใน Google Sheet

| คอลัมน์ | ตัวอย่าง |
|---|---|
| วันที่ | 30/04/2026 |
| ประเภท | ทำสะอาด / ย้ายเข้า / ย้ายออก / ชมห้อง |
| ตึก | G48 |
| ห้อง | 207 |
| ลูกค้า | คุณศศิพิม |
| เบอร์ | 098-748-8334 |
| หมายเหตุ | เช็คตู้เย็น |
| สถานะ | ว่าง / เสร็จ |

---

## วิธีรัน Local

```bash
# 1. ติดตั้ง dependencies (ครั้งแรก)
npm install

# 2. รัน dev server
npm run dev

# 3. เปิดเบราว์เซอร์ที่
# http://localhost:3000
```

---

## วิธี Deploy ขึ้น Vercel

### ครั้งแรก
1. สมัคร vercel.com (ฟรี)
2. กด **Add New Project** → เลือก Git repo นี้
3. ในหน้า **Environment Variables** เพิ่ม:
   - Key: `NEXT_PUBLIC_SHEET_CSV_URL`
   - Value: URL ของ Google Sheet CSV
4. กด **Deploy** รอสักครู่

### Deploy ซ้ำหลังแก้โค้ด
```bash
git add -A
git commit -m "แก้ไข..."
git push
```

---

## วิธีแก้ปัญหาเบื้องต้น

| ปัญหา | วิธีแก้ |
|---|---|
| หน้าจอขึ้น "โหลดข้อมูลไม่สำเร็จ" | ตรวจสอบ URL ใน .env.local ว่าถูกต้อง และ Sheet ถูก Publish แล้ว |
| ข้อมูลไม่อัปเดต | กดปุ่ม refresh มุมบนขวา หรือรอ 5 นาที (auto-refresh) |
| วันที่แสดงผิด | ตรวจสอบรูปแบบ DD/MM/YYYY และปีเป็น ค.ศ. (ไม่ใช่ พ.ศ.) |
| ตัวอักษรภาษาไทยแตก | รอโหลด font IBM Plex Sans Thai จาก Google Fonts |
| Build error | รัน npm install ก่อน แล้วลอง npm run build ใหม่ |

---

## 🔐 การ Login (Phase 3.6)

ระบบล็อกอินผ่าน **Google OAuth** + allowlist ตาม email พร้อม role-based access

### Setup ครั้งแรก

1. **Google Cloud Console**
   - สร้าง project ใหม่ที่ https://console.cloud.google.com/
   - APIs & Services → Credentials → Create Credentials → OAuth client ID
   - Application type: Web application
   - Authorized redirect URIs:
     - `https://<your-domain>/api/auth/callback/google`
     - `http://localhost:3000/api/auth/callback/google` (dev)
   - Copy Client ID + Client Secret

2. **Vercel Environment Variables** (Settings → Environment Variables)

   | Key | Value |
   |---|---|
   | `AUTH_SECRET` | `openssl rand -base64 32` |
   | `AUTH_GOOGLE_ID` | จาก Google Console |
   | `AUTH_GOOGLE_SECRET` | จาก Google Console |
   | `AUTH_TRUST_HOST` | `true` |
   | `ALLOWED_USERS` | `owner@example.com:management,sales1@example.com:sales,tech1@example.com:engineer` |

3. **Redeploy** — ตรวจให้ env vars apply ทุก environment (Production / Preview)

### Roles (3 modes)

| Role | Badge | สิทธิ์หลัก |
|---|---|---|
| **sales** 💼 | สีเขียว `SALES MODE` | ดูผังห้อง · นัดดู · สัญญา · ย้ายเข้า/ออก |
| **engineer** 🔧 | สีส้ม `ENGINEER MODE` | ดูห้อง · ซ่อม · ทำสะอาด · อุปกรณ์ |
| **management** 📊 | สีม่วง `MGMT MODE` | เห็นทุกอย่าง + รายได้ + ลบ/แก้ได้ทุกอย่าง |

**Permission map (เฉพาะ action ที่ต่างกัน):**

| Action | sales | engineer | management |
|---|:-:|:-:|:-:|
| ลบงาน | — | — | ✓ |
| แก้ข้อมูลห้อง/ผู้เช่า | — | — | ✓ |
| ดูรายได้ | — | — | ✓ |
| เพิ่ม/แก้งาน | ✓ | ✓ | ✓ |
| ดูทุกหน้า | ✓ | ✓ | ✓ |

> ในรอบนี้ทั้ง 3 roles ยังเห็น sidebar เหมือนกัน — PR ถัดไปจะแยก sidebar ตาม role (ซ่อน "รายได้" จาก sales/engineer, ฯลฯ)

### Legacy compatibility

ALLOWED_USERS เก่าที่ใช้ค่า `admin` / `staff` ยังทำงานได้โดย auto-map:
- `email:admin` → `management`
- `email:staff` → `sales`

ไม่ต้องแก้ env ทันที — แต่แนะนำให้ migrate ไปใช้ค่าใหม่เพื่อความชัดเจน

### เพิ่ม / ลบ user

แก้ `ALLOWED_USERS` ใน Vercel แล้ว redeploy:
```
ALLOWED_USERS=alice@gmail.com:management,bob@gmail.com:sales,carol@gmail.com:engineer
```

User ที่ไม่อยู่ใน list จะเห็นหน้า `/login/denied` หลัง login Google สำเร็จ
