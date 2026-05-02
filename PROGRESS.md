# Apartment Dashboard - Progress Tracker

## Current Status

### Phase 3.1 (DONE)
- TasksList component (components/TasksList.tsx)
- Sidebar wiring + List view (app/page.tsx)
- Cancel task action working

### Phase 3.2 (DONE ✅)
- Edit task modal (date / customer / phone / note)
- Delete task with confirm dialog
- Apps Script Code.gs v3.2.1 — single source, no duplicates
  - doPost router: addTask / updateTask / updateTaskStatus / deleteTask / getTasks / debugFindTask
  - Robust matching: norm() handles nbsp + extra whitespace
  - findTaskRow uses date+building+room+type as composite key
- Real-time read: app/api/sheet/route.ts now POSTs to SHEET_WRITE_URL with action=getTasks (no CSV cache, no Vercel cache)
- Tested end-to-end: Edit, Delete, Close, Cancel all reflect in Dashboard immediately

### Database imports (PARTIAL)
- ห้อง tab: 252 rooms total, 5 buildings (มั่งมี 90 / มีทรัพย์ 30 / KL 48 / มายทรี 66 / มีทอง 63)
- Tenant data imported: มีทรัพย์ ✅, KL ✅
- Tenant data PENDING: มั่งมี, มายทรี, มีทอง
- มิเตอร์ tab: มีทรัพย์ 30 + KL 48 = 78 rows
- ผู้เช่าเก่า tab: SKIPPED per user decision

## Remaining Phases
- 3.3 Summary drawer panel (next)
- 3.4 Contract expiry < 30 days warning
- 3.5 Mobile responsive + Dark mode toggle
- 3.6 Login/permissions (DEFERRED - needs explicit re-confirmation)

## Key Info
| Item | Value |
|---|---|
| Repo | chawanansuk/aptdashboard (public) |
| Production URL | https://aptdashboard-six.vercel.app |
| Buildings | มั่งมี / มีทรัพย์ / KL / มายทรี / มีทอง |
| TaskTypes | ทำสะอาด / ย้ายเข้า / ย้ายออก / ชมห้อง |
| RoomStatus | ว่าง / มีผู้เช่า / รอย้ายเข้า / รอย้ายออก / ห้องสำรอง / ER |

## Sheet Schemas

### tab `งาน` (8 cols A..H)
date | type | building | room | customer | phone | note | status

### tab `ห้อง` (17 cols)
ตึก | ชั้น | ห้อง | สถานะ | ผู้เช่า | ที่อยู่ | เบอร์ | วันเข้าอยู่ | สัญญา | ค่าเช่า | เงินประกัน | อัตราค่าไฟ | อัตราค่าน้ำ | ค่าน้ำขั้นต่ำ | ที่ทำงาน | หมายเหตุ | extra

### tab `มิเตอร์` (18 cols)
เดือน | ตึก | ห้อง | มิเตอร์ไฟเดิม | มิเตอร์ไฟใหม่ | ยูนิตไฟ | ค่าไฟ | มิเตอร์น้ำเดิม | มิเตอร์น้ำใหม่ | ยูนิตน้ำ | ค่าน้ำ | ค่าเช่า | กุญแจสำรอง | จอดรถ | อื่นๆ | ยอดรวม | วันที่โอน | หมายเหตุ

## Workflow Rules
- Method: User-paste (no Personal Access Token)
- Send code in short chunks to prevent truncation
- Verify every commit via Vercel build status
- Phase 3.6 (login) requires explicit confirmation before starting

## How to resume next day
Open Claude and type:
"Project aptdashboard: read PROGRESS.md in repo chawanansuk/aptdashboard first, then continue with the next pending phase."
