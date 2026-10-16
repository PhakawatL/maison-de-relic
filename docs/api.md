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
| GET | `/addresses` | ✓ | R2 | ที่อยู่จัดส่งของตัวเอง (ที่อยู่หลักขึ้นก่อน) |
| GET | `/addresses/:id` | ✓ | R2 | ที่อยู่ 1 ที่ของตัวเอง |
| POST | `/addresses` | ✓ ยืนยันอีเมลแล้ว | R2 | เพิ่มที่อยู่ |
| PATCH | `/addresses/:id` | ✓ ยืนยันอีเมลแล้ว | R2 | แก้ที่อยู่ / ตั้งเป็นที่อยู่หลัก |
| DELETE | `/addresses/:id` | ✓ ยืนยันอีเมลแล้ว | R2 | ลบที่อยู่ |
| GET | `/products` | - | R3 | รายการสินค้าที่ขายอยู่ ค้นหา/กรอง/เรียง/แบ่งหน้า (ดูรายละเอียดด้านล่าง) |
| GET | `/products/:id` | - | R3 | สินค้า 1 ชิ้นพร้อมรูปทั้งหมด |
| GET | `/categories` | - | R3 | หมวดหมู่ทั้งหมด พร้อมจำนวนสินค้าที่ขายอยู่ |
| GET | `/series` | - | R3 | ซีรีส์ทั้งหมด พร้อมจำนวนสินค้าที่ขายอยู่ |
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

### บัญชีทดสอบ (seed `002_users.sql`, `004_team_staff.sql`)

| username | รหัสผ่าน | เป็นอะไร |
|---|---|---|
| `Neptz` | `Neptz@1234` | แอดมิน · เจ้าของร้าน (owner) |
| `SuphawitBonus` | `SuphawitBonus@1234` | แอดมิน · เจ้าของร้าน (owner) |
| `staff` | `Staff@1234` | แอดมิน · ทีมงาน (staff) ดูรายชื่อผู้ดูแลได้อย่างเดียว |
| `tain` | `tain@1234` | แอดมิน · ทีมงาน (staff) |
| `oicnssw` | `oicnssw@1234` | แอดมิน · ทีมงาน (staff) |
| `PhakawatL` | `PhakawatL@1234` | แอดมิน · ทีมงาน (staff) |
| `customer` | `Customer@1234` | ลูกค้า ยืนยันอีเมลแล้ว มีที่อยู่ 2 ที่ (seed `003_addresses.sql`) |
| `newbie` | `Newbie@1234` | ลูกค้า ยังไม่ยืนยันอีเมล |
| `banned` | `Banned@1234` | ลูกค้า ถูกปิดบัญชี |

- username ตัวพิมพ์ใหญ่/เล็กต้องตรง (`Neptz` ไม่ใช่ `neptz`)
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
