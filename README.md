# Maison de Relic — เว็บร้านของสะสม

โครงงานวิชา ITDS241/242 มหาวิทยาลัยมหิดล

| ส่วน | เทคโนโลยี | อยู่ที่ |
|---|---|---|
| หน้าเว็บ | HTML + CSS + Vanilla JavaScript | `frontend/` → deploy บน **Vercel** |
| API | Node.js + Express | `backend/` → deploy บน **Railway** |
| ฐานข้อมูล | PostgreSQL | บนเครื่องรันใน Docker / production อยู่บน Railway |

หน้าเว็บกับ API รันแยกกัน และคุยกันผ่าน `fetch()` เท่านั้น ตามข้อกำหนดของวิชา

```
เบราว์เซอร์ → Vercel (frontend/) ──fetch()──→ Railway (backend/) → PostgreSQL
```

---

## เริ่มต้นครั้งแรก

**ต้องติดตั้งก่อน:** [Node.js 22](https://nodejs.org), [Docker Desktop](https://www.docker.com/products/docker-desktop/) และ Git

```bash
git clone <URL ของ repo นี้>
cd maison-de-relic
npm run setup
```

คำสั่ง `setup` จะติดตั้ง package สร้างไฟล์ `backend/.env` เปิดฐานข้อมูลใน Docker แล้วสร้างตารางกับใส่ข้อมูลตัวอย่างให้

> ต้องเปิด Docker Desktop ไว้ก่อนรันคำสั่งนี้

## ทำงานทุกวัน

```bash
npm run dev
```

| เปิดที่ | คืออะไร |
|---|---|
| http://localhost:5500 | หน้าเว็บ |
| http://localhost:3000/api/health | API (ต้องเห็น `"db":"ok"`) |

แก้ไฟล์แล้ว backend จะรีสตาร์ตเอง ส่วนหน้าเว็บให้กด refresh

### คำสั่งอื่น

| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `npm run db:migrate` | รัน migration ใหม่ที่ยังไม่ได้รัน (หลัง pull โค้ดเพื่อน) |
| `npm run db:seed` | ใส่ข้อมูลตัวอย่างที่เพิ่มมาใหม่ |
| `npm run db:reset` | ลบฐานข้อมูลบนเครื่องทิ้ง แล้วสร้างใหม่ทั้งหมด |
| `npm run db:down` | ปิดฐานข้อมูล |
| `npm test` | รัน test |
| `npm run dev:no-docker` | ใช้เมื่อติดตั้ง PostgreSQL เองแทน Docker (แก้ `DATABASE_URL` ใน `backend/.env` ก่อน) |

---

## โครงสร้าง

```
frontend/                 หน้าเว็บ (Vercel)
├─ *.html                 หน้าบังคับ 7 หน้า: index, login, search, detail, team, admin/products, admin/users
├─ css/base.css           สไตล์กลาง สี ฟอนต์ ปุ่ม ฟอร์ม
└─ js/
   ├─ config.js           URL ของ API
   ├─ api.js              ตัวเรียก API กลาง (ทุกหน้าต้องเรียกผ่านไฟล์นี้)
   ├─ layout.js           header + footer กลาง
   ├─ utils.js            escapeHtml, formatBaht
   └─ pages/              โค้ดของแต่ละหน้า

backend/                  API (Railway)
├─ src/
│  ├─ app.js              ประกอบ middleware + routes
│  ├─ server.js           จุดเริ่มรัน
│  ├─ config/env.js       อ่านค่าจาก .env
│  ├─ db/pool.js          query(), withTransaction()
│  ├─ middleware/         errorHandler (+ auth ของ R2)
│  ├─ utils/AppError.js   ใช้ throw error ตามรูปแบบกลาง
│  └─ modules/            แบ่งโฟลเดอร์ตามเจ้าของงาน (ดู modules/README.md)
├─ db/migrations/         โครงสร้างตาราง (ไฟล์ .sql เรียงเลข)
├─ db/seeds/              ข้อมูลตัวอย่าง
└─ test/

docs/
├─ api.md                 ข้อตกลง API + รายการ endpoint
├─ deploy.md              วิธีตั้งค่า Vercel / Railway / GitHub
└─ database/              ER Diagram, Data Dictionary
```

---

## กติกาทีม

1. **ห้าม push เข้า `main` ตรง ๆ** ให้แตก branch แล้วเปิด Pull Request ทุกครั้ง
2. ตั้งชื่อ branch เป็น `<ประเภท>/<ตำแหน่ง>-<เรื่อง>` เช่น `feat/r1-wishlist`, `fix/r3-stock-count`
3. PR ต้องให้เพื่อนอนุมัติอย่างน้อย 1 คน และ CI ต้องผ่าน (เครื่องหมายถูกสีเขียว)
4. ก่อนเริ่มงานทุกวัน ให้ `git pull` แล้วรัน `npm run db:migrate`
5. แก้เฉพาะโฟลเดอร์ของตัวเอง ถ้าต้องแก้ของคนอื่นให้คุยกันก่อน
6. ห้าม commit ไฟล์ `.env` หรือรหัสผ่าน
7. เปลี่ยนโครงสร้างตารางให้เพิ่มไฟล์ migration ใหม่ ห้ามแก้ไฟล์เก่า

```bash
git checkout main && git pull
git checkout -b feat/r1-wishlist
# ... เขียนโค้ด ...
git add .
git commit -m "R1: เพิ่ม API wishlist"
git push -u origin feat/r1-wishlist
# แล้วเปิด Pull Request บน GitHub
```

## ใครดูแลอะไร

| ตำแหน่ง | หน้าที่ |
|---|---|
| R1 · Tech Lead · After-sales | โครงระบบ, Team page, Wishlist, Review, Refund, Support |
| R2 · Identity · Admin Users | Login, จัดการผู้ดูแล, สมัครสมาชิก, โปรไฟล์ |
| R3 · Catalog · Inventory | จัดการสินค้า, สต็อก, สรุปยอดขาย |
| R4 · Discovery · Recommender | Home, Search, Detail, ระบบแนะนำ |
| R5 · Cart · Checkout · Orders | ตะกร้า, ชำระเงิน (จำลอง), คำสั่งซื้อ |
