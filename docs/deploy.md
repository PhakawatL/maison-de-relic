# วิธี deploy (ทำครั้งเดียวโดย R1)

พอตั้งค่าครบแล้ว ทุกครั้งที่ merge เข้า `main` ระบบจะ deploy ให้อัตโนมัติ

- แก้ไฟล์ใน `backend/` → Railway จะ migrate แล้ว deploy API ใหม่
- แก้ไฟล์ใน `frontend/` → Vercel จะ deploy หน้าเว็บใหม่
- ทุก PR จะได้ preview URL จาก Vercel ไว้ลองหน้าเว็บก่อน merge

ทำตามลำดับนี้ เพราะแต่ละฝั่งต้องรู้ URL ของอีกฝั่ง

---

## 1. Railway — backend + ฐานข้อมูล

1. เข้า [railway.com](https://railway.com) แล้ว Login with GitHub
2. **New Project → Deploy from GitHub repo →** เลือก repo นี้
3. คลิก service ที่ได้ แล้วไปที่ **Settings** ตั้งค่าตามนี้:

   | ช่อง | ค่า |
   |---|---|
   | Root Directory | `backend` |
   | Watch Paths | `/backend/**` |
   | Pre-Deploy Command | `npm run db:migrate && npm run db:seed` |
   | Start Command | `npm start` (มักตั้งให้อัตโนมัติอยู่แล้ว) |
   | Healthcheck Path | `/api/health` |

   ไฟล์ seed แต่ละไฟล์รันแค่ครั้งเดียว การใส่ `db:seed` ไว้ใน Pre-Deploy เลยปลอดภัย

   Railway จะเจอ `backend/Dockerfile` แล้ว build กล่อง API จากไฟล์นี้ให้เอง (Node 24.21.0 ตัวเดียวกับที่ทีมใช้บนเครื่อง)

4. **เพิ่มฐานข้อมูล:** ในโปรเจกต์กด **+ Create**
   - ถ้า R4 ต้องใช้ semantic search ที่เก็บ embedding ใน Postgres → เลือก **Template** แล้วค้นหา **pgvector**
   - ถ้าไม่ต้องใช้ → เลือก **Database → PostgreSQL**

   > ต้องตัดสินใจตรงนี้ก่อน เพราะ Postgres ปกติของ Railway ไม่มี pgvector ถ้าเปลี่ยนทีหลังต้องย้ายข้อมูลใหม่

5. ที่ service backend ไปที่ **Variables** แล้วเพิ่มค่าเหล่านี้:

   | ชื่อ | ค่า |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (เปลี่ยน `Postgres` เป็นชื่อ service ฐานข้อมูลจริง เช่น `pgvector`) |
   | `NODE_ENV` | `production` |
   | `JWT_SECRET` | ข้อความสุ่มยาว ๆ (สร้างด้วย `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
   | `ALLOWED_ORIGINS` | เว้นไว้ก่อน แล้วค่อยใส่ในขั้นที่ 3 |
   | `ALLOWED_ORIGIN_REGEX` | เว้นไว้ก่อน แล้วค่อยใส่ในขั้นที่ 3 |

6. ไปที่ **Settings → Networking → Generate Domain** จะได้ URL หน้าตาประมาณ `https://maison-de-relic-production.up.railway.app`
7. เปิด `<URL>/api/health` ในเบราว์เซอร์ ต้องเห็น `"db":"ok"`

## 2. ใส่ URL ของ backend ให้หน้าเว็บรู้จัก

แก้ไฟล์ `frontend/js/config.js`:

```js
const PRODUCTION_API = 'https://maison-de-relic-production.up.railway.app/api';
```

แล้ว commit และ push

## 3. Vercel — หน้าเว็บ

1. เข้า [vercel.com](https://vercel.com) แล้ว Continue with GitHub
2. **Add New → Project →** import repo นี้
3. ตั้งค่า:

   | ช่อง | ค่า |
   |---|---|
   | Root Directory | `frontend` |
   | Framework Preset | Other |
   | Build Command | เว้นว่าง (ไม่มีขั้นตอน build) |

4. กด Deploy จะได้ URL เช่น `https://maison-de-relic.vercel.app`
5. **กลับไปที่ Railway → Variables** แล้วใส่:
   - `ALLOWED_ORIGINS` = `https://maison-de-relic.vercel.app`
   - `ALLOWED_ORIGIN_REGEX` = `^https://maison-de-relic(-[a-z0-9-]+)?\.vercel\.app$` (เพื่อให้ preview ของแต่ละ PR เรียก API ได้ด้วย)

## 4. ทดสอบ

เปิดหน้าแรกบน Vercel ด้านล่างต้องขึ้นว่า **"API เชื่อมต่อแล้ว · ฐานข้อมูล: ok"**

| ถ้าขึ้นว่า | สาเหตุที่น่าจะเป็น |
|---|---|
| เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ | `PRODUCTION_API` ใน config.js ผิด หรือโดน CORS บล็อก ให้ตรวจ `ALLOWED_ORIGINS` บน Railway (ต้องตรงทุกตัวอักษร ห้ามมี `/` ปิดท้าย) |
| ฐานข้อมูล: down | `DATABASE_URL` บน Railway ผิด |

## 5. ตั้งค่า GitHub ให้ทีม

1. **Settings → Collaborators →** เชิญเพื่อนทั้ง 4 คน
2. **Settings → Branches → Add branch ruleset** (หรือ Add rule) สำหรับ `main`:
   - Require a pull request before merging โดยต้องมี approval 1 คน
   - Require status checks to pass แล้วเลือก `backend` (มาจาก CI)
   - Block force pushes
3. แก้ `.github/CODEOWNERS` ใส่ GitHub username ของเพื่อน

## รูปภาพที่อัปโหลด (แจ้ง R3)

ไฟล์ที่ server เขียนลงดิสก์บน Railway **จะหายทุกครั้งที่ deploy ใหม่** ถ้าระบบให้แอดมินอัปโหลดรูปสินค้า มีให้เลือก 2 ทาง:
- ต่อ **Volume** ให้ service backend (Railway → service → Settings → Volumes, แพ็กเกจ Hobby ได้สูงสุด 5 GB)
- หรือเก็บรูปไว้ที่บริการภายนอก แล้วบันทึกแค่ URL ลงในตาราง ProductImage

## ค่าใช้จ่าย

แพ็กเกจ Hobby ของ Railway ราคา $5 ต่อเดือน รวมค่าใช้งาน $5 แล้ว โปรเจกต์ขนาดนี้น่าจะไม่เกิน ส่วน Vercel ใช้แพ็กเกจ Hobby ฟรีได้
