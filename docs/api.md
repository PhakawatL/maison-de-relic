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
- ข้อมูลเดียวกันที่ลูกค้าเห็นแค่ของตัวเอง แต่ผู้ดูแลเห็นทั้งหมด ให้แยก URL ฝั่งผู้ดูแลไว้ใต้ `/admin/` เช่น ลูกค้า `GET /support-tickets` (เคสของตัวเอง) · ผู้ดูแล `GET /admin/support-tickets` (ทุกเคส) จะได้ใส่ตัวกันสิทธิ์ทีเดียวทั้ง router

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
{ "data": { "product_id": 12, "title": "RX-78-2 Gundam Ver.Ka" } }
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
| 429 | เรียกถี่เกิน (`details.retry_after` = ต้องรออีกกี่วินาที) | `TOO_MANY_REQUESTS` |
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
| POST | `/auth/register` | - | R2 | สมัครสมาชิก ได้ token + ส่ง OTP ทางอีเมล |
| POST | `/auth/verify-email` | ✓ | R2 | ยืนยันอีเมลด้วยรหัส OTP 6 หลัก |
| POST | `/auth/resend-otp` | ✓ | R2 | ขอรหัส OTP ใหม่ (ทุก 60 วินาที) |
| POST | `/auth/forgot-password` | - | R2 | ส่งลิงก์ตั้งรหัสผ่านใหม่ทางอีเมล |
| POST | `/auth/reset-password` | - | R2 | ตั้งรหัสผ่านใหม่ด้วย token จากลิงก์ |
| GET | `/profile` | ✓ | R2 | โปรไฟล์ของตัวเอง |
| PATCH | `/profile` | ✓ ยืนยันอีเมลแล้ว | R2 | แก้ชื่อ เบอร์ รูปโปรไฟล์ |
| PUT | `/profile/password` | ✓ ยืนยันอีเมลแล้ว | R2 | เปลี่ยนรหัสผ่าน (ได้ token ใหม่) |
| GET | `/admins` | แอดมิน | R2 | รายชื่อผู้ดูแล ค้นหา/กรองสถานะ/แบ่งหน้า |
| GET | `/admins/:id` | แอดมิน | R2 | ผู้ดูแล 1 คน |
| POST | `/admins` | owner | R2 | เพิ่มผู้ดูแล |
| PATCH | `/admins/:id` | owner | R2 | แก้ข้อมูล / ระดับ / รหัสผ่าน / เปิดบัญชีคืน |
| DELETE | `/admins/:id` | owner | R2 | ปิดบัญชี (`is_active = false` ไม่ลบจริง) |
| GET | `/customers` | แอดมิน | R2 | รายชื่อลูกค้า ค้นหา/กรองสถานะ/แบ่งหน้า |
| GET | `/customers/:id` | แอดมิน | R2 | ลูกค้า 1 คน |
| PATCH | `/customers/:id` | แอดมิน (แก้ข้อมูล: owner) | R2 | เปิดบัญชีคืน / แก้ชื่อ อีเมล เบอร์ |
| DELETE | `/customers/:id` | แอดมิน | R2 | ปิดบัญชีลูกค้า (`is_active = false` ไม่ลบจริง) |
| GET | `/addresses` | ✓ | R2 | ที่อยู่จัดส่งของตัวเอง (ที่อยู่หลักขึ้นก่อน) |
| GET | `/addresses/:id` | ✓ | R2 | ที่อยู่ 1 ที่ของตัวเอง |
| POST | `/addresses` | ✓ ยืนยันอีเมลแล้ว | R2 | เพิ่มที่อยู่ |
| PATCH | `/addresses/:id` | ✓ ยืนยันอีเมลแล้ว | R2 | แก้ที่อยู่ / ตั้งเป็นที่อยู่หลัก |
| DELETE | `/addresses/:id` | ✓ ยืนยันอีเมลแล้ว | R2 | ลบที่อยู่ |
| GET | `/products` | - | R3 | รายการสินค้าที่ขายอยู่ ค้นหา/กรอง/เรียง/แบ่งหน้า (ดูรายละเอียดด้านล่าง) |
| GET | `/products/:id` | - | R3 | สินค้า 1 ชิ้นพร้อมรูปทั้งหมด |
| GET | `/categories` | - | R3 | หมวดหมู่ทั้งหมด พร้อมจำนวนสินค้าที่ขายอยู่ |
| GET | `/series` | - | R3 | ซีรีส์ทั้งหมด พร้อมจำนวนสินค้าที่ขายอยู่ |
| GET | `/wishlist` | ✓ | R1 | สินค้าที่ถูกใจของตัวเอง (ล่าสุดขึ้นก่อน) |
| GET | `/wishlist/ids` | ✓ | R1 | รหัสสินค้าที่ถูกใจ ไว้ระบายสีปุ่มหัวใจ |
| POST | `/wishlist` | ✓ ยืนยันอีเมลแล้ว | R1 | เพิ่มสินค้าเข้า wishlist |
| DELETE | `/wishlist/:productId` | ✓ ยืนยันอีเมลแล้ว | R1 | เอาสินค้าออกจาก wishlist |
| GET | `/support-tickets` | ✓ | R1 | เคสแจ้งปัญหาของตัวเอง (ล่าสุดขึ้นก่อน) |
| GET | `/support-tickets/:id` | ✓ | R1 | เคสของตัวเอง 1 เคส พร้อมคำตอบจากร้าน |
| POST | `/support-tickets` | ✓ ยืนยันอีเมลแล้ว | R1 | แจ้งปัญหา หรือรายงานสินค้า |
| GET | `/admin/support-tickets` | แอดมิน | R1 | ทุกเคส ค้นหา/กรองหมวด สถานะ ผู้รับผิดชอบ + จำนวนแต่ละสถานะ |
| GET | `/admin/support-tickets/assignees` | แอดมิน | R1 | ผู้ดูแลที่เลือกเป็นผู้รับผิดชอบเคสได้ |
| GET | `/admin/support-tickets/:id` | แอดมิน | R1 | เคส 1 เคสพร้อมผู้แจ้งและคำสั่งซื้อที่อ้างถึง |
| PATCH | `/admin/support-tickets/:id` | แอดมิน | R1 | ตอบกลับ / เปลี่ยนสถานะ / มอบหมายผู้รับผิดชอบ |
| DELETE | `/admin/support-tickets/:id` | owner | R1 | ลบเคส |
| GET | `/products/:productId/reviews` | - | R1 | รีวิวของสินค้า + สรุปคะแนน (กรองตามดาวได้) |
| GET | `/reviews/reviewable` | ✓ | R1 | สินค้าที่ได้รับแล้วและยังไม่ได้รีวิว |
| GET | `/reviews/mine` | ✓ | R1 | รีวิวที่ตัวเองเขียนไว้ |
| POST | `/reviews` | ✓ ยืนยันอีเมลแล้ว | R1 | เขียนรีวิวสินค้า 1 รายการในคำสั่งซื้อ |
| GET | `/refund-requests/refundable` | ✓ | R1 | สินค้าที่ยังขอคืนเงินได้ (ได้รับแล้วไม่เกิน 7 วัน) |
| GET | `/refund-requests` | ✓ | R1 | คำขอคืนเงินของตัวเอง |
| GET | `/refund-requests/:id` | ✓ | R1 | คำขอของตัวเอง 1 รายการ |
| POST | `/refund-requests` | ✓ ยืนยันอีเมลแล้ว | R1 | ขอคืนเงินสินค้า 1 รายการในคำสั่งซื้อ |
| GET | `/admin/refund-requests` | แอดมิน | R1 | ทุกคำขอ ค้นหา/กรองสถานะ + จำนวนแต่ละสถานะ |
| GET | `/admin/refund-requests/:id` | แอดมิน | R1 | คำขอ 1 รายการพร้อมคำสั่งซื้อ ลูกค้า สต็อก |
| PATCH | `/admin/refund-requests/:id` | แอดมิน | R1 | อนุมัติ / ไม่อนุมัติ / โอนเงินคืนแล้ว |
| GET | `/admin/action-logs` | owner | R1 | ประวัติการทำงานของผู้ดูแลทั้งร้าน ค้นหา/กรองผู้ดูแล การกระทำ ประเภท |
| POST | `/events` | - (มี token จะใส่ผู้ใช้ให้) | R4 | บันทึกพฤติกรรม view / click / wishlist / add_to_cart / purchase |
| GET | `/recommend/popular` | - | R4 | สินค้ายอดนิยม (ขายได้ + ถูกใจ + คะแนนรีวิว) |
| GET | `/recommend/related/:productId` | - | R4 | สินค้าที่เกี่ยวข้อง 8 ชิ้นที่ความหมายใกล้ที่สุด (embedding) |
| GET | `/recommend/for-you` | login | R4 | แนะนำสำหรับคุณ จากประวัติ event (ไม่มีประวัติ → ยอดนิยม) |
| GET | `/search/semantic?q=` | - | R4 | ค้นตามความหมายแบบผสม (ชื่อตรงก่อน + ความหมายใกล้) + ตัวกรอง |
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
- รีเซ็ตหรือเปลี่ยนรหัสผ่านแล้ว token เก่าทุกใบใช้ไม่ได้ทันที (`user.tokens_valid_after`) = ออกจากระบบทุกเครื่อง

ฝั่งหน้าเว็บ หน้าที่ต้องล็อกอินใส่ตัวกันบรรทัดบนสุด (ยังไม่ล็อกอินจะถูกส่งไป `/login?next=<หน้านี้>` แล้วกลับมาหลังล็อกอิน)

```js
import { requireLoginPage, requireAdminPage } from '../auth-guard.js';
const me = await requireLoginPage();   // หน้าลูกค้า เช่น ตะกร้า, wishlist, ประวัติการซื้อ
const me = await requireAdminPage();   // หน้าแอดมิน
if (!me.is_email_verified) { /* ยังไม่ยืนยันอีเมล: ซ่อนปุ่มที่เขียนข้อมูล หรือพาไป /verify-email */ }
```

เมนูใน header (`js/layout.js`) เปลี่ยนตามคนที่ล็อกอิน: ยังไม่ล็อกอินเห็นปุ่มเข้าสู่ระบบ / สมัครสมาชิก · ลูกค้าเห็นเมนูใน `CUSTOMER_NAV` · แอดมินเห็น `ADMIN_NAV` เพิ่ม · หน้าใหม่ของลูกค้า (wishlist, ตะกร้า, ประวัติการซื้อ) ให้เพิ่มลิงก์ใน `CUSTOMER_NAV` · ถ้าหน้าไหนต้องรู้ว่าใครล็อกอินอยู่แต่ไม่บังคับล็อกอิน ใช้ `getMe()` จาก `auth-guard.js` (ได้ `null` ถ้ายังไม่ล็อกอิน และยิง API ครั้งเดียวร่วมกับ header)

### บัญชีทดสอบ (seed `002_users.sql`)

| username | รหัสผ่าน | เป็นอะไร |
|---|---|---|
| `Neptz` | `Neptz@1234` | แอดมิน · เจ้าของร้าน (owner) |
| `SuphawitBonus` | `SuphawitBonus@1234` | แอดมิน · เจ้าของร้าน (owner) |
| `staff` | `Staff@1234` | แอดมิน · ทีมงาน (staff) ดูรายชื่อผู้ดูแลได้อย่างเดียว · ปิด/เปิดบัญชีลูกค้าได้ |
| `tain` | `tain@1234` | แอดมิน · ทีมงาน (staff) |
| `oicnssw` | `oicnssw@1234` | แอดมิน · ทีมงาน (staff) |
| `PhakawatL` | `PhakawatL@1234` | แอดมิน · ทีมงาน (staff) |
| `customer` | `Customer@1234` | ลูกค้า ยืนยันอีเมลแล้ว มีที่อยู่ 2 ที่ (seed `003_addresses.sql`) |
| `newbie` | `Newbie@1234` | ลูกค้า ยังไม่ยืนยันอีเมล |
| `banned` | `Banned@1234` | ลูกค้า ถูกปิดบัญชี |

- username ตัวพิมพ์ใหญ่/เล็กต้องตรง (`Neptz` ไม่ใช่ `neptz`)
- seed แต่ละไฟล์รันครั้งเดียว (จดชื่อไฟล์ไว้ในตาราง `schema_seeds`) — ถ้าเคยเปิดระบบมาก่อนแล้วไม่เห็นบัญชีใหม่ ให้ `docker compose down -v` แล้ว `docker compose up --build`
- อีเมลทุกบัญชีเป็นโดเมน `.test` และไม่มีเบอร์โทร — repo นี้เป็น public ห้ามใส่ข้อมูลติดต่อจริงลง seed

### `POST /auth/login`

```json
{ "username": "Neptz", "password": "Neptz@1234" }
```

ตอบ 200

```json
{
  "data": {
    "token": "eyJhbGciOi...",
    "user": {
      "user_id": 1,
      "username": "Neptz",
      "email": "neptz@maison-de-relic.test",
      "display_name": "Neptz",
      "is_email_verified": true,
      "is_admin": true,
      "admin_role": "owner"
    }
  }
}
```

- แอดมินและลูกค้าใช้ endpoint และหน้า `/login` เดียวกัน: แอดมินไป `/admin/products` · ลูกค้าที่ยังไม่ยืนยันอีเมลไป `/verify-email` · ลูกค้าไปหน้าใน `?next=` หรือหน้าแรก
- ผู้ใช้ที่ยังไม่ยืนยันอีเมลล็อกอินได้ (`is_email_verified: false`) แต่เขียนข้อมูลไม่ได้จนกว่าจะยืนยัน
- ออกจากระบบ: หน้าเว็บลบ token ทิ้งเอง (`auth.clear()`) ไม่ต้องเรียก API

| error | เมื่อ |
|---|---|
| 400 `VALIDATION_ERROR` | ไม่กรอก username หรือ password หรือยาวเกิน 100 ตัวอักษร |
| 401 `INVALID_CREDENTIALS` | ไม่มี username นี้ หรือรหัสผ่านผิด (ข้อความเดียวกัน ไม่บอกว่าผิดช่องไหน) |
| 403 `ACCOUNT_DISABLED` | รหัสถูก แต่บัญชีถูกปิด (`is_active = false`) |
| 429 `TOO_MANY_REQUESTS` | ล็อกอินไม่สำเร็จเกิน 10 ครั้งใน 15 นาทีจาก IP เดียวกัน (ดู [จำกัดจำนวนครั้ง](#จำกัดจำนวนครั้ง-rate-limit)) |

### จำกัดจำนวนครั้ง (rate limit)

กันเดารหัสผ่านและกันใช้ระบบยิงอีเมลใส่คนอื่น นับต่อ IP แยกแต่ละ endpoint (`src/middleware/rateLimit.js`)

| endpoint | ได้กี่ครั้ง | นับครั้งไหน |
|---|---|---|
| `POST /auth/login` | 10 ครั้ง / 15 นาที | เฉพาะที่ไม่สำเร็จ (ล็อกอินถูกไม่นับ) |
| `POST /auth/register` | 10 ครั้ง / 1 ชั่วโมง | ทุกครั้ง |
| `POST /auth/forgot-password` | 5 ครั้ง / 15 นาที | ทุกครั้ง |
| `POST /auth/reset-password` | 10 ครั้ง / 15 นาที | เฉพาะที่ไม่สำเร็จ |

- เกินแล้วได้ 429 `TOO_MANY_REQUESTS` พร้อม `details.retry_after` (วินาที) และ header `Retry-After` · ครบเวลาแล้วนับใหม่
- นับในหน่วยความจำของ API: รีสตาร์ต API (`docker compose restart api`) = ล้างตัวนับ ใช้ตอนทดลองแล้วล็อกตัวเองออก
- `RATE_LIMIT=off` ปิดได้ · `npm test` ปิดไว้ให้ (`test/setup.js`) ยกเว้น `test/rate-limit.test.js`
- ถ้าวาง API หลัง reverse proxy ต้องตั้ง `TRUST_PROXY` (เช่น `1`) ไม่อย่างนั้นทุกคนได้ IP ของ proxy แล้วโดนนับรวมกัน

### `GET /auth/me`

ต้องส่ง token ตอบ `{ "data": { ...user } }` รูปเดียวกับ `user` ใน login ใช้เช็กว่า token ยังใช้ได้และเป็นแอดมินไหม

---

## สมัครสมาชิก · ยืนยันอีเมล · ลืมรหัสผ่าน (R2)

หน้าเว็บ: `/register` → `/verify-email` · `/forgot-password` → (ลิงก์ในอีเมล) `/reset-password` · `/profile`

### การส่งอีเมล

ตั้งค่าในไฟล์ `.env` ที่ root ของโปรเจกต์ (ข้าง `docker-compose.yml`) แล้ว `docker compose up` ใหม่

```
MAIL_USER=your-shop@gmail.com
MAIL_APP_PASSWORD=รหัส 16 ตัวจาก https://myaccount.google.com/apppasswords
MAIL_FROM="Maison de Relic <your-shop@gmail.com>"
```

- App Password ต้องเปิด 2-Step Verification ของบัญชี Google ก่อน (ใช้รหัสผ่าน Gmail ปกติไม่ได้)
- **ถ้าไม่ตั้ง** API จะไม่ส่งอีเมลจริง แต่พิมพ์อีเมล (รวมรหัส OTP และลิงก์รีเซ็ต) ไว้ใน log แทน ดูได้ด้วย `docker compose logs -f api` แล้วหาบรรทัด `[อีเมล]` — ทุกคนในทีมทดสอบ flow สมัครได้โดยไม่ต้องมี Gmail
- บน production (`NODE_ENV=production`) ถ้าไม่ตั้งจะไม่พิมพ์ลง log (กันรหัสของลูกค้าจริงหลุด) API ตอบ `email_sent: false` แทน
- test ไม่ส่งอีเมลจริง (`mailer.captureForTests()` เก็บไว้ใน `mailer.outbox`)

### `POST /auth/register`

```json
{
  "username": "somchai",
  "email": "somchai@example.com",
  "password": "อย่างน้อย 8 ตัว",
  "first_name": "สมชาย",
  "last_name": "ใจดี",
  "display_name": "สมชาย",
  "phone": "081-234-5678"
}
```

- บังคับ: `username`, `email`, `password`, `first_name`, `last_name` · กติกาเดียวกับหน้าจัดการผู้ดูแล
- ตอบ 201 `{ "data": { "token", "user", "email_sent", "otp_expires_at" } }` — ล็อกอินให้เลย (`is_email_verified: false`) และส่ง OTP ไปที่อีเมล
- `email_sent: false` = ส่งอีเมลไม่สำเร็จ ให้กดขอรหัสใหม่
- อีเมลนี้มีบัญชีที่**ยังไม่ยืนยัน**อยู่ → เขียนทับแถวเดิม (คนที่สมัครค้างไว้สมัครใหม่ได้) และ token เก่าของแถวนั้นใช้ไม่ได้
- สมัครทับภายใน 60 วินาทีหลังส่ง OTP ครั้งก่อน → 429 `TOO_MANY_REQUESTS` (`details.retry_after`) กันใช้หน้านี้ยิงอีเมลใส่คนอื่น
- อีเมลนี้ยืนยันแล้ว / username ซ้ำ → 409 `DUPLICATE` (`details[0].field` บอกช่อง)

### `POST /auth/verify-email` (ต้องล็อกอิน)

`{ "code": "042917" }` → 200 ตอบข้อมูลผู้ใช้ (`is_email_verified: true`) · ยืนยันแล้วกดซ้ำก็ได้ 200

- รหัสใช้ได้ 10 นาที กรอกผิดได้ 5 ครั้ง ใช้ได้เฉพาะรหัสล่าสุด

| error | เมื่อ |
|---|---|
| 400 `VALIDATION_ERROR` | ไม่ใช่ตัวเลข 6 หลัก |
| 400 `INVALID_OTP` | รหัสผิด (`details.remaining_attempts` = ลองได้อีกกี่ครั้ง) |
| 400 `OTP_EXPIRED` | หมดอายุ / ผิดครบ 5 ครั้ง / ยังไม่เคยขอรหัส → ต้องกดขอรหัสใหม่ |

### `POST /auth/resend-otp` (ต้องล็อกอิน)

ส่งรหัสใหม่ ตอบ `{ "data": { "otp_expires_at", "email_sent" } }` · ขอได้ทุก 60 วินาที

| error | เมื่อ |
|---|---|
| 409 `ALREADY_VERIFIED` | ยืนยันอีเมลแล้ว |
| 429 `TOO_MANY_REQUESTS` | ขอถี่เกิน (`details.retry_after` = ต้องรออีกกี่วินาที) |

### `POST /auth/forgot-password`

`{ "email": "somchai@example.com" }` → 200 ข้อความเดียวกันเสมอ ไม่ว่าจะมีอีเมลนี้หรือไม่ (กันคนใช้หน้านี้เช็กว่าใครเป็นสมาชิก)

- ถ้ามีบัญชีที่ใช้งานอยู่ ส่งลิงก์ `<APP_URL>/reset-password?token=...` ใช้ได้ 30 นาที ครั้งเดียว · ขอซ้ำภายใน 60 วินาทีจะไม่ส่งอีเมลซ้ำ

### `POST /auth/reset-password`

`{ "token": "จากลิงก์", "password": "รหัสใหม่" }` → 200

- สำเร็จแล้ว: ลิงก์อื่นทุกอันที่ยังไม่ใช้ใช้ไม่ได้ · token เก่าทุกใบใช้ไม่ได้ · ถือว่ายืนยันอีเมลแล้ว (กดลิงก์จากอีเมลได้ = เป็นเจ้าของอีเมล)
- token ผิด / หมดอายุ / ใช้แล้ว → 400 `INVALID_RESET_TOKEN`

---

## โปรไฟล์ (R2)

ข้อมูลของผู้ใช้ที่ล็อกอินอยู่ · ดูได้แค่ล็อกอิน · แก้ไข / เปลี่ยนรหัสผ่าน ต้องยืนยันอีเมลแล้ว (403 `EMAIL_NOT_VERIFIED`)

### `GET /profile`

```json
{
  "data": {
    "user_id": 3, "username": "customer", "email": "customer@maison-de-relic.test",
    "first_name": "สมชาย", "last_name": "ใจดี", "display_name": "สมชาย",
    "phone": null, "avatar_url": null, "is_email_verified": true, "created_at": "..."
  }
}
```

### `PATCH /profile`

ส่งเฉพาะช่องที่จะแก้: `first_name`, `last_name`, `display_name`, `phone`, `avatar_url` (ลิงก์ http/https) · ส่ง `""` ในช่องที่ไม่บังคับ = ลบค่า · แก้ `email` / `username` ที่นี่ไม่ได้ · ตอบ 200 พร้อมข้อมูลล่าสุด

### `PUT /profile/password`

`{ "current_password": "...", "new_password": "..." }` → 200 `{ "data": { "token" } }`

- รหัสปัจจุบันผิด → 400 `WRONG_PASSWORD`
- สำเร็จแล้ว token เก่าทุกใบ (ทุกเครื่อง) ใช้ไม่ได้ หน้าเว็บต้องเก็บ `token` ใบใหม่ที่ได้กลับมาแทน

---

## จัดการผู้ดูแล (R2)

ใช้กับหน้า `admin/users` · ผู้ดูแล = ผู้ใช้ที่มีแถวในตาราง `admin`

- แอดมินทุกคน (owner และ staff) ดูรายชื่อได้
- เพิ่ม / แก้ / ปิดบัญชีได้เฉพาะ **owner** (staff ได้ 403 `FORBIDDEN`)
- owner เปลี่ยนระดับหรือปิดบัญชี**ของตัวเอง**ไม่ได้ (409 `CANNOT_CHANGE_SELF`) ร้านจึงมี owner ที่ใช้งานได้อย่างน้อย 1 คนเสมอ
- ทุกการเพิ่ม / แก้ / ปิด / เปิดบัญชี บันทึกลง `admin_action_log` (BR-31) ด้วย `action_type` = `create_admin`, `update_admin`, `deactivate_admin`, `reactivate_admin` และ `target_type = 'user'`

ข้อมูลผู้ดูแล 1 คน (ไม่มี `password_hash`)

```json
{
  "user_id": 6,
  "username": "somchai",
  "email": "somchai@example.com",
  "first_name": "สมชาย",
  "last_name": "ใจดี",
  "display_name": "สมชาย",
  "phone": "081-234-5678",
  "admin_role": "staff",
  "is_active": true,
  "granted_at": "2026-10-15T05:00:00.000Z",
  "created_at": "2026-10-15T05:00:00.000Z"
}
```

### `GET /admins`

| query | ค่า | ค่าเริ่มต้น |
|---|---|---|
| `q` | ค้นใน username, อีเมล, ชื่อ, นามสกุล, ชื่อที่แสดง (ไม่เกิน 100 ตัวอักษร) | - |
| `status` | `all`, `active`, `inactive` | `all` |
| `page`, `pageSize` | หน้าที่ (เริ่ม 1) และจำนวนต่อหน้า (สูงสุด 50) | 1, 20 |

ตอบ `{ "data": [ ... ], "meta": { "page", "pageSize", "total" } }` เรียงคนที่ใช้งานอยู่ก่อน → owner ก่อน staff → username

### `POST /admins` (owner)

```json
{
  "username": "somchai",
  "email": "somchai@example.com",
  "password": "อย่างน้อย 8 ตัว",
  "first_name": "สมชาย",
  "last_name": "ใจดี",
  "display_name": "สมชาย",
  "phone": "081-234-5678",
  "admin_role": "staff"
}
```

- บังคับ: `username` (a-z, A-Z, 0-9, `_`, `.` ยาว 3–30), `email`, `password` (8–100), `first_name`, `last_name`
- ไม่บังคับ: `display_name` (ไม่ใส่ = ใช้ชื่อจริง), `phone`, `admin_role` (ไม่ใส่ = `staff`)
- อีเมลถูกแปลงเป็นตัวพิมพ์เล็ก · บัญชีที่แอดมินสร้างถือว่ายืนยันอีเมลแล้ว
- ตอบ 201 พร้อมข้อมูลผู้ดูแล

### `PATCH /admins/:id` (owner)

ส่งเฉพาะช่องที่จะแก้: `email`, `first_name`, `last_name`, `display_name`, `phone` (ส่ง `""` = ลบเบอร์), `password` (ตั้งรหัสใหม่), `admin_role`, `is_active` (`true` = เปิดบัญชีคืน) · เปลี่ยน `username` ไม่ได้ · ตอบ 200 พร้อมข้อมูลล่าสุด

### `DELETE /admins/:id` (owner)

ปิดบัญชี (`is_active = false`) ตอบ 204 · คนนั้นล็อกอินไม่ได้และ token เดิมใช้ไม่ได้ทันที · ปิดซ้ำได้ไม่ error

| error | เมื่อ |
|---|---|
| 400 `VALIDATION_ERROR` | ข้อมูลไม่ครบหรือผิดรูปแบบ (`details` บอกทุกช่องที่ผิด) |
| 400 `INVALID_ID` | id ไม่ใช่จำนวนเต็มบวก |
| 403 `FORBIDDEN` | ไม่ใช่ owner (สำหรับ POST / PATCH / DELETE) |
| 404 `ADMIN_NOT_FOUND` | ไม่มีผู้ใช้นี้ หรือเป็นลูกค้า ไม่ใช่ผู้ดูแล |
| 409 `DUPLICATE` | username หรืออีเมลซ้ำ (`details[0].field` บอกช่อง) |
| 409 `CANNOT_CHANGE_SELF` | เปลี่ยนระดับ / ปิดบัญชีของตัวเอง |

---

## จัดการลูกค้า (R2)

ใช้กับหน้า `admin/customers` (ตารางลูกค้า แยกจากตารางผู้ดูแลที่ `admin/users`) · ลูกค้า = ผู้ใช้ที่**ไม่มี**แถวในตาราง `admin`

- แอดมินทุกคน (owner และ staff) ดูรายชื่อ ปิดบัญชี และเปิดบัญชีคืนได้
- แก้ข้อมูลลูกค้า (ชื่อ อีเมล เบอร์) ได้เฉพาะ **owner** (staff ได้ 403 `FORBIDDEN`)
- ไม่มี `POST`: ลูกค้าสมัครเองที่ `/auth/register` · ไม่มีการตั้งรหัสผ่านให้ลูกค้า ลูกค้าใช้ `/auth/forgot-password` เอง
- ทุกการแก้ / ปิด / เปิดบัญชี บันทึกลง `admin_action_log` (BR-31) ด้วย `action_type` = `update_user`, `deactivate_user`, `reactivate_user` และ `target_type = 'user'`

ข้อมูลลูกค้า 1 คน (ไม่มี `password_hash`)

```json
{
  "user_id": 7,
  "username": "customer",
  "email": "customer@maison-de-relic.test",
  "first_name": "สมชาย",
  "last_name": "ใจดี",
  "display_name": "สมชาย",
  "phone": null,
  "is_email_verified": true,
  "is_active": true,
  "created_at": "2026-10-15T05:00:00.000Z"
}
```

### `GET /customers`

query เหมือน `GET /admins` (`q`, `status`, `page`, `pageSize`) · ตอบ `{ "data": [ ... ], "meta": { "page", "pageSize", "total" } }` เรียงคนที่ใช้งานอยู่ก่อน → สมัครล่าสุดก่อน

### `PATCH /customers/:id`

ส่งเฉพาะช่องที่จะแก้: `is_active` (`true` = เปิดบัญชีคืน · แอดมินทุกคน) และ `email`, `first_name`, `last_name`, `display_name`, `phone` (ส่ง `""` = ลบเบอร์ · owner เท่านั้น) · เปลี่ยน `username` ไม่ได้ · ตอบ 200 พร้อมข้อมูลล่าสุด

เปลี่ยนอีเมล → `is_email_verified` กลับเป็น `false` ลูกค้าต้องยืนยันอีเมลใหม่ (ขอ OTP ใหม่ได้ที่หน้ายืนยันอีเมล)

### `DELETE /customers/:id`

ปิดบัญชี (`is_active = false`) ตอบ 204 · ลูกค้าล็อกอินไม่ได้และ token เดิมใช้ไม่ได้ทันที · ปิดซ้ำได้ไม่ error

| error | เมื่อ |
|---|---|
| 400 `VALIDATION_ERROR` | ข้อมูลผิดรูปแบบหรือไม่มีอะไรให้แก้ (`details` บอกทุกช่องที่ผิด) |
| 400 `INVALID_ID` | id ไม่ใช่จำนวนเต็มบวก |
| 403 `FORBIDDEN` | ไม่ใช่แอดมิน หรือ staff พยายามแก้ข้อมูลลูกค้า |
| 404 `CUSTOMER_NOT_FOUND` | ไม่มีผู้ใช้นี้ หรือเป็นผู้ดูแล ไม่ใช่ลูกค้า |
| 409 `DUPLICATE` | อีเมลซ้ำกับบัญชีอื่น |

---

## ที่อยู่จัดส่ง (R2)

ทำกับที่อยู่ของ**ตัวเอง**เท่านั้น (ผู้ใช้จาก token) ที่อยู่ของคนอื่นตอบ 404 เหมือนไม่มีอยู่ · ดูได้แค่ล็อกอิน ส่วนเพิ่ม / แก้ / ลบ ต้องยืนยันอีเมลแล้ว (403 `EMAIL_NOT_VERIFIED`)

ที่อยู่หลัก (`is_default`) มีได้คนละหนึ่งที่:

- ที่อยู่แรกเป็นที่อยู่หลักให้อัตโนมัติ
- ตั้งที่อยู่ไหนเป็นหลัก (`is_default: true`) อันเดิมถูกยกเลิกให้เอง
- ลบที่อยู่หลัก → ที่อยู่ที่เพิ่มล่าสุดที่เหลือกลายเป็นหลักแทน
- ลบที่อยู่ที่ออเดอร์เก่าเคยใช้ได้ ออเดอร์ไม่กระทบเพราะคัดลอกที่อยู่ไว้ใน `ship_*` แล้ว

```json
{
  "address_id": 7,
  "label": "บ้าน",
  "recipient_name": "สมชาย ใจดี",
  "phone": "081-234-5678",
  "line1": "99/1 ถนนพุทธมณฑลสาย 4",
  "district": "ศาลายา",
  "province": "นครปฐม",
  "postcode": "73170",
  "is_default": true
}
```

### `GET /addresses`

ตอบ `{ "data": [ ... ] }` ไม่แบ่งหน้า เรียงที่อยู่หลักก่อน แล้วตามด้วยที่เพิ่มล่าสุด · หน้า checkout ใช้ `data[0]` เป็นค่าเริ่มต้นได้เลย (ถ้า `data` ว่าง = ยังไม่มีที่อยู่ ให้พาไปเพิ่มก่อน)

### `POST /addresses`

- บังคับ: `recipient_name` (≤100), `phone` (ตัวเลข `+` `-` เว้นวรรค 9–20 ตัว), `line1` (≤255), `district`, `province` (≤100), `postcode` (ตัวเลข 5 หลัก)
- ไม่บังคับ: `label` ชื่อเรียก เช่น บ้าน / ที่ทำงาน (≤50), `is_default`
- ตอบ 201 พร้อมที่อยู่ที่เพิ่ม

### `PATCH /addresses/:id`

ส่งเฉพาะช่องที่จะแก้ · `label: ""` = ลบชื่อเรียก · `is_default` ส่งได้แค่ `true` (จะเปลี่ยนที่อยู่หลักให้ตั้งที่อื่นเป็นหลักแทน) · ตอบ 200

### `DELETE /addresses/:id`

ตอบ 204

| error | เมื่อ |
|---|---|
| 400 `VALIDATION_ERROR` | ข้อมูลไม่ครบหรือผิดรูปแบบ (`details` บอกทุกช่องที่ผิด) |
| 400 `INVALID_ID` | id ไม่ใช่จำนวนเต็มบวก |
| 403 `EMAIL_NOT_VERIFIED` | ยังไม่ยืนยันอีเมล (เพิ่ม / แก้ / ลบ) |
| 404 `ADDRESS_NOT_FOUND` | ไม่มีที่อยู่นี้ หรือเป็นของคนอื่น |

### สำหรับ R5: ใช้ที่อยู่ตอน checkout

ไม่ต้องเรียก API ซ้ำ เรียก service ตรงใน transaction ของ checkout ได้เลย

```js
const addresses = require('../users/addresses.service');

await withTransaction(async (client) => {
  const address = await addresses.getForUser(req.user.user_id, addressId, client);
  if (!address) throw AppError.notFound('ADDRESS_NOT_FOUND', 'ไม่พบที่อยู่นี้'); // ไม่ใช่ของผู้ซื้อก็ได้ null
  const ship = addresses.toShippingSnapshot(address);
  // ship = { ship_name, ship_phone, ship_line1, ship_district, ship_province, ship_postcode }
  // INSERT INTO "order" (user_id, address_id, ship_name, ...) VALUES (..., address.address_id, ship.ship_name, ...)
});
```

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
      "avg_rating": 4.5,
      "review_count": 2,
      "created_at": "2026-10-14T01:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 1 }
}
```

- `series` เป็น `null` ได้ถ้าสินค้าไม่อยู่ในซีรีส์ไหน
- `avg_rating` (คะแนนรีวิวเฉลี่ย 1.0–5.0) เป็น `null` ถ้ายังไม่มีรีวิว · `review_count` = จำนวนรีวิว (มาจากตาราง `review` ของ R1 ดูหัวข้อรีวิวด้านล่าง)
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

---

## Wishlist (R1)

ทุก route ต้องล็อกอิน และทำกับ wishlist ของตัวเองเท่านั้น (ผู้ใช้มาจาก token ไม่ต้องส่ง `user_id`)
ดูได้ทันทีหลังล็อกอิน ส่วนเพิ่ม / เอาออกต้องยืนยันอีเมลแล้ว (ยังไม่ยืนยันได้ 403 `EMAIL_NOT_VERIFIED`)

- แสดงเฉพาะสินค้าที่วางขายอยู่ (`available`) ถ้าแอดมินซ่อนสินค้า สินค้าจะหายจากรายการ แต่ยังจำไว้ เปิดขายอีกครั้งก็กลับมาเอง
- สินค้าที่ของหมดยังแสดงอยู่ ดูได้จาก `in_stock: false`

### `GET /wishlist`

ได้สินค้ารูปเดียวกับ `GET /products` และเพิ่ม `added_at` (เวลาที่กดถูกใจ)

```json
{
  "data": [
    {
      "product_id": 12,
      "title": "RX-78-2 Gundam Ver.Ka",
      "price": 1500,
      "in_stock": true,
      "cover_image_url": "https://...",
      "category": { "category_id": 3, "name": "โมเดลพลาสติก", "slug": "model-kits" },
      "added_at": "2026-10-21T07:00:00.000Z"
    }
  ],
  "meta": { "total": 1 }
}
```

### `GET /wishlist/ids`

ได้แค่รหัสสินค้า ใช้ตอนวาดการ์ดสินค้าหลายใบ (หน้าแรก ค้นหา) ว่าใบไหนต้องเป็นหัวใจทึบ

```json
{ "data": [12, 7, 3] }
```

### `POST /wishlist`

```json
{ "product_id": 12 }
```

| ผล | เมื่อ |
|---|---|
| 201 + สินค้า | เพิ่มใหม่ |
| 200 + สินค้า | มีอยู่แล้ว (กดซ้ำไม่ error และ `added_at` ไม่เปลี่ยน) |
| 400 `VALIDATION_ERROR` | ไม่ส่ง `product_id` หรือไม่ใช่จำนวนเต็มบวก |
| 404 `PRODUCT_NOT_FOUND` | ไม่มีสินค้านี้ หรือยังไม่ได้วางขาย |

### `DELETE /wishlist/:productId`

ตอบ 204 เสมอ แม้สินค้านี้ไม่ได้อยู่ใน wishlist อยู่แล้ว (กดซ้ำหรือกดพร้อมกันสองแท็บก็ไม่ error)
รหัสใน URL ผิดรูปแบบได้ 400 `INVALID_ID`

### ปุ่มหัวใจในหน้าของตัวเอง (R3, R4)

ใช้ `frontend/js/wishlist-button.js` ได้เลย ไม่ต้องเรียก API เอง

```js
import { heartButton, setupHeartButtons } from '../wishlist-button.js';

// 1. ใส่ปุ่มในการ์ด/หน้าสินค้า
card.innerHTML = `... ${heartButton(product.product_id)} ...`;

// 2. เรียกครั้งเดียวหลังวาดการ์ดเสร็จ (เรียกซ้ำได้ตอนวาดใหม่)
setupHeartButtons(container);
```

- ยังไม่ล็อกอิน → กดแล้วพาไปหน้าเข้าสู่ระบบ แล้วกลับมาหน้าเดิม
- ยังไม่ยืนยันอีเมล → แสดงข้อความให้ไปยืนยันก่อน
- ปุ่มอยู่ใน `<a>` ของการ์ดได้ (กดหัวใจแล้วไม่เปิดหน้ารายละเอียด)

---

## แจ้งปัญหา · รายงานสินค้า (R1)

เคส 1 เคส = ลูกค้าแจ้งเรื่อง 1 เรื่อง (ตาราง `support_ticket` · BR-27–29) ผู้ดูแลตอบกลับได้ 1 ข้อความ และเปลี่ยนสถานะได้

| สถานะ | ความหมาย |
|---|---|
| `open` | รอดำเนินการ (ยังไม่มีใครทำ) |
| `pending` | กำลังดำเนินการ |
| `closed` | ปิดเคสแล้ว (`closed_at` = เวลาที่ปิด) |

| หมวด (`category`) | ใช้กับ |
|---|---|
| `not_as_described` ของไม่ตรงปก · `damaged` ของเสียหาย · `not_delivered` พัสดุไม่ถึง · `product_question` สอบถามสินค้า · `payment` การชำระเงิน · `account` บัญชีผู้ใช้ | แจ้งปัญหาทั่วไป |
| `counterfeit` สินค้าปลอม · `wrong_images` รูปไม่ตรงกับสินค้า · `misleading_price` ราคาหลอกลวง · `inappropriate` เนื้อหาไม่เหมาะสม | รายงานสินค้า |
| `other` อื่น ๆ | ทั้งสองแบบ |

หน้าเว็บแสดงชื่อหมวดจากคำแปล `support.cat.<category>` ใน `js/locales/*.js` (เก็บในฐานข้อมูลเป็นรหัสภาษาอังกฤษ)

### `POST /support-tickets`

แจ้งปัญหาทั่วไป (อ้างถึงคำสั่งซื้อของตัวเองได้ ไม่บังคับ)

```json
{ "subject": "กล่องบุบระหว่างขนส่ง", "category": "damaged", "body": "ได้รับของแล้วกล่องบุบ...", "order_id": 15 }
```

รายงานสินค้า (ปุ่ม "รายงานสินค้านี้" ในหน้า Detail) — ไม่ต้องส่ง `subject` ระบบตั้งเป็น `[P012] ชื่อสินค้า` ให้ · `body` ไม่บังคับ

```json
{ "product_id": 12, "category": "counterfeit", "body": "โลโก้บนกล่องไม่เหมือนของแท้" }
```

| ผล | เมื่อ |
|---|---|
| 201 + เคส | สำเร็จ |
| 400 `VALIDATION_ERROR` | หัวข้อสั้นกว่า 3 / ยาวเกิน 150 ตัวอักษร · ไม่มีรายละเอียด (เคสทั่วไป) · หมวดไม่อยู่ในรายการ |
| 404 `ORDER_NOT_FOUND` | `order_id` ไม่ใช่คำสั่งซื้อของตัวเอง |
| 404 `PRODUCT_NOT_FOUND` | ไม่มีสินค้านี้ หรือยังไม่ได้วางขาย |
| 429 `TOO_MANY_REQUESTS` | เปิดเคสเกิน 15 ครั้งต่อชั่วโมง (นับต่อผู้ใช้ · `details.retry_after` = วินาทีที่ต้องรอ) |

### `GET /support-tickets?status=&page=&pageSize=`

`status` = `all` (ค่าเริ่มต้น) / `open` / `pending` / `closed`

```json
{
  "data": [
    {
      "ticket_id": 12, "code": "TK012", "subject": "กล่องบุบระหว่างขนส่ง", "category": "damaged",
      "body": "...", "status": "pending", "admin_reply": "ขออภัยครับ ...", "order_id": 15,
      "created_at": "2026-10-24T03:00:00.000Z", "closed_at": null
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 1 }
}
```

### `GET /admin/support-tickets` (แอดมิน)

| query | ค่า |
|---|---|
| `q` | รหัสเคส (`TK012`) · ตัวเลข (รหัสเคสหรือเลขคำสั่งซื้อ) · คำในหัวข้อ / ชื่อผู้ใช้ / อีเมลของผู้แจ้ง |
| `category` | `all` หรือหมวดด้านบน |
| `status` | `all` / `open` / `pending` / `closed` |
| `assigned` | `all` / `me` (เคสที่ฉันรับผิดชอบ) / `unassigned` (ยังไม่มีคนรับ) |
| `page`, `pageSize` | ค่าเริ่มต้น 1 และ 20 (สูงสุด 50) |

ได้เคสเหมือนฝั่งลูกค้า และเพิ่ม `reporter` (ผู้แจ้ง) กับ `assignee` (ผู้รับผิดชอบ หรือ `null`) ส่วน `meta.counts` คือจำนวนเคสแต่ละสถานะตามเงื่อนไขอื่นที่เลือก (ใช้ทำตัวเลขบนแท็บ)

```json
{ "meta": { "page": 1, "pageSize": 20, "total": 7, "counts": { "open": 3, "pending": 2, "closed": 2 } } }
```

`GET /admin/support-tickets/:id` เพิ่ม `order` (สถานะ ยอดรวม เลขพัสดุของคำสั่งซื้อที่อ้างถึง หรือ `null`)

### `PATCH /admin/support-tickets/:id` (แอดมิน)

ส่งเฉพาะช่องที่จะแก้ อย่างน้อย 1 ช่อง

```json
{ "admin_reply": "ขออภัยครับ ส่งรูปกล่องมาที่อีเมลได้เลย", "status": "pending", "assigned_to": 3 }
```

- ตอบกลับเคสที่ยัง `open` โดยไม่ส่ง `status` → เปลี่ยนเป็น `pending` ให้เอง
- เคสที่ยังไม่มีผู้รับผิดชอบ แล้วผู้ดูแลตอบหรือเปลี่ยนสถานะ → ผู้ดูแลคนนั้นเป็นผู้รับผิดชอบให้เอง
- `assigned_to: null` = ยกเลิกผู้รับผิดชอบ · ต้องเป็นผู้ดูแลที่ใช้งานอยู่ (ดูรายชื่อจาก `GET /admin/support-tickets/assignees`)
- `admin_reply: ""` หรือ `null` = ลบคำตอบ
- บันทึก `admin_action_log` (`target_type = 'support_ticket'`) แยกตามเรื่อง: `reply_ticket`, `update_ticket_status`, `assign_ticket` · ลบเคส = `delete_ticket`

### บันทึกการกระทำของแอดมินใน module ของตัวเอง (BR-31)

ใช้ `logAdminAction` จาก `backend/src/modules/support/action-log.service.js` ใน transaction เดียวกับการเปลี่ยนข้อมูล

```js
const { logAdminAction } = require('../support/action-log.service');
await logAdminAction(client, { adminId: req.user.user_id, actionType: 'approve_refund', targetType: 'refund_request', targetId: 7, note: 'RF007: อนุมัติ' });
```

- `actionType` = กริยา_สิ่งที่ทำ ภาษาอังกฤษตัวเล็ก เช่น `create_product`, `restock_product` · `targetType` = ชื่อตาราง เช่น `product`
- log ขึ้นในหน้า `/admin/activity` ของ owner ทันที (ชื่อการกระทำที่ยังไม่มีคำแปลแสดงเป็นรหัสภาษาอังกฤษ — เพิ่มคำแปลได้ที่ `log.action.<actionType>` ใน `frontend/js/locales/*.js`)
- `targetType = 'product'` หน้า `/admin/activity` แสดงชื่อสินค้าและรหัส P012 ให้เอง

### `GET /admin/action-logs?q=&admin=&action=&target=&page=&pageSize=` (owner)

ประวัติการทำงานของผู้ดูแลทั้งร้าน ล่าสุดก่อน · staff ได้ 403 (staff ดูประวัติของคำขอ / เคสที่เปิดอยู่ได้จาก `history` ในหน้ารายละเอียดแทน)

- `q` = ข้อความใน note / ชื่อผู้ดูแล / ชื่อสิ่งที่ถูกเปลี่ยน · หรือรหัส `RF012` / `TK005` / `P012` (ตรงกับสิ่งนั้นเท่านั้น)
- `admin` = user_id ของผู้ดูแล · `action` = เช่น `approve_refund` · `target` = เช่น `refund_request` (ไม่ส่ง / `all` = ทั้งหมด)

```json
{ "data": [ { "log_id": 41, "action_type": "approve_refund", "target_type": "refund_request", "target_id": 12,
              "target_code": "RF012", "target_name": "RX-78-2 Gundam Ver.Ka", "note": "RF012: อนุมัติ · คืนเข้าสต็อก 1 ชิ้น",
              "created_at": "...", "admin": { "user_id": 2, "username": "Neptz", "display_name": "Neptz" } } ],
  "meta": { "page": 1, "pageSize": 20, "total": 57, "admins": [ ... ], "actions": [ ... ], "target_types": [ ... ] } }
```

`meta.admins` / `actions` / `target_types` = ค่าที่มีใน log ทั้งหมด ไว้ทำตัวเลือกของตัวกรอง

`GET /admin/support-tickets/:id` และ `GET /admin/refund-requests/:id` มี `history` = log ของเคส / คำขอนั้น (เก่าสุดก่อน รูปเดียวกับด้านบน)

---

## รีวิวสินค้า (R1)

รีวิว 1 รายการ = สินค้า 1 รายการในคำสั่งซื้อ (`order_item`) · BR-25, BR-26

- รีวิวได้เฉพาะคำสั่งซื้อของตัวเองที่ **ได้รับสินค้าแล้ว** (`current_status` = `delivered` หรือ `completed`)
- รีวิวซ้ำรายการเดิมไม่ได้ (409) · ยังไม่มีการแก้ไข/ลบรีวิว
- หน้าร้านแสดงชื่อผู้รีวิวแบบย่อ เช่น `สมชาย ก.` ไม่แสดงชื่อผู้ใช้ อีเมล หรือเลขคำสั่งซื้อ
- คะแนนเฉลี่ยของแต่ละสินค้าอยู่ในการ์ดสินค้าแล้ว (`avg_rating`, `review_count` ใน `GET /products`, `GET /products/:id`, `GET /wishlist`)

### `GET /products/:productId/reviews?rating=&page=&pageSize=`

`rating` = `all` (ค่าเริ่มต้น) หรือ `1`–`5` · `pageSize` ค่าเริ่มต้น 10 (สูงสุด 50)

```json
{
  "data": [
    { "review_id": 8, "product_id": 12, "rating": 5, "comment": "ตรงปก แพ็กมาดีมาก", "created_at": "2026-10-24T03:00:00.000Z", "reviewer": "สมชาย ก." }
  ],
  "meta": {
    "page": 1, "pageSize": 10, "total": 2,
    "summary": { "average": 4.5, "count": 2, "distribution": { "5": 1, "4": 1, "3": 0, "2": 0, "1": 0 } }
  }
}
```

สินค้าที่ไม่มี / ยังไม่วางขาย → 404 `PRODUCT_NOT_FOUND`

### `POST /reviews`

```json
{ "order_item_id": 31, "rating": 5, "comment": "ตรงปก แพ็กมาดีมาก" }
```

| ผล | เมื่อ |
|---|---|
| 201 + รีวิว | สำเร็จ |
| 400 `VALIDATION_ERROR` | `rating` ไม่ใช่ 1–5 · `comment` ยาวเกิน 1000 ตัวอักษร |
| 404 `ORDER_ITEM_NOT_FOUND` | ไม่ใช่สินค้าในคำสั่งซื้อของตัวเอง |
| 409 `ORDER_NOT_DELIVERED` | ยังไม่ได้รับสินค้า หรือคำสั่งซื้อถูกยกเลิก / คืนเงินแล้ว |
| 409 `ALREADY_REVIEWED` | รีวิวรายการนี้ไปแล้ว |
| 429 `TOO_MANY_REQUESTS` | เขียนรีวิวเกิน 30 ครั้งต่อชั่วโมง (นับต่อผู้ใช้) |

### `GET /reviews/reviewable`

ใช้ทำรายการ "รอรีวิว" — `title` คือชื่อสินค้า ณ วันที่ซื้อ (`order_item.title_snapshot`)

```json
{ "data": [ { "order_item_id": 31, "order_id": 15, "product_id": 12, "title": "RX-78-2 Gundam Ver.Ka", "quantity": 1, "cover_image_url": "https://...", "order_status": "delivered", "placed_at": "..." } ] }
```

### หน้าเว็บ

- เขียนรีวิว: ลิงก์ไป `/write-review?item=<order_item_id>` (หน้าคำสั่งซื้อของ R5 ใส่ปุ่มนี้ได้เลย) · เปิด `/write-review` เฉย ๆ จะเห็นรายการรอรีวิวทั้งหมด
- รีวิวในหน้า Detail (R4): `import { mountProductReviews } from '../product-reviews.js'` แล้วเรียก `mountProductReviews(document.getElementById('reviews'), product)` — มีสรุปคะแนน รายการรีวิว กรองตามดาว และลิงก์ "รายงานสินค้านี้"

---

## คืนเงิน (R1)

คำขอ 1 รายการ = ขอคืนสินค้า 1 รายการในคำสั่งซื้อ (`order_item`) บางชิ้นหรือทั้งหมด · ตาราง `refund_request` · BR-22, BR-23

```
requested ──อนุมัติ──▶ approved ──โอนเงินคืนแล้ว──▶ refunded
    └──────ไม่อนุมัติ──▶ rejected
```

กติกาฝั่งลูกค้า

- ขอได้เฉพาะคำสั่งซื้อของตัวเองที่ **ได้รับสินค้าแล้ว** (`delivered` / `completed`) และ **ไม่เกิน 7 วัน** หลังได้รับ
  - เวลาที่ได้รับ = แถว `to_status = 'delivered'` ล่าสุดใน `order_status_log` · **R5 ช่วยบันทึกแถวนี้ตอนเปลี่ยนสถานะเป็น delivered** ถ้าไม่มี ระบบใช้เวลาสั่งซื้อแทน (เข้มกว่า)
- ขอหลายครั้งต่อรายการได้ แต่รวมกันต้องไม่เกินจำนวนที่ซื้อ (คำขอที่ไม่อนุมัติไม่นับ)
- ยอดคืน `amount` = ราคาต่อชิ้น ณ วันที่ซื้อ × จำนวน (ระบบคำนวณเอง)

กติกาฝั่งผู้ดูแล (บันทึก `admin_action_log` ทุกครั้ง: `approve_refund`, `reject_refund`, `complete_refund`)

- **อนุมัติ** ต้องเลือก `restock_decision`
  - `return` คืนเข้าสต็อก → `product.stock_quantity` เพิ่มตามจำนวน + บันทึก `stock_movement` ประเภท `return` (R3 เปลี่ยนไปเรียกฟังก์ชันสต็อกกลางได้เมื่อทำ #20 เสร็จ)
  - `write_off` ตัดจำหน่าย (ของเสียหายขายต่อไม่ได้) → สต็อกไม่เปลี่ยน
- **โอนเงินคืนแล้ว** (จำลอง ไม่มี payment gateway) ถ้าคืนครบทุกชิ้นของคำสั่งซื้อ → `"order".current_status = 'refunded'` + แถวใหม่ใน `order_status_log` + `payment.status = 'refunded'` · คืนไม่ครบ สถานะคำสั่งซื้อเหมือนเดิม

### `GET /refund-requests/refundable`

```json
{ "data": [ { "order_item_id": 31, "order_id": 15, "product_id": 12, "title": "RX-78-2 Gundam Ver.Ka", "cover_image_url": "https://...",
              "quantity": 2, "refundable_qty": 1, "unit_price": 1500, "delivered_at": "...", "deadline": "..." } ] }
```

### `POST /refund-requests`

```json
{ "order_item_id": 31, "refund_qty": 1, "reason": "ชำรุด/เสียหาย: แขนหักตั้งแต่เปิดกล่อง", "evidence_url": "https://..." }
```

| ผล | เมื่อ |
|---|---|
| 201 + คำขอ (`status: requested`) | สำเร็จ |
| 400 `VALIDATION_ERROR` | `refund_qty` ไม่ใช่จำนวนเต็มบวก · `reason` สั้นกว่า 5 / ยาวเกิน 1000 ตัวอักษร · `evidence_url` ไม่ใช่ลิงก์ http(s) |
| 404 `ORDER_ITEM_NOT_FOUND` | ไม่ใช่สินค้าในคำสั่งซื้อของตัวเอง |
| 409 `ORDER_NOT_DELIVERED` | ยังไม่ได้รับสินค้า / ยกเลิก / คืนเงินไปแล้ว |
| 409 `REFUND_WINDOW_CLOSED` | เกิน 7 วันหลังได้รับ (`details.deadline`) |
| 409 `REFUND_QTY_EXCEEDED` | เกินจำนวนที่ยังขอได้ (`details.refundable_qty`) |
| 429 `TOO_MANY_REQUESTS` | ขอคืนเงินเกิน 20 ครั้งต่อชั่วโมง (นับต่อผู้ใช้) |

คำขอที่ได้: `refund_id`, `code` (`RF012`), `order_item_id`, `order_id`, `product_id`, `title`, `refund_qty`, `amount`, `reason`, `evidence_url`, `status`, `restock_decision`, `requested_at`, `resolved_at`

### `GET /admin/refund-requests?q=&status=&page=&pageSize=` (แอดมิน)

`q` = รหัสคำขอ (`RF012`) · ตัวเลข (รหัสคำขอหรือเลขคำสั่งซื้อ) · ชื่อสินค้า / ชื่อผู้ใช้ / อีเมลของลูกค้า · `status` = `all` / `requested` / `approved` / `rejected` / `refunded`

ได้คำขอเหมือนฝั่งลูกค้า และเพิ่ม `customer`, `order` (สถานะ ยอดรวม `delivered_at` และ `payment` = `{ method, status }` ช่องทางที่ลูกค้าชำระ ไว้โอนคืน), `item` (`purchased_qty`, `unit_price`), `product` (`stock_quantity` ปัจจุบัน), `reviewer` · `meta.counts` = จำนวนแต่ละสถานะ

### `PATCH /admin/refund-requests/:id` (แอดมิน)

```json
{ "action": "approve", "restock_decision": "return", "note": "ตรวจของที่ส่งคืนแล้ว สภาพดี" }
{ "action": "reject", "note": "รอยเกิดจากการใช้งาน" }
{ "action": "refund" }
```

- `approve` ต้องมี `restock_decision` · `reject` ต้องมี `note` (เหตุผล) · `note` ยาวไม่เกิน 300 ตัวอักษร เก็บใน `admin_action_log` (ลูกค้าไม่เห็น)
- ทำผิดลำดับ (เช่น อนุมัติซ้ำ, โอนเงินคืนคำขอที่ไม่อนุมัติ) → 409 `INVALID_REFUND_STATUS`

### หน้าเว็บ

- ลูกค้า: `/refunds` (เลือกสินค้าที่ขอคืนได้ + คำขอของฉัน) · ลิงก์ตรงไปฟอร์มของสินค้ารายการเดียว `/refunds?item=<order_item_id>` (หน้าคำสั่งซื้อของ R5 ใส่ปุ่ม "ขอคืนเงิน" ได้เลย)
- ผู้ดูแล: `/admin/refunds`


## บันทึก event พฤติกรรมผู้ใช้ (หน้าเว็บ R1 · API R4)

> R1 เขียนฝั่งหน้าเว็บ (#8) · R4 ทำ API (#26) ตามข้อตกลงนี้แล้ว (`backend/src/modules/events/`) และเปิด `EVENTS_ENABLED` แล้ว

ตาราง `user_event` (BR-10, BR-11) เก็บว่าใครดู / กด / ถูกใจ / ใส่ตะกร้า / ซื้อสินค้าอะไร ไว้ทำสินค้าแนะนำ

### `POST /events` (ไม่ต้องล็อกอิน)

```json
{ "product_id": 12, "event_type": "add_to_cart", "session_id": "0f6c1d9e-5b7a-4c1e-9a53-2f0d8b7c4e11" }
```

- `event_type` = `view` · `click` · `wishlist` · `add_to_cart` · `purchase` (ตาม CHECK ของตาราง)
- `session_id` = รหัสสุ่มจากหน้าเว็บ (ไม่ว่างเกิน 30 นาทีใช้รหัสเดิม) — แยกการใช้งานแต่ละช่วงได้แม้ยังไม่ล็อกอิน
- ถ้ามี token มาด้วย → API ใส่ `user_id` จาก token เอง (ไม่รับ `user_id` จาก body) · token ใช้ไม่ได้ / ไม่มี token → บันทึกแบบไม่ระบุผู้ใช้ (`user_id` = null)
- ตอบ `201` พร้อม `{ "data": { "event_id", "product_id", "event_type", "created_at" } }` · `400 VALIDATION_ERROR` ข้อมูลผิดรูปแบบ (`session_id` ยาวไม่เกิน 100 ตัว) · `404 PRODUCT_NOT_FOUND` ไม่มีสินค้านี้
- `view` เพิ่ม `product.view_count` ของสินค้านั้น +1 ด้วย (ใน transaction เดียวกัน)
- rate limit 120 ครั้งต่อนาทีต่อ IP → `429 TOO_MANY_REQUESTS` (หน้าเว็บส่งแบบไม่รอผล ผู้ใช้ไม่เห็น error นี้)

### หน้าเว็บเรียกที่ไหน (`frontend/js/events.js`)

```js
import { trackEvent } from '../events.js';
trackEvent('add_to_cart', product.product_id); // ไม่ต้อง await — ส่งไม่สำเร็จก็ไม่แสดงอะไร
```

| event | ใครเรียก | เมื่อไร |
|---|---|---|
| `wishlist` | R1 (`wishlist-button.js`) | กดหัวใจแล้วเพิ่มเข้า wishlist สำเร็จ ✅ ใส่แล้ว |
| `add_to_cart` | R5 | ใส่ตะกร้าสำเร็จ (API ตะกร้าตอบ 2xx แล้ว) |
| `purchase` | R5 | จ่ายเงินสำเร็จ — เรียกทีละสินค้าในคำสั่งซื้อ |
| `view` / `click` | R4 (ถ้าระบบแนะนำต้องใช้) | เปิดหน้า Detail / กดการ์ดจากผลค้นหาหรือสินค้าแนะนำ |

`EVENTS_ENABLED = true` ใน `frontend/js/config.js` แล้ว (หน้าเว็บส่งจริง) — ปิดชั่วคราวได้โดยเปลี่ยนเป็น `false`

## สินค้าแนะนำ (R4)

### `GET /recommend/popular?limit=8` (ไม่ต้องล็อกอิน)

สินค้ายอดนิยม เฉพาะที่ขายได้ (`status = 'available'` และ `stock_quantity > 0`) เรียงจากคะแนนมากไปน้อย

ใช้สามสัญญาณตามเอกสารโครงงาน (S5) แต่ทำให้อยู่ในหน่วยเดียวกันก่อน แล้วถ่วงน้ำหนัก → คะแนนเต็ม 100

```
คะแนน = 100 × ( 0.50 × ยอดขาย' + 0.25 × ถูกใจ' + 0.25 × รีวิว' )

น้ำหนักตามเวลา = 0.5 ^ (อายุเป็นวัน / 30)                     ครึ่งชีวิต 30 วัน · 60 วัน เหลือ 1/4 · 90 วัน เหลือ 1/8
ยอดขาย' = ln(1 + Σ ชิ้น × น้ำหนักตามเวลา) / ln(1 + ค่าสูงสุดในร้าน)   นับจาก "order".placed_at ไม่นับออเดอร์ cancelled / refunded
ถูกใจ'  = ln(1 + Σ น้ำหนักตามเวลา) / ln(1 + ค่าสูงสุดในร้าน)          นับจาก wishlist.added_at
รีวิว'  = (ดาวที่ปรับแล้ว − 1) / 4
          ดาวที่ปรับแล้ว = (3 × ดาวเฉลี่ยทั้งร้าน + ผลรวมดาว) / (3 + จำนวนรีวิว)   ← Bayesian average
คะแนนเท่ากัน → view_count มากก่อน → สินค้าใหม่ก่อน
```

- **ทำไมถ่วงเวลา:** ของที่ขายดีเมื่อหลายเดือนก่อนแต่ตอนนี้เงียบ ไม่ควรค้างอันดับ 1 · ครึ่งชีวิต 30 วันเพราะร้านเดียวขายไม่ถี่ สั้นกว่านี้อันดับจะสั่นตามออเดอร์ไม่กี่ใบ · **รีวิวไม่ลดตามเวลา** เพราะดาวบอกคุณภาพของตัวสินค้า
- **ทำไม normalize:** เดิมบวกยอดขาย (หลักร้อยได้) กับดาว (0–5) ตรง ๆ หน่วยไม่เท่ากัน · หารด้วยค่าสูงสุดทำให้ทุกส่วนอยู่ใน 0–1
- **ทำไมใช้ ln:** ชิ้นที่ 1→2 มีความหมายมากกว่า 50→51 · ชิ้นขายดีชิ้นเดียวจึงไม่กดชิ้นอื่นจนเหลือศูนย์
- **ทำไม Bayesian:** เดิมรีวิวเดียว 5 ดาวชนะ 4.8 จาก 4 รีวิว · ตอนนี้รีวิวน้อยถูกดึงเข้าหาค่าเฉลี่ยร้าน ยังไม่มีรีวิว = เท่าค่าเฉลี่ยร้าน (เป็นกลาง)
- **ทำไม 50 / 25 / 25:** ยอดขาย : ถูกใจ = 2 : 1 ตรงกับน้ำหนัก event ของ "แนะนำสำหรับคุณ" (purchase 6 · wishlist 3) · รีวิวเป็นสัญญาณคุณภาพ
- ค่าน้ำหนักอยู่ที่ `WEIGHTS`, `PRIOR_REVIEWS` และ `HALF_LIFE_DAYS` ใน `backend/src/modules/recommend/recommend.service.js`
- `limit` 1–24 (ค่าเริ่มต้น 8) · ผิดรูปแบบ → `400 VALIDATION_ERROR`
- แต่ละชิ้นมีรูปข้อมูลเหมือน `GET /products` (วาดการ์ดด้วยโค้ดเดิมได้) และมี `popularity` เพิ่ม

```json
{ "data": [ { "product_id": 4, "title": "...", "price": 7900, "category": { ... },
              "popularity": { "score": 97.4, "sold": 6, "wishlist": 4,
                              "weighted_sold": 4.14, "weighted_wishlist": 2.75, "adjusted_rating": 4.58,
                              "parts": { "sales": 1, "wishlist": 1, "rating": 0.894 } } } ] }
```

- `sold` / `wishlist` = ยอดดิบทั้งหมด · `weighted_sold` / `weighted_wishlist` = หลังถ่วงเวลา (ใช้คิดคะแนนจริง)
- `parts` = แต่ละส่วนหลัง normalize (0–1) ก่อนคูณน้ำหนัก ไว้อธิบายว่าชิ้นนี้ติดอันดับเพราะอะไร
- ฐานข้อมูลใหม่ยังไม่มีออเดอร์ / ถูกใจ / รีวิว → ทุกชิ้นได้คะแนนเท่ากัน (มีแค่ส่วนรีวิวที่เป็นกลาง) เรียงตาม view_count · อยากเห็นอันดับจริงบนเครื่องตัวเอง สั่ง
  `docker compose exec api node scripts/demo-activity.js` (ไม่รันเองตอน `docker compose up` · รันได้ครั้งเดียว · ล้างด้วย `npm run db:reset`)
  ได้ลูกค้าตัวอย่าง 8 คน (`demo_ploy` … `demo_ton` รหัสผ่าน `Demo@1234`) พร้อมคำสั่งซื้อ รีวิว wishlist และ `user_event`
  ผลสุ่มเหมือนกันทุกเครื่อง · ไม่ตัดสต็อก · รายละเอียดอยู่หัวไฟล์ `backend/scripts/demo-activity.js`

### `GET /recommend/related/:productId?limit=8` (ไม่ต้องล็อกอิน)

สินค้าที่ "ความหมายใกล้" สินค้านี้ที่สุด ใช้ใต้หน้า Detail (แถว "สินค้าที่เกี่ยวข้อง")

- เทียบเวกเตอร์ `product.embedding` ด้วย `<=>` ของ pgvector (cosine distance · ใกล้สุดก่อน) ไม่เรียกโมเดลตอนค้น จึงเร็ว
- ตัดตัวเอง · เฉพาะของที่ขายได้ (`available` และ `stock_quantity > 0`) · ข้ามชิ้นที่ยังไม่มีเวกเตอร์
- `limit` 1–24 (ค่าเริ่มต้น 8) · ผิดรูปแบบ → `400 VALIDATION_ERROR`
- รหัสสินค้าไม่ใช่จำนวนเต็มบวก → `400 INVALID_ID` · ไม่มีสินค้า / ไม่ได้วางขาย → `404 PRODUCT_NOT_FOUND`
- สินค้าตั้งต้นยังไม่มีเวกเตอร์ → `200` พร้อม `data: []` (หน้าเว็บซ่อนแถวนี้ ไม่ใช่ error)
- แต่ละชิ้นรูปข้อมูลเหมือน `GET /products` และมี `similarity` (0–1 · 1 = ความหมายเหมือนกัน · = 1 − cosine distance)

```json
{ "data": [ { "product_id": 46, "title": "Volkswagen Type 2 — ...", "price": 2400, "category": { ... },
              "similarity": 0.54 } ] }
```

### `GET /recommend/for-you?limit=8` (ต้องล็อกอิน)

แนะนำสำหรับคุณ — แถวบนสุดของหน้าแรก (เฉพาะคนที่ล็อกอินและมีประวัติ)

```
1. 30 event ล่าสุดของผู้ใช้ (user_event) → คะแนนความสนใจต่อสินค้า
   view 1 · click 2 · wishlist 3 · add_to_cart 4 · purchase 6
2. แต่ละชิ้นที่สนใจ หาของที่ใกล้ (<=> บน product.embedding · ไม่เรียกโมเดล)
3. ผลัดกันหยิบทีละชิ้น เริ่มจากความสนใจที่คะแนนมากสุด (item-to-item)
4. ตัดชิ้นที่เคยเห็นใน 30 event และของที่ซื้อแล้ว (ไม่นับออเดอร์ cancelled / refunded)
```

- **ทำไมไม่เฉลี่ยเวกเตอร์:** ทดลองกับลูกค้าตัวอย่างแล้ว ค่าเฉลี่ยถูกดึงไปทางกลุ่มการ์ดทุกคน ความสนใจรองหายไป (centroid problem) · แยกทีละชิ้นได้ครบทุกแนวที่ผู้ใช้สนใจ
- ผู้ใช้มาจาก token เท่านั้น · ไม่ล็อกอิน / token ใช้ไม่ได้ → `401` · ไม่ต้องยืนยันอีเมล (อ่านอย่างเดียว)
- `limit` 1–24 (ค่าเริ่มต้น 8) · ผิดรูปแบบ → `400 VALIDATION_ERROR`
- ไม่มีประวัติ (cold start) / ไม่เหลือของให้แนะนำ → ได้ยอดนิยมแทน และ `meta.personalized = false` (หน้าแรกจึงซ่อนแถวนี้ ไม่ให้ซ้ำกับแถวยอดนิยม)
- แต่ละชิ้นรูปข้อมูลเหมือน `GET /products` + `similarity` + `because` (ชิ้นที่ผู้ใช้สนใจซึ่งทำให้แนะนำชิ้นนี้)

```json
{ "data": [ { "product_id": 18, "title": "RMS Titanic — ...", "category": { ... }, "similarity": 0.517,
              "because": { "product_id": 22, "title": "Cuba Sailing Ship Stamps — 3 ดวง" } } ],
  "meta": { "personalized": true } }
```

- ลองบนเครื่อง: รัน `scripts/demo-activity.js` แล้วล็อกอินเป็น `demo_mint` / `Demo@1234`

## ค้นหาตามความหมาย (R4)

### `GET /search/semantic?q=กันดั้ม` (ไม่ต้องล็อกอิน · จำกัด 30 ครั้ง/นาที/IP)

ช่องค้นหาในหน้า Search ใช้ตัวนี้**ทุกครั้งที่มีคำค้น** (ชื่อตรงขึ้นก่อน จึงค้นด้วยชื่อได้เหมือนเดิม) · ไม่มีคำค้น (กดค้นหาช่องว่าง = แสดงทั้งหมด / เลือกแค่ตัวกรอง) → หน้า Search ใช้ `GET /products` แบบแบ่งหน้า · เปิดหน้ามาเฉย ๆ → แถวแนะนำ (`/recommend/for-you` ถ้าล็อกอินและ `personalized` ไม่งั้น `/recommend/popular`)

```
1. dict คำทับศัพท์ (src/modules/search/synonyms.js): "กันดั้ม" → "Gundam" · "แสตมป์" → "stamp"
2. แปลงคำค้นเป็นเวกเตอร์ (โมเดลเดียวกับ embedding ของสินค้า)
3. กรองตามตัวกรอง (WHERE) → เรียง: ชื่อตรงคำค้นก่อน → แล้วตามความใกล้ (<=>)
4. เกณฑ์ตัด: เก็บชิ้นที่ similarity ≥ max(0.35, คะแนนอันดับ 1 − 0.20) + ชิ้นที่ชื่อตรง (เก็บเสมอ)
```

- **ทำไมผสม:** ความหมายล้วนเก่งกับคำบรรยาย ("เหรียญเงิน" "รถเหล็ก") แต่พลาดกับชื่อเฉพาะสั้น ๆ และคำทับศัพท์ไทย
- **ทำไมมีเกณฑ์ตัด:** ค้นตามความหมาย ทุกชิ้นมีคะแนน ไม่มีคำว่าไม่ตรง · ขั้นต่ำ 0.35 = ไม่มีของเกี่ยวก็ตอบ `[]` ("นาฬิกา") · ห่างจากที่ 1 ไม่เกิน 0.20 = มีของตรงชัดไม่เอาของห่าง ๆ มาปน · ค่าได้จากทดลองคำค้นจริง 12 คำ (`MIN_SIMILARITY`, `MAX_GAP` ใน search.service.js)
- query: `q` (บังคับ ≤ 100 ตัว) · ตัวกรองชื่อเดียวกับ `GET /products`: `category` (id หรือ slug), `condition`, `minPrice`, `maxPrice` · `limit` เพดาน 1–50 (ค่าเริ่มต้น 50)
- ไม่ใช้ `inStock` / `sort` / `page`: แสดงเฉพาะของที่ขายได้ · API เรียงตามความใกล้เสมอ (หน้า Search เรียงตามราคาเองเมื่อผู้ใช้เลือก) · ไม่แบ่งหน้า
- ผิดรูปแบบ → `400 VALIDATION_ERROR` บอกทุกช่องพร้อมกัน (ตรวจก่อนเรียกโมเดล)
- แต่ละชิ้นรูปข้อมูลเหมือน `GET /products` + `match` (`name` = ชื่อตรง · `meaning` = ความหมายใกล้) + `similarity` (0–1 · `null` = สินค้ายังไม่มีเวกเตอร์แต่ชื่อตรง)
- **ทางสำรอง (ค้นด้วยชื่อต้องใช้ได้เสมอ):** โมเดลยังโหลดไม่เสร็จ (เครื่องใหม่ต้องดาวน์โหลด 118 MB) หรือโหลดไม่ได้ (เข้า huggingface.co ไม่ได้) → ไม่ตอบ 500 · ค้นจาก**ชื่อ**อย่างเดียว (ผ่าน dict + ตัวกรองเหมือนเดิม) ทุกชิ้น `match: "name"`, `similarity: null` · server เริ่มโหลดโมเดลไว้เบื้องหลังตั้งแต่เปิด · โหลดพังเว้น 1 นาทีค่อยลองใหม่
- `meta.mode`: `semantic` = ผสมชื่อ + ความหมาย · `name` = ทางสำรอง

```json
{ "data": [ { "product_id": 12, "title": "Gundam Exia — ประกอบแล้ว", "category": { ... },
              "match": "name", "similarity": 0.719 } ],
  "meta": { "mode": "semantic" } }
```
