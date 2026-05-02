# Apartment Dashboard - Progress Tracker

## Current Status

### Phase 3.1 (DONE)
- TasksList component (components/TasksList.tsx)
- Sidebar wiring + List view (app/page.tsx)
- Cancel task action working

### Phase 3.2 (FRONTEND DONE - waiting Apps Script)
- Edit task modal (date / customer / phone / note)
- Delete task with confirm dialog
- New CSS variant: .ac-btn-danger
- Frontend deployed: commits 449b3c4 + f5dff4e
- Backend pending: deleteTask + updateTask (match/set contract) in Apps Script

### Apps Script + Vercel ENV (DONE for previous actions)
- Apps Script Web App deployed with: addTask, updateRoomStatus, updateTaskStatus, cancelTask, updateTask
- Vercel ENV SHEET_WRITE_URL configured (Production + Preview + Development)
- End-to-end flow tested for status changes

---

## Next Up: Finalize Phase 3.2 backend

Apps Script changes required:
- Add deleteTask action (hard delete row by match keys)
- Rewrite updateTask to accept { match, set } contract
- Match keys: date + building + room + type
- Editable fields: date, customer, phone, note (keep type/building/room as match-only)

Files to touch:
- Apps Script project (manual paste + new deployment version)
- app/api/sheet/update/route.ts - already a pure proxy, NO CHANGE
- components/TasksList.tsx - already wired for updateTask + deleteTask

---

## Remaining Phases
- [ ] 3.2 Apps Script backend (deleteTask + updateTask match/set)
- [ ] 3.3 Summary drawer panel
- [ ] 3.4 Contract expiry < 30 days warning
- [ ] 3.5 Mobile responsive + Dark mode toggle
- [ ] 3.6 Login/permissions (DEFERRED - needs explicit re-confirmation)

---

## Key Info

| Item | Value |
|------|-------|
| Repo | chawanansuk/aptdashboard (public) |
| Production URL | https://aptdashboard-six.vercel.app |
| Sheet ID | 1kKe7yQT8PVFvE4L3E4wH5GeR1Au51KznTVk0WsOI_xI |
| Sheet tabs | hong, ngan, template_ngan, template_hong |
| Buildings | Kl, MyTree48, G48, MungMee, MeeSub |
| TaskTypes | clean / movein / moveout / view |
| RoomStatus | occupied / ready / pending / moveout / qc / repair / inactive |

---

## Sheet ngan Schema (verified from template_ngan.csv)

Columns A..H: date, type, building, room, customer, phone, note, status

Note: There is NO separate time column. Appointment times are stored inside the note field as free text (e.g. "nat 10 mong").

---

## Workflow Rules
- Method: User-paste (no Personal Access Token)
- Send code in short chunks to prevent truncation
- Verify every commit via Vercel build status
- Phase 3.6 (login) requires explicit confirmation before starting

---

## Cleanup TODO
- Remove test data in ngan tab (28 rows from duplicating template_ngan)

---

## How to resume next day

Open Claude and type:

> "Project aptdashboard: read PROGRESS.md in repo chawanansuk/aptdashboard first, then continue with the next pending phase."
