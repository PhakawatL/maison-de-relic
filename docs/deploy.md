# การนำขึ้นออนไลน์ และตั้งค่า GitHub (ทำครั้งเดียวโดย R1)

## ภาพรวม

| ส่วน | รันที่ไหน |
|---|---|
| หน้าเว็บ (`frontend/`) | Docker บนเครื่อง (กล่อง `web`) และออนไลน์บน **Vercel** |
| API (`backend/`) | Docker บนเครื่องเท่านั้น (กล่อง `api`) |
| ฐานข้อมูล PostgreSQL | Docker บนเครื่องเท่านั้น (กล่อง `db`) |

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
2. **Settings → Branches → Add branch ruleset** (หรือ Add rule) สำหรับ `main`:
   - Require a pull request before merging โดยต้องมี approval 1 คน
   - Require status checks to pass แล้วเลือก `backend` และ `docker` (มาจาก CI)
   - Block force pushes
3. `.github/CODEOWNERS` ใส่ username ของทุกคนแล้ว

---

## รูปภาพที่อัปโหลด (แจ้ง R3)

ถ้าระบบให้แอดมินอัปโหลดรูปสินค้า ให้เก็บไฟล์ไว้ใน `backend/uploads/` (ไม่ขึ้น GitHub ตามที่ตั้งไว้ใน `.gitignore`) แล้วบันทึกแค่ path ลงในตาราง ProductImage
ถ้าต้องการให้รูปตัวอย่างมีอยู่บนเครื่องทุกคน ให้วางไว้ใน `frontend/assets/products/` แล้วอ้างถึงจาก seed แทน
