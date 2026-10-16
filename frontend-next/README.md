# ทดลอง: หน้าเว็บด้วย Next.js (ยังไม่ได้ใช้จริง)

branch นี้มีไว้ให้ทีมเทียบก่อนตัดสินใจว่าจะย้ายจาก HTML/CSS/JS ล้วนไป Next.js ไหม
**ห้าม merge เข้า main** — ตัวจริงยังเป็น `frontend/` เหมือนเดิม

แปลงมาแค่ **หน้าทีม + header/footer + ระบบสองภาษา + โหมดมืด** เพื่อดูว่าโค้ดหน้าตาเปลี่ยนไปแค่ไหน

## ลองเปิดบนเครื่อง

```bash
git fetch
git checkout exp/r1-nextjs-prototype
cd frontend-next
npm install
npm run dev          # เปิด http://localhost:5501/team
```

build แบบที่จะเอาขึ้นจริง (ได้ไฟล์ HTML/CSS/JS ล้วนในโฟลเดอร์ `out/` ไม่ต้องมี server ของ Next.js):

```bash
npm run build
```

## เทียบไฟล์เดิม → ไฟล์ใหม่

| เดิม (`frontend/`) | Next.js (`frontend-next/`) | เปลี่ยนแค่ไหน |
|---|---|---|
| `team.html` + `js/pages/team.js` | `app/team/page.jsx` | เขียนใหม่ด้วยตรรกะเดิม (string HTML → JSX) |
| `js/layout.js` | `app/SiteHeader.jsx` | เขียนใหม่ด้วยตรรกะเดิม |
| `<head>` ที่ copy ทุกหน้า | `app/layout.jsx` | ที่เดียวใช้ทุกหน้า |
| `js/i18n.js` | `lib/i18n.jsx` | เขียนใหม่เป็น React context |
| `js/theme.js` | `lib/theme.jsx` | ตรรกะเดิม ห่อด้วย hook |
| `js/config.js` | `lib/config.js` | เพิ่มเช็ก `window` ตอน build |
| `js/api.js`, `js/auth-guard.js`, `js/utils.js` | `lib/*` | ใช้เดิม แก้แค่บรรทัด import |
| `js/locales/*.js` | `lib/locales/*.js` | ใช้เดิมทั้งไฟล์ |
| `css/base.css`, `css/pages/team.css` | `styles/*` | ใช้เดิมทั้งไฟล์ |

## ผลวัด (หน้า `/team`, Lighthouse มือถือ, ค่ากลางจาก 3 รอบ)

| | เดิม | Next.js |
|---|---|---|
| Performance score | 98 | 95 |
| Largest Contentful Paint | 1.42 s | 2.44 s |
| Total Blocking Time | 0 ms | 81 ms |
| JS ที่โหลด (gzip) | 21 kB | 115 kB |
| บรรทัดโค้ด (ไม่นับคอมเมนต์) | 361 | 323 |
| เนื้อหาอยู่ใน HTML ตั้งแต่แรก | ไม่ (สร้างด้วย JS) | ใช่ |
