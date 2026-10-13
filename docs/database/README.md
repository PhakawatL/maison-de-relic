# ฐานข้อมูล

- **DBMS:** PostgreSQL 16 รันในกล่อง `db` ของ docker compose
- **โครงสร้างตาราง:** อยู่ใน `backend/db/migrations/` ซึ่งเป็นตัวจริงที่ใช้สร้างฐานข้อมูล
- **ข้อมูลตัวอย่าง:** อยู่ใน `backend/db/seeds/`
- โฟลเดอร์นี้ใช้เก็บเอกสารประกอบ เช่น ภาพ ER Diagram และ Data Dictionary สำหรับใส่ในรายงาน

## เปลี่ยนโครงสร้างตารางยังไง

1. สร้างไฟล์ใหม่ใน `backend/db/migrations/` โดยใช้เลขถัดไป เช่น `002_add_review_rating.sql`
2. เขียน SQL เช่น `ALTER TABLE ...` หรือ `CREATE TABLE ...`
3. รัน `docker compose exec api npm run db:migrate` (หรือปิดแล้ว `docker compose up` ใหม่) เพื่อทดสอบบนเครื่องตัวเอง
4. เปิด PR ไฟล์ใน `backend/db/` ต้องให้ Tech Lead รีวิว
5. พอ merge เข้า main แล้ว เพื่อนแค่ `git pull` แล้ว `docker compose up` ระบบจะรัน migration ให้เอง

> **ห้ามแก้ไฟล์ migration ที่ merge ไปแล้ว** ฐานข้อมูลบนเครื่องเพื่อนทุกคนรันไฟล์นั้นไปแล้ว ถ้าแก้ ระบบจะไม่รันซ้ำ แล้วโครงสร้างของแต่ละที่จะไม่ตรงกัน

## ฐานข้อมูลบนเครื่องเละ อยากเริ่มใหม่

```bash
docker compose exec api npm run db:reset    # ลบทุกตาราง แล้ว migrate + seed ใหม่
```

คำสั่งนี้ทำงานได้เฉพาะเมื่อ `DATABASE_URL` ชี้ไปที่เครื่องตัวเอง (localhost หรือกล่อง `db` ของ docker compose) ถ้าชี้ไปที่เครื่องอื่น ระบบจะปฏิเสธทันที เพื่อกันไม่ให้เผลอลบฐานข้อมูลที่ไม่ใช่ของตัวเอง

## เปิดดูข้อมูลด้วยโปรแกรม (DBeaver / TablePlus / pgAdmin)

| ช่อง | ค่า |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `maison_de_relic` |
| User | `postgres` |
| Password | `postgres` |
