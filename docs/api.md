# ข้อตกลง API

ทุกคนต้องเขียน API ตามข้อตกลงนี้ หน้าเว็บจะได้เรียกผ่าน `frontend/js/api.js` ตัวเดียวได้ทั้งหมด

## ที่อยู่

| ที่ไหน | Base URL |
|---|---|
| บนเครื่อง | `http://localhost:3000/api` |
| ออนไลน์ | ยังไม่มี — API รันใน Docker บนเครื่องเท่านั้น (ตั้งได้ที่ `frontend/js/config.js`) |

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
- ใช้ token ใน header แทน cookie session เพราะหน้าเว็บกับ API เป็นคนละ origin และถ้าวันหลังย้ายขึ้นออนไลน์คนละโดเมน cookie จะโดนเบราว์เซอร์บล็อก

## รายการ API (เจ้าของ endpoint เป็นคนเติม)

| Method | URL | ต้องล็อกอิน | เจ้าของ | คำอธิบาย |
|---|---|---|---|---|
| GET | `/health` | - | R1 | เช็กว่า server และฐานข้อมูลทำงาน |
| GET | `/products` | - | R3 | รายการสินค้าที่ขายอยู่ ค้นหา/กรอง/เรียง/แบ่งหน้า (ดูรายละเอียดด้านล่าง) |
| GET | `/products/:id` | - | R3 | สินค้า 1 ชิ้นพร้อมรูปทั้งหมด |
| GET | `/categories` | - | R3 | หมวดหมู่ทั้งหมด พร้อมจำนวนสินค้าที่ขายอยู่ |
| GET | `/series` | - | R3 | ซีรีส์ทั้งหมด พร้อมจำนวนสินค้าที่ขายอยู่ |
| | | | | |

---

## สินค้า (R3)

หน้าร้านเห็นเฉพาะสินค้า `status = 'available'` เท่านั้น สินค้า `draft` / `hidden` จะตอบ 404

### `GET /products`

| query | ค่า | ตัวอย่าง |
|---|---|---|
| `q` | คำค้นในชื่อและรายละเอียด (ไม่เกิน 100 ตัวอักษร) | `q=gundam` |
| `category` | รหัสหรือ slug ของหมวดหมู่ | `category=figures` หรือ `category=2` |
| `series` | รหัสหรือ slug ของซีรีส์ | `series=one-piece` |
| `condition` | `new`, `like_new`, `excellent`, `good`, `fair`, `poor` | `condition=like_new` |
| `minPrice`, `maxPrice` | ช่วงราคา (บาท) | `minPrice=500&maxPrice=2000` |
| `inStock` | `true` = เฉพาะที่มีของ | `inStock=true` |
| `sort` | `newest` (ค่าเริ่มต้น), `price_asc`, `price_desc` | `sort=price_asc` |
| `page`, `pageSize` | หน้าที่ (เริ่ม 1) และจำนวนต่อหน้า (ค่าเริ่มต้น 20 สูงสุด 50) | `page=2&pageSize=12` |

```json
{
  "data": [
    {
      "product_id": 12,
      "title": "RX-78-2 Gundam Ver.Ka",
      "price": 1500,
      "condition": "like_new",
      "condition_score": 8,
      "status": "available",
      "stock_quantity": 1,
      "in_stock": true,
      "cover_image_url": "https://...",
      "category": { "category_id": 3, "name": "โมเดลพลาสติก", "slug": "model-kits" },
      "series": { "series_id": 3, "name": "Gundam", "slug": "gundam" },
      "created_at": "2026-10-14T01:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 1 }
}
```

- `series` เป็น `null` ได้ถ้าสินค้าไม่อยู่ในซีรีส์ไหน
- `price` และ `condition_score` เป็นตัวเลข (ไม่ใช่ string)
- query ผิดจะตอบ 400 `VALIDATION_ERROR` และบอกช่องที่ผิดใน `details`

### `GET /products/:id`

ได้ทุกฟิลด์เหมือนรายการ และเพิ่ม `description`, `attributes` (JSON), `view_count`, `images` (เรียงตาม `seq`)

```json
{
  "data": {
    "product_id": 12,
    "title": "RX-78-2 Gundam Ver.Ka",
    "description": "...",
    "attributes": {},
    "view_count": 0,
    "images": [
      { "seq": 1, "url": "https://...", "alt_text": "ด้านหน้า", "is_cover": true }
    ]
  }
}
```

| error | เมื่อ |
|---|---|
| 400 `INVALID_ID` | id ไม่ใช่จำนวนเต็มบวก |
| 404 `PRODUCT_NOT_FOUND` | ไม่มีสินค้านี้ หรือยังไม่ได้วางขาย |

### `GET /categories` และ `GET /series`

ใช้ทำ dropdown หรือตัวกรอง แล้วส่ง `slug` (หรือ id) ไปที่ `GET /products?category=...&series=...`
`product_count` นับเฉพาะสินค้าที่วางขายอยู่ (`available`)

```json
{
  "data": [
    { "category_id": 2, "name": "ฟิกเกอร์", "slug": "figures", "product_count": 12 }
  ]
}
```

`/series` ได้รูปเดียวกัน แต่ใช้ `series_id` แทน `category_id`
