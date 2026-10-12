# ฐานข้อมูล

- **DBMS:** PostgreSQL 16 (บนเครื่องรันผ่าน Docker ส่วน production อยู่บน Railway)
- **โครงสร้างตาราง:** อยู่ใน `backend/db/migrations/` ซึ่งเป็นตัวจริงที่ใช้สร้างฐานข้อมูล
- **ข้อมูลตัวอย่าง:** อยู่ใน `backend/db/seeds/`
- โฟลเดอร์นี้ใช้เก็บเอกสารประกอบ เช่น ภาพ ER Diagram และ Data Dictionary สำหรับใส่ในรายงาน

## เปลี่ยนโครงสร้างตารางยังไง

1. สร้างไฟล์ใหม่ใน `backend/db/migrations/` โดยใช้เลขถัดไป เช่น `002_add_review_rating.sql`
2. เขียน SQL เช่น `ALTER TABLE ...` หรือ `CREATE TABLE ...`
3. รัน `npm run db:migrate` บนเครื่องตัวเองเพื่อทดสอบ
4. เปิด PR ไฟล์ใน `backend/db/` ต้องให้ Tech Lead รีวิว
5. พอ merge เข้า main แล้ว Railway จะรัน migration ให้อัตโนมัติก่อน deploy

> **ห้ามแก้ไฟล์ migration ที่ merge ไปแล้ว** ฐานข้อมูลบน Railway และบนเครื่องเพื่อนรันไฟล์นั้นไปแล้ว ถ้าแก้ ระบบจะไม่รันซ้ำ แล้วโครงสร้างของแต่ละที่จะไม่ตรงกัน

## ฐานข้อมูลบนเครื่องเละ อยากเริ่มใหม่

```bash
npm run db:reset    # ลบทุกตาราง แล้ว migrate + seed ใหม่
```

คำสั่งนี้ทำงานได้เฉพาะเมื่อ `DATABASE_URL` ชี้ไปที่เครื่องตัวเอง (localhost) ถ้าชี้ไปที่ Railway หรือที่อื่น ระบบจะปฏิเสธทันที เพื่อกันไม่ให้เผลอลบฐานข้อมูลจริงหรือฐานข้อมูลที่ใช้ร่วมกันทั้งทีม

## เปิดดูข้อมูลด้วยโปรแกรม (DBeaver / TablePlus / pgAdmin)

| ช่อง | ค่า |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `maison_de_relic` |
| User | `postgres` |
| Password | `postgres` |
