# ชุดทดสอบเว็บเซอร์วิสด้วย Postman

`maison-de-relic.postman_collection.json` ทดสอบเว็บเซอร์วิสหลักตามใบงาน ITDS242 งานที่ 3 รวม 45 requests (71 assertions)

| ชุด | ทดสอบ |
|---|---|
| 1 | การพิสูจน์ตัวตน `POST /auth/login`, `GET /auth/me` |
| 2 | ค้นหาและดูสินค้า `GET /products`, `GET /products/:id`, `GET /admin/products` |
| 3–5 | เพิ่ม / แก้ไข / ลบสินค้า `POST /products`, `PUT /products/:id`, `DELETE /products/:id` |
| 6 | ค้นหา เพิ่ม แก้ไข ปิดบัญชีผู้ดูแล `/admins` |

วิธีรัน

1. เปิดระบบ (`docker compose up`) แล้วล้างฐานข้อมูลกลับเป็นข้อมูลตัวอย่าง `docker compose exec api npm run db:reset`
2. Postman → Import → เลือกไฟล์นี้ → คลิกขวาที่ collection → Run collection (รันตามลำดับ เพราะ request หลังใช้ token และรหัสจาก request ก่อนหน้า)
3. หรือ `npx newman run docs/testing/postman/maison-de-relic.postman_collection.json`

รันซ้ำต้อง `db:reset` ก่อน เพราะชุด 6 เพิ่มผู้ดูแลชื่อ `postman_staff1` ซึ่งจะซ้ำในรอบถัดไป
ตัวอย่างข้อมูลทดสอบชุดเดียวกันนี้อยู่ในคอมเมนต์บนหัวไฟล์ route ของแต่ละเซอร์วิสด้วย (ใบงานกำหนด)
