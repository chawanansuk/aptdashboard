# Changelog

ทุกการเปลี่ยนแปลงที่สำคัญของโครงการนี้ บันทึกในไฟล์นี้

Format อ้างอิง [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
และ semver (Apps Script `Code.gs` มี version แยกของตัวเอง)

## [Unreleased] — Sprint 2026-05-22 (overnight push)

ระหว่าง session เดียวยาวๆ 31 PR ผ่านเข้า main — เน้น engineer mode polish,
sales workflow, data privacy, และ utility (CSV exports + persistence)

### Added

**Engineer Mode**
- Kanban location filter chips (ห้องเช่า / ส่วนกลาง / ทั้งหมด) [#87]
- TaskDetailDrawer — slide-from-right พร้อม fields ครบ + status actions [#88]
- Vehicle count badge `🏍 N` บน RoomCard [#98]
- Equipment count badge `🔧 N` บน RoomCard [#105]
- Move-out workflow checklist (status=moveout → ส้ม banner + 3 actions) [#97]
- Move-in workflow companion (status=pending → เขียว banner + 2 actions) [#103]
- Inventory (อะไหล่) — sheet, API, page, modal, CSV export [#90]
- Time tracking — start/stop timer ใน TaskDetailDrawer [#91]

**Sales Mode**
- Common-area task target (`ส่วนกลาง:<facility>` prefix) [#86]
- Vehicles per room — sheet, API, page, modal, CSV export [#92]
- Vehicles tab ใน RoomModal [#93]
- Vehicle plate/model search ใน Cmd+K [#94]
- Phone-number search ใน Cmd+K (digit normalize) [#107]
- Tap-to-call `📞` ใน RoomModal phone field [#107]
- Contract-expiring chip `⏰` บน RoomCard (≤30 วัน, management only) [#107]

**Overview / Analytics**
- Insights cards (Occupancy %, Revenue est., งาน 7 วัน, เสร็จเดือนนี้) [#96]
- Recent Tasks widget (5 ล่าสุด, click → RoomModal) [#99]

**Utilities — CSV export ทั่วทั้งแอป**
- Vehicles [#92] · Parts + Facilities [#95] · Tasks [#104] · Tenants [#106] · Equipment [#108]
- `lib/csvExport.ts` shared helper (UTF-8 BOM + RFC 4180 quoting) [#92]

**Admin / DX**
- RBAC matrix viewer page `/admin/permissions` (management only) [#89]
- Keyboard shortcut help modal กด `?` [#109]
- UI prefs persistence (activeBuilding, activeView ใน localStorage) [#110]

**Apps Script (v3.10.0 → v3.13.0)**
- v3.10.0 — column "ค่าใช้จ่าย" (cost) ใน tab งาน
- v3.11.0 — sheet "อะไหล่" + 4 actions (Task 37 inventory)
- v3.12.0 — sheet "บันทึกเวลา" + 4 actions (Task 35 time tracking)
- v3.13.0 — sheet "ยานพาหนะ" + 4 actions (vehicles per room)

### Fixed

**Data privacy — financial info gating**
- Hide "รายได้เดือนนี้" จาก engineer/sales ผ่าน `canViewFinancials` [#100, #101]
- Hide "ค่าใช้จ่าย" row ใน TaskDetailDrawer สำหรับ non-management [#101]
- Hide "รวมที่ใช้จ่าย" chip + per-task cost ใน RoomModal [#101]
- Use **effective roles** (respect "view as") สำหรับ UI gates [#101]
- Cost column ใน TasksList CSV — เฉพาะ management [#104]
- Hide cost input ใน AddTaskModal สำหรับ sales task types (ย้ายเข้า/ออก/ชมห้อง) [#102]

**Data correctness**
- Status normalization fixes (Task 11) [#85]
- Building set sync ระหว่าง CleaningChart และ taskSchema (Task 12) [#84]

### Architecture notes

- **Composite key** `taskKey()` extracted to `lib/taskKey.ts` (Kanban + Time tracker share)
- **`useEffectiveRoles`** ใช้สำหรับ UI preview gates, `session.user.roles` ใช้สำหรับ write capability
- **`usePersistedString`** generic hook for localStorage-backed state + SSR-safe hydrate

### Tests

Total: **314 tests, 26 files** (เริ่มต้น session ~258 tests)
- +5 phone-number search variants [#107]
- +7 CSV quoting/encoding cases [#92]
- +10 vehicle search ranking cases [#94]
- +10 `relativeTimeLabel` formats [#99]
- +17 task-location parse/format/filter cases [#86]
- +7 `usePersistedString` storage/hydrate/validation [#110]

### Deferred / Not done

- Audit log (Task 18) — needs new sheet
- LINE Notify (Task 20) — needs LINE token
- Sentry (Task 17) — needs DSN
- Scheduled cron (Task 40) — Vercel Hobby plan blocks
- PWA / Workbox (Task 14) — architectural
- i18n (Task 16) — too big for sprint
- Lead CRM (Task 26) — needs storage design
- Public link + QR (Task 25) — security review needed
- Drag-drop Kanban (Task 13) — declined by user
- URL routing refactor (Task 22) — too invasive
