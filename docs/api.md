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
- รายละเอียด endpoint และวิธีใส่ middleware ใน route ของตัวเอง ดูหัวข้อ [ล็อกอิน (R2)](#ล็อกอิน-r2) ด้านล่าง

## รายการ API (เจ้าของ endpoint เป็นคนเติม)

| Method | URL | ต้องล็อกอิน | เจ้าของ | คำอธิบาย |
|---|---|---|---|---|
| GET | `/health` | - | R1 | เช็กว่า server และฐานข้อมูลทำงาน |
| POST | `/auth/login` | - | R2 | ล็อกอินด้วย username + password ได้ token กลับไป |
| GET | `/auth/me` | ✓ | R2 | ข้อมูลผู้ใช้ที่ล็อกอินอยู่ และสิทธิ์แอดมิน |
| GET | `/products` | - | R3 | รายการสินค้าที่ขายอยู่ ค้นหา/กรอง/เรียง/แบ่งหน้า (ดูรายละเอียดด้านล่าง) |
| GET | `/products/:id` | - | R3 | สินค้า 1 ชิ้นพร้อมรูปทั้งหมด |
| | | | | |

---

## ล็อกอิน (R2)

### ใส่ใน route ของตัวเอง

```js
const { requireAuth, requireRole, requireAdmin, requireVerified } = require('../../middleware/auth');

router.post('/', requireAdmin, controller.create);                    // แอดมินเท่านั้น (owner หรือ staff)
router.post('/', requireAuth, requireRole('owner'), controller.x);    // เจ้าของร้านเท่านั้น
router.post('/', requireAuth, requireVerified, controller.add);       // ลูกค้าที่ยืนยันอีเมลแล้ว (ตะกร้า, wishlist, ที่อยู่, ออเดอร์, ticket)
router.get('/mine', requireAuth, controller.mine);                    // แค่ต้องล็อกอิน
```

ผ่าน `requireAuth` แล้ว controller อ่านผู้ใช้ได้จาก `req.user` เช่น `req.user.user_id` (ใช้เป็น `created_by`, `reviewed_by` ฯลฯ ได้เลย)

| middleware | ไม่ผ่านเมื่อ | ตอบ |
|---|---|---|
| `requireAuth` | ไม่มี token, token ผิด/หมดอายุ, บัญชีถูกปิด | 401 `UNAUTHORIZED` |
| `requireRole('admin')` / `requireAdmin` | ไม่ใช่แอดมิน | 403 `FORBIDDEN` |
| `requireRole('owner')` | ไม่ใช่เจ้าของร้าน | 403 `FORBIDDEN` |
| `requireVerified` | ยังไม่ยืนยันอีเมล | 403 `EMAIL_NOT_VERIFIED` |

- **เป็นแอดมิน = มีแถวในตาราง `admin`** (BR-30) ระดับดูจาก `admin.admin_role` (`owner` / `staff`) ไม่ได้ดูจาก `user.role`
- สิทธิ์และสถานะบัญชีอ่านจากฐานข้อมูลใหม่ทุก request ปิดบัญชีหรือถอดสิทธิ์แอดมินแล้วมีผลทันที
- token มีอายุ 8 ชั่วโมง (ตั้งได้ที่ `JWT_EXPIRES_IN`) หมดแล้วต้องล็อกอินใหม่

ฝั่งหน้าเว็บ หน้าแอดมินใส่ตัวกันบรรทัดบนสุด (ไม่ใช่แอดมินจะถูกส่งไป `/login`)

```js
import { requireAdminPage } from '../admin-guard.js';
const me = await requireAdminPage();
```

### บัญชีทดสอบ (seed `002_users.sql`)

| username | รหัสผ่าน | เป็นอะไร |
|---|---|---|
| `owner` | `Owner@1234` | แอดมิน · เจ้าของร้าน |
| `staff` | `Staff@1234` | แอดมิน · ทีมงาน |
| `customer` | `Customer@1234` | ลูกค้า ยืนยันอีเมลแล้ว |
| `newbie` | `Newbie@1234` | ลูกค้า ยังไม่ยืนยันอีเมล |
| `banned` | `Banned@1234` | ลูกค้า ถูกปิดบัญชี |

### `POST /auth/login`

```json
{ "username": "owner", "password": "Owner@1234" }
```

ตอบ 200

```json
{
  "data": {
    "token": "eyJhbGciOi...",
    "user": {
      "user_id": 1,
      "username": "owner",
      "email": "owner@maison-de-relic.test",
      "display_name": "เจ้าของร้าน",
      "is_email_verified": true,
      "is_admin": true,
      "admin_role": "owner"
    }
  }
}
```

- ลูกค้าก็ล็อกอินผ่าน endpoint นี้ได้ (`is_admin: false`, `admin_role: null`) หน้า `/login` ของแอดมินจะไม่ยอมให้ลูกค้าเข้า
- ออกจากระบบ: หน้าเว็บลบ token ทิ้งเอง (`auth.clear()`) ไม่ต้องเรียก API

| error | เมื่อ |
|---|---|
| 400 `VALIDATION_ERROR` | ไม่กรอก username หรือ password หรือยาวเกิน 100 ตัวอักษร |
| 401 `INVALID_CREDENTIALS` | ไม่มี username นี้ หรือรหัสผ่านผิด (ข้อความเดียวกัน ไม่บอกว่าผิดช่องไหน) |
| 403 `ACCOUNT_DISABLED` | รหัสถูก แต่บัญชีถูกปิด (`is_active = false`) |

### `GET /auth/me`

ต้องส่ง token ตอบ `{ "data": { ...user } }` รูปเดียวกับ `user` ใน login ใช้เช็กว่า token ยังใช้ได้และเป็นแอดมินไหม

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
