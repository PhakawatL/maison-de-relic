# modules — แบ่งโฟลเดอร์ตามเจ้าของงาน

แต่ละคนแก้เฉพาะโฟลเดอร์ของตัวเอง เพื่อลด merge conflict
ถ้าต้องแก้ของคนอื่น ให้คุยกันก่อนหรือเปิด PR ให้เจ้าของรีวิว

| โฟลเดอร์ | เจ้าของ | ตารางหลัก |
|---|---|---|
| `auth/`, `users/` | R2 · Identity · Admin Users | User, Admin, OTPVerification, PasswordResetRequest, Address |
| `products/`, `inventory/` | R3 · Catalog · Inventory | Category, Series, Product, ProductImage, StockMovement |
| `search/`, `recommend/`, `events/` | R4 · Discovery · Recommender | UserEvent |
| `cart/`, `orders/` | R5 · Cart · Checkout · Orders | (ดูเอกสารแบ่งงาน) |
| `wishlist/`, `reviews/`, `refunds/`, `support/` | R1 · Tech Lead · After-sales | Wishlist, Review, RefundRequest, SupportTicket, AdminActionLog |

## เริ่ม module ใหม่

1. คัดลอก `_template/` เป็นโฟลเดอร์ของตัวเอง แล้วเปลี่ยนชื่อไฟล์ เช่น `wishlist.routes.js`
2. แก้ SQL ใน `*.service.js` ให้ใช้ตารางจริง
3. เปิดใช้ใน `src/app.js` โดยเพิ่ม `app.use('/api/<ชื่อ>', require('./modules/<ชื่อ>/<ชื่อ>.routes'))`
4. บอกรูปแบบ request/response ใน `docs/api.md` ให้คนทำหน้าเว็บรู้

## กติกา

- ตอบสำเร็จเป็น `{ "data": ... }` และตอบ error ด้วยการ `throw AppError` เท่านั้น (ดู `docs/api.md`)
- SQL ใช้ `$1, $2` เสมอ
- งานที่ต้องแก้หลายตารางพร้อมกัน (เช่น ตัดสต็อกตอนจ่ายเงิน) ใช้ `withTransaction` จาก `src/db/pool.js`
