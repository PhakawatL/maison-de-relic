# การนำขึ้นออนไลน์ และตั้งค่า GitHub (ทำครั้งเดียวโดย R1)

## ภาพรวม

| ส่วน | รันที่ไหน |
|---|---|
| หน้าเว็บ (`frontend/`) | Docker บนเครื่อง (กล่อง `web`) และออนไลน์บน **Vercel** |
| API (`backend/`) | Docker บนเครื่องเท่านั้น (กล่อง `api`) |
| ฐานข้อมูล PostgreSQL | Docker บนเครื่องเท่านั้น (กล่อง `db`) |
| ไฟล์รูปสินค้า | **Supabase Storage** (ฐานข้อมูลเก็บแค่ URL ของรูป) |

> **ข้อจำกัดตอนนี้:** API กับฐานข้อมูลยังไม่ได้ขึ้นออนไลน์ หน้าเว็บบน Vercel จึงเปิดได้และแสดงหน้าตาได้ แต่ส่วนที่ต้องดึงข้อมูล (ค้นหา ล็อกอิน ฯลฯ) จะใช้ไม่ได้
> การเดโมแบบใช้งานได้ครบให้เปิดจากเครื่องที่รัน `docker compose up` ที่ http://localhost:5500
> ถ้าภายหลังเอา API ขึ้นออนไลน์ ให้ใส่ URL ของ API ที่ `PRODUCTION_API` ใน `frontend/js/config.js` และเพิ่มโดเมน Vercel ใน `ALLOWED_ORIGINS` ของ API

---

## 1. Vercel — หน้าเว็บ

1. เข้า [vercel.com](https://vercel.com) แล้ว Continue with GitHub
2. **Add New → Project →** import repo `maison-de-relic`
3. ตั้งค่า:

   | ช่อง | ค่า |
   |---|---|
   | Root Directory | `frontend` |
   | Framework Preset | Other |
   | Build Command | เว้นว่าง (ไม่มีขั้นตอน build) |

4. กด Deploy จะได้ URL เช่น `https://maison-de-relic.vercel.app`

หลังจากนี้ทุกครั้งที่ merge เข้า `main` และมีไฟล์ใน `frontend/` เปลี่ยน Vercel จะ deploy ให้เอง และทุก PR จะได้ลิงก์ preview ไว้ดูหน้าตาก่อน merge
(`frontend/vercel.json` ตั้งให้ข้ามการ deploy ถ้าไม่มีอะไรใน `frontend/` เปลี่ยน)

---

## 2. GitHub — ตั้งค่าให้ทีม

1. **Settings → Collaborators →** เชิญสมาชิก (ทำแล้ว)
2. **Settings → Rules → Rulesets** สร้างกฎ `protect-main` สำหรับ `main` (ทำแล้ว 13 ต.ค. 2569):
   - Require a pull request before merging โดยต้องมี approval 1 คน
   - Require status checks to pass แล้วเลือก `backend` และ `docker` (มาจาก CI)
   - Block force pushes และห้ามลบ main
   - Bypass list: Repository admin (R1 push งานเอกสารตรงได้ตามกติกาใน README)
3. `.github/CODEOWNERS` ใส่ username ของทุกคนแล้ว

---

## 3. รูปสินค้า — Supabase Storage (แจ้ง R3, R4)

ไฟล์รูปไม่เก็บในเครื่องหรือในกล่อง `api` แต่เก็บใน **Supabase Storage** แทน เพราะ
- ทุกคนเห็นรูปชุดเดียวกัน ไม่ต้องส่งไฟล์รูปให้กัน
- ลบกล่องหรือ `docker compose down -v` แล้วรูปไม่หาย
- รูปมี URL สาธารณะ หน้าเว็บบน Vercel ก็เปิดรูปได้

> ใช้ Supabase เฉพาะ **Storage** เท่านั้น ฐานข้อมูลยังเป็น PostgreSQL ในกล่อง `db` เหมือนเดิม

### ทำงานอย่างไร

1. แอดมินเลือกรูปในหน้าจัดการสินค้า → หน้าเว็บส่งไฟล์ให้ API
2. API อัปโหลดไฟล์เข้า bucket **`Product_image`** (ตัว P ใหญ่ + ขีดล่าง, ตั้งเป็น public) ด้วย key ฝั่ง server
   - key แบบใหม่ (`sb_secret_...`) ต้องส่งทั้ง header `apikey: <key>` และ `Authorization: Bearer <key>`
3. API บันทึก **URL สาธารณะ** ของรูปลง `product_image.url` (และ `product.cover_image_url` ถ้าเป็นรูปหน้าปก)
4. หน้าเว็บแสดงรูปจาก URL ที่ได้จาก `GET /products` ตรง ๆ ไม่ต้องรู้จัก Supabase

### key (สำคัญ)

| ค่า | ใส่ที่ไหน |
|---|---|
| `SUPABASE_URL` | `.env` ที่ root → ส่งเข้ากล่อง `api` ผ่าน `docker-compose.yml` |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env` ที่ root เท่านั้น |

- **ห้ามขึ้น GitHub** (`.env` อยู่ใน `.gitignore` แล้ว) ค่าจริงอยู่ใน **Notion ของทีม**
- `service_role` ข้ามสิทธิ์ทุกอย่างของ Supabase ได้ จึงใช้ **เฉพาะใน `backend/`** ห้ามใส่ใน `frontend/` เด็ดขาด เพราะโค้ดหน้าเว็บทุกคนเปิดดูได้
- ใครแก้ `docker-compose.yml` เพื่อเพิ่มค่าเหล่านี้ ให้บอก R1 ก่อน
- เครื่องที่ยังไม่มี key ระบบยังเปิดได้ปกติ แค่อัปโหลดรูปใหม่ไม่ได้

### รูปตัวอย่างใน seed

รูปของสินค้าตัวอย่าง (`backend/db/seeds/004_products.sql`, #46) อยู่ใน bucket `Product_image` โฟลเดอร์ `seed/` แล้ว
- bucket เป็น public ทุกเครื่องเห็นรูปได้**โดยไม่ต้องมี key**
- อัปโหลดด้วย `node backend/scripts/upload-seed-images.js` (อัปโหลดไปแล้ว ไม่ต้องรันซ้ำ) · `--check` = เช็กว่าเปิดรูปได้ครบ
- รายชื่อรูปอยู่ใน `backend/scripts/seed-images.json` · เครดิตช่างภาพใน `backend/db/seeds/004_products.credits.md`

> เดิมวางแผนเก็บไฟล์ใน `backend/uploads/` — **เลิกใช้แล้ว**
