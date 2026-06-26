# MCP servers + AI PR review — activation guide

นี่คือ 2 ตัวที่ project นี้เตรียม config ไว้แล้ว แต่ต้อง activate manual 1 ครั้ง

---

## 1) Vercel MCP — connect Claude Code to Vercel

**ทำอะไรได้ตอน activate:** Claude ผ่าน Cloud / CLI / Desktop จะอ่าน deploy logs, env vars, analytics, project list ของ Vercel account นี้ตรงได้ — ไม่ต้อง copy-paste จาก dashboard

**Config:** อยู่ที่ `.mcp.json` ที่ project root (committed already)

**Activation:** ตอนเปิด Claude Code session ใหม่ใน project นี้ ครั้งแรก Claude จะเด้ง OAuth ขึ้นมา → login Vercel ครั้งเดียว, token cache ไว้ใช้ต่อ

**Scope:** ตอนนี้ชี้ไป shared endpoint (`https://mcp.vercel.com`) — Claude เห็นทุก project ใน account ถ้าอยากจำกัดแค่ aptdashboard:
```json
"url": "https://mcp.vercel.com/<your-org>/aptdashboard"
```
แทน url เดิมใน `.mcp.json`

**ปลด activation:** ลบไฟล์ `.mcp.json` ออก หรือ revoke token ที่ vercel.com/account/integrations

---

## 2) CodeRabbit — AI PR reviewer

**ทำอะไรได้ตอน activate:** ทุก PR ที่เปิดเข้า `main` จะมีรีวิวอัตโนมัติเป็นภาษาไทย — สรุปการเปลี่ยนแปลง + ชี้บั๊ก/risk ที่อาจพลาด + inline comment ตามไฟล์ ผลคือ second opinion นอกเหนือจากที่ Claude เขียนเอง

**Config:** `.coderabbit.yaml` ที่ project root (committed) — tune ไว้แล้ว:
- ตอบไทย
- profile = chill (โทน skim ง่าย ไม่จุกจิก)
- path instructions ระบุให้เน้น: route guards บน `app/api/`, lock+audit บน Apps Script, 44px tap target + dark mode บน components, getBangkokNow() บน lib

**Activation (1 step):** ไปที่ https://github.com/apps/coderabbitai → **Install** → เลือก repo `chawanansuk/aptdashboard` เท่านั้น (หรือทั้ง org ก็ได้) → confirm

หลังจากนั้น PR ถัดไปจะมีรีวิวเด้งภายใน ~1-2 นาที

**Pricing:** ฟรีสำหรับ public repo / open-source. private repo คนเดียวใช้ — มี free tier (2 PR reviews/month) เกินนั้น ~$15/dev/mo สำหรับ team plan

**ปลด:** uninstall GitHub App ที่ Settings → Integrations หรือลบ `.coderabbit.yaml`

---

## ไม่ได้รวม (ไม่คุ้มสำหรับแอปนี้)

- **Google Sheets MCP** — ต้อง OAuth/service account ใน cloud env ลำบาก + แอปมี Apps Script เป็น proxy ที่ Claude เข้าผ่าน `/api/sheet/*` ได้ครบอยู่แล้ว
- **Supabase MCP** — สำหรับวันที่ย้าย data layer ออกจาก Sheets ค่อยเพิ่ม
- **Cursor / Windsurf / Devin** — switching cost สูง Claude Code ทำงานนี้แทนแล้ว
