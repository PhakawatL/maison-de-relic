# ข้อตกลง API

ทุกคนต้องเขียน API ตามข้อตกลงนี้ หน้าเว็บจะได้เรียกผ่าน `frontend/js/api.js` ตัวเดียวได้ทั้งหมด

## ที่อยู่

| ที่ไหน | Base URL |
|---|---|
| บนเครื่อง | `http://localhost:3000/api` |
| Production | `https://<backend>.up.railway.app/api` (ตั้งใน `frontend/js/config.js`) |

## ตั้งชื่อ endpoint

- ใช้คำนามพหูพจน์ ตัวพิมพ์เล็ก ถ้ามีหลายคำให้คั่นด้วย `-` เช่น `/products`, `/refund-requests`
- ใช้ HTTP method บอกการกระทำ ไม่ใส่คำกริยาใน URL

| ทำอะไร | Method + URL | สำเร็จได้ status |
|---|---|---|
| ดูทั้งหมด / ค้นหา | `GET /products?q=&category=` | 200 |
| ดู 1 รายการ | `GET /products/:id` | 200 |
| เพิ่ม | `POST /products` | 201 |
| แก้ไข | `PUT /products/:id` (ทั้งก้อน) หรือ `PATCH` (บางฟิลด์) | 200 |
| ลบ | `DELETE /products/:id` | 204 (ไม่มี body) |

## รูปแบบเมื่อสำเร็จ

ห่อข้อมูลไว้ใน `data` เสมอ

```json
{ "data": { "product_id": 12, "name": "RX-78-2 Ver.Ka" } }
```

ถ้าเป็นรายการที่แบ่งหน้า ให้เพิ่ม `meta`

```json
{ "data": [ ... ], "meta": { "page": 1, "pageSize": 20, "total": 134 } }
```

## รูปแบบเมื่อ error

ทุก error ตอบรูปแบบเดียวกันเสมอ ให้ `throw AppError` แล้ว `src/middleware/errorHandler.js` จะจัดรูปแบบให้

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "กรอกข้อมูลไม่ครบ",
    "details": [{ "field": "name", "issue": "required" }]
  }
}
```

- `code` ใช้ภาษาอังกฤษ ตัวพิมพ์ใหญ่คั่นด้วย `_` ให้โค้ดหน้าเว็บเอาไปเช็กได้
- `message` ใช้ภาษาไทย หน้าเว็บนำไปแสดงให้ผู้ใช้เห็นได้เลย
- `details` ใส่หรือไม่ใส่ก็ได้ ใช้บอกรายละเอียด เช่น ฟิลด์ไหนผิด

| Status | ใช้เมื่อ | code ตัวอย่าง |
|---|---|---|
| 400 | ข้อมูลที่ส่งมาผิด | `VALIDATION_ERROR`, `INVALID_ID`, `INVALID_JSON` |
| 401 | ยังไม่ล็อกอิน หรือ token หมดอายุ | `UNAUTHORIZED` |
| 403 | ล็อกอินแล้วแต่ไม่มีสิทธิ์ | `FORBIDDEN` |
| 404 | ไม่พบข้อมูล | `PRODUCT_NOT_FOUND`, `ROUTE_NOT_FOUND` |
| 409 | ชนกับข้อมูลที่มีอยู่ เช่น ข้อมูลซ้ำ หรือสต็อกไม่พอ | `DUPLICATE`, `OUT_OF_STOCK` |
| 500 | ระบบพัง (ไม่ใช่ความผิดของผู้ใช้) | `INTERNAL_ERROR` |

error จาก PostgreSQL ที่เจอบ่อย เช่น ข้อมูลซ้ำ (unique) หรือ foreign key ผิด จะถูกแปลงเป็น 409 หรือ 400 ให้อัตโนมัติ

## การล็อกอิน (R2 กำหนดรายละเอียด)

- หน้าเว็บส่ง token มากับ header `Authorization: Bearer <token>` ซึ่ง `api.js` แนบให้อัตโนมัติ
- ห้ามใช้ cookie session เพราะ frontend (vercel.app) กับ backend (railway.app) เป็นคนละเว็บ เบราว์เซอร์จะบล็อก cookie

## รายการ API (เจ้าของ endpoint เป็นคนเติม)

| Method | URL | ต้องล็อกอิน | เจ้าของ | คำอธิบาย |
|---|---|---|---|---|
| GET | `/health` | - | R1 | เช็กว่า server และฐานข้อมูลทำงาน |
| | | | | |
