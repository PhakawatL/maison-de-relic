# ข้อตกลง API

ทุกคนต้องเขียน API ตามข้อตกลงนี้ หน้าเว็บจะได้เรียกผ่าน `frontend/js/api.js` ตัวเดียวได้ทั้งหมด

## R5 — สถานะปัจจุบัน 5 พฤศจิกายน 2026

ส่วนนี้สรุป implementation ใน branch R5 หลังรวม main ถึง `1ad3a21` ไม่ได้หมายความว่าโค้ด R5 ถูกส่งขึ้น main แล้ว หัวข้อผลตรวจที่ลงวันที่เก่าด้านล่างเป็นบันทึกย้อนหลัง; ใช้สรุปนี้และหัวข้อ TrueMoney / Events readiness สำหรับสถานะล่าสุด

| ส่วน | สถานะที่ใช้จริงในโค้ด |
|---|---|
| Checkout | Omise **Test** PromptPay / TrueMoney ผ่าน `/orders/payment-attempts`; ไม่รองรับบัตรหรือ Live keys |
| สั่งซื้อแบบจำลองเดิม | HTTP `POST /orders` ตอบ 409 `PAYMENT_PROVIDER_REQUIRED`; service เดิมเก็บไว้ทดสอบ ไม่ใช่เส้นทางซื้อในเว็บ |
| Order / จัดส่ง | มีประวัติ รายละเอียด Admin Orders เลขพัสดุ และยืนยันรับสินค้า พร้อม status log / admin audit |
| รีวิว / คืนเงิน | รวม R1 แล้ว; Order Detail ใช้ eligibility API และลิงก์ด้วย `order_item_id` ไป `/write-review` / `/refunds` |
| R3 Inventory | ยังไม่มี `inventory.service.js`; R5 มี adapter รองรับ `deductStock(client, line)` แต่ต้องเชื่อมของ R3 ก่อนซื้อจริงครบเส้นทาง ตอบ 503 `INVENTORY_NOT_READY` ก่อนสร้าง payable charge เมื่อ service ไม่พร้อม |
| R4 Events | มี outbox, session และ per-product adapter; ยังไม่มี Events API / transport / worker ที่เปิดใช้จริง ต้องยืนยัน trusted identity และ receiver deduplication ก่อนเชื่อม |

### ตรวจ flow คืนเงินฝั่งแอดมิน

R1 ใช้ `POST /refund-requests` และ `PATCH /admin/refund-requests/:id` ไม่ใช่ Omise Refund API:

- `approve` ต้องระบุ `restock_decision`: `return` เพิ่มสต็อกและบันทึก return movement ทันทีที่อนุมัติ; `write_off` ไม่เพิ่มสต็อก การอนุมัติจึงควรเกิดหลังตรวจรับสินค้าคืนแล้ว
- `reject` ปิดคำขอและคืนจำนวนที่ขอได้; `refund` ใช้ได้เฉพาะ approved เป็นการบันทึกว่าโอนคืนแล้วตามระบบ R1 **ไม่เรียก Omise และไม่โอนเงินจริง**
- คืนบางส่วนยังคงสถานะ order/payment เดิม; คืนครบจำนวนของทุกรายการจึงเปลี่ยนทั้ง order และ payment เป็น `refunded` พร้อม `order_status_log` ทุกการพิจารณามี admin audit
- ยอดคำขอ = ราคาต่อชิ้น ณ วันที่ซื้อ × จำนวนที่ขอคืน ไม่รวมค่าจัดส่ง การยืนยันรับสินค้าไม่เลื่อนช่วงคืนเงิน 7 วันซึ่งนับจาก delivered log
- ตรวจ API วันที่ 5 พ.ย. 2026: `refunds.test.js` และ `omise-payments.test.js` รวม **39 ผ่าน / 0 ข้าม / 0 ล้มเหลว** รวม R5 paid order → delivered/completed → คืนบางส่วน/ครบจำนวน, return/write_off, สิทธิ์ลูกค้า, ทำซ้ำได้ 409, สต็อก/ledger/audit และสถานะที่ลูกค้าอ่านกลับ Gateway และ Inventory ใช้ constructor-injected test doubles; ฐานข้อมูลและ Refund API ใช้จริง สร้าง/ล้างเฉพาะ fixtures ไม่เรียก provider ภายนอก และไม่ใช่ผลตรวจหน้าจอแอดมินรอบใหม่

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
| GET | `/cart` | ✓ | R5 | ตะกร้าของผู้ใช้และสต็อกล่าสุด |
| POST | `/cart/items` | ✓ ยืนยันอีเมลแล้ว | R5 | เพิ่มสินค้าเข้าตะกร้า |
| PATCH | `/cart/items/:productId` | ✓ ยืนยันอีเมลแล้ว | R5 | ตั้งจำนวนสินค้า |
| DELETE | `/cart/items/:productId` | ✓ ยืนยันอีเมลแล้ว | R5 | ลบรายการสินค้า |
| POST | `/cart/item-removals` | ✓ ยืนยันอีเมลแล้ว | R5 | ลบหลายรายการ |
| POST | `/orders/quotes` | ✓ ยืนยันอีเมลแล้ว | R5 | ตรวจราคา สต็อก ที่อยู่ และยอดก่อนซื้อ |
| POST | `/orders` | ✓ ยืนยันอีเมลแล้ว | R5 | ปิดเส้นทางจำลอง: 409 PAYMENT_PROVIDER_REQUIRED; ใช้ `/orders/payment-attempts` |
| GET | `/orders/:id` | ✓ | R5 | รายละเอียดออเดอร์ของตัวเอง |
| GET | `/orders` | ✓ | R5 | ประวัติออเดอร์ของตัวเอง กรองสถานะและแบ่งหน้า |
| GET | `/admin/orders` | ✓ แอดมิน | R5 | รายการออเดอร์ของร้าน ค้นหา กรองและแบ่งหน้า |
| GET | `/admin/orders/:id` | ✓ แอดมิน | R5 | รายละเอียดออเดอร์เพื่อจัดส่ง |
| PATCH | `/admin/orders/:id/fulfillment` | ✓ แอดมิน | R5 | บันทึกสถานะจัดส่งและเลขพัสดุ |
| POST | `/orders/:id/receipt` | ✓ เจ้าของ ยืนยันอีเมลแล้ว | R5 | ยืนยันรับสินค้า delivered → completed |
| POST | `/events` | - (มี token จะใส่ผู้ใช้ให้) | R4 | บันทึกพฤติกรรม view / click / wishlist / add_to_cart / purchase |
| GET | `/recommend/popular` | - | R4 | สินค้ายอดนิยม (ขายได้ + ถูกใจ + คะแนนรีวิว) |
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

ตอนนี้ `EVENTS_ENABLED = false` ใน `frontend/js/config.js` (หน้าเว็บยังไม่ส่ง) — **R4 เปลี่ยนเป็น `true` ใน PR เดียวกับ API**


## ตะกร้าสินค้า (R5 · Step 2)

ทุก endpoint ต้องล็อกอินผ่าน R2 `requireAuth` และทุก mutation ต้องผ่าน `requireVerified`.
หาก middleware ของ R2 ยังไม่ถูกนำเข้ามา ระบบตอบ 503 `AUTH_NOT_READY` โดยไม่เปิดทางข้ามการยืนยันตัวตน.

| Method | URL | Body | สำเร็จ |
|---|---|---|---|
| GET | `/cart` | — | 200 `{ data: { items: [...] } }` |
| POST | `/cart/items` | `{ product_id, quantity }` | 201 ตะกร้าล่าสุด; บวกจำนวนเมื่อมีสินค้าแล้ว |
| PATCH | `/cart/items/:productId` | `{ quantity }` | 200 ตะกร้าล่าสุด; ตั้งจำนวนใหม่ |
| DELETE | `/cart/items/:productId` | — | 204 |
| POST | `/cart/item-removals` | `{ product_ids: [...] }` | 204; 1–100 รายการต่อคำขอ |

แต่ละ item มี `product_id`, `title`, `price` (number), `cover_image_url`, `category_name`,
`quantity`, `stock_quantity`, `status`, `available`, `quantity_valid`.
`quantity_valid` เป็น false เมื่อสต็อกลดต่ำกว่าจำนวนเดิมหรือสินค้าไม่พร้อมขาย.
GET ไม่เปลี่ยนจำนวนเดิมให้อัตโนมัติ ผู้ใช้ต้องแก้จำนวนก่อนเลือกซื้อ.

- จำนวนต้องเป็น integer 1–2147483647 และไม่เกินสต็อก; เกินตอบ 409 `OUT_OF_STOCK` พร้อม `details.stock_quantity`.
- สินค้าไม่มี/ซ่อน/ร่าง: 404 `PRODUCT_NOT_FOUND`; แก้หรือลบรายการที่ไม่มี: 404 `CART_ITEM_NOT_FOUND`.
- ระบุเจ้าของจาก `req.user.user_id` เท่านั้น ไม่รับ user/cart ID จาก client.
- การเขียนล็อกตะกร้าใน transaction เพื่อไม่ให้คำขอของผู้ใช้เดียวกันเขียนทับกัน.
- Cart ไม่จองหรือตัดสต็อก; Checkout ต้องตรวจสต็อกซ้ำและตัดผ่าน R3.
- checkbox เป็น state หน้าเว็บ เริ่มเลือกทุกรายการที่ซื้อได้; รายการสต็อกไม่พอเลือกไม่ได้.
- ยอดคำนวณเฉพาะที่เลือก: ส่งธรรมดา 40 บาท ฟรีเมื่อยอดสินค้า >= 1500 บาท ไม่มีส่วนลด.
- `/cart` ใช้หน้าเดียวสำหรับตะกร้ามีสินค้า/ว่าง รองรับ TH/EN และธีมกลาง.
- ปุ่มชำระเงินเก็บ `mdr_checkout_product_ids` ใน sessionStorage แล้วไป `/checkout` (Step 3).

### ข้อค้างก่อน integration

รอ R2 Auth เข้าสู่ branch และ R3 seed สินค้าเพื่อทดสอบกับบัญชีจริงครบเส้นทาง.
Order Waiting/ยกเลิกออเดอร์ยังไม่สรุป ไม่อยู่ใน Step 2.

## Checkout / Order ขั้นต้น (R5 · Step 3)

### R5 integration contract — ตรวจตาม implementation 28 ต.ค. 2026

อัปเดต UI/รายการ: `GET /orders` คืน `shipping_method`, `carrier`, `tracking_no`
เพิ่มจากเดิมเพื่อแสดงในประวัติ พร้อม item_count และ total_quantity.
`GET /admin/orders` รองรับช่องค้นหาแยก `order_id` (เลขหรือ ORD-0001, ตรงตัว),
`recipient` และ `tracking_no` (ค้นหาบางส่วน ไม่สนตัวพิมพ์ใหญ่เล็ก).
เมื่อกรอกหลายช่องใช้เงื่อนไข AND. ทุกช่องไม่เกิน 100 ตัวอักษร; query ซ้ำ/รูปแบบผิดตอบ 400.
`q` เดิมยังรองรับสำหรับ URL เก่า แต่หน้า UI ใหม่ใช้สามช่องแยก.

ส่วนนี้อธิบายโค้ด R5 ที่มีใน working tree ไม่ได้หมายความว่าทีมยืนยัน contract
หรือ merge ขึ้น main แล้ว. API ทุกเส้นใช้ prefix `/api` (ไม่ใช่ `/api/v1`).
ส่ง `Authorization: Bearer <token>`; ห้ามรับ user_id จาก body เพื่อแทนเจ้าของ token.

| ผู้ใช้ข้อมูล | Interface ที่มีแล้ว | ขอบเขต/สิ่งที่ต้องตกลง |
|---|---|---|
| R1 Refund/Review | `GET /orders/:id` และ API R1 `/reviews`, `/refund-requests` | เจ้าของออเดอร์เท่านั้น; คืน Order พร้อม `items`, `payment`, `status_history`; R1 ใช้ `order_item_id` ตรวจสิทธิ์/eligibility และรับคำขอแล้ว ไม่มี API OrderItem แยก |
| R3 รายงานยอดขาย | `GET /admin/orders`, `GET /admin/orders/:id` | ต้องเป็น admin; เป็นรายการ/รายละเอียด ยังไม่มี aggregate sales API; ตกลงวิธีคิดยอดคืนเงิน/ค่าจัดส่งก่อนสร้างรายงาน |
| R3 Inventory | adapter ใน `orders.integrations.js` | signature ด้านล่างเป็นข้อเสนอของ R5 ยังรอ R3 ยืนยัน |
| R4 Events | server outbox และ per-product adapter | มี draft body `{product_id,event_type,session_id}` จาก R1 แล้ว; รอ API จริง, trusted identity, deduplication และ worker ดู Events readiness ท้ายเอกสาร |

**Order/OrderItem read contract:** รายละเอียดคืน `{data: order}` โดยมี
`order_id`, `current_status`, `placed_at`, `subtotal`, `shipping_fee`, `grand_total`,
`shipping_method`, `carrier`, `tracking_no`, `shipping_address`, `items`, `payment`,
`fulfillment_version`, `status_history`. `items` มี `order_item_id`, `product_id`,
`quantity`, `unit_price_at_purchase`, `title_snapshot`, `cover_image_url`.
เงินเป็นตัวเลขหน่วยบาท; subtotal/shipping_fee ของข้อมูลเก่าอาจเป็น null.
shipping_address เป็น snapshot ชื่อ `ship_*`; ไม่ควรเปิดเผยข้อมูลนี้ในรายงานสาธารณะ.
`payment` เป็น null ได้; ถ้ามีประกอบด้วย `amount`, `method`, `status`, `paid_at`, `simulated`.
ผิดเจ้าของ/ไม่พบตอบ 404; ไม่ล็อกอิน 401; admin endpoint ไม่มีสิทธิ์ตอบ 403.
Refund/Review ต้องตรวจสิทธิ์ฝั่ง server อีกครั้ง ไม่เชื่อสถานะจาก browser.

**R3 inventory proposal:** โมดูล `backend/src/modules/inventory/inventory.service.js`
export `async deductStock(client, { product_id, quantity, order_item_id, created_by })`.
อัปเดตการเตรียมรองรับ 1 พ.ย. 2026: `orders.integrations.createStockAdapter()`
ตรวจ export และข้อมูลก่อนส่งต่อ. IDs รับ safe positive integer/string จาก PostgreSQL
แล้วส่งให้ R3 เป็น number; quantity ต้องเป็น positive integer number.
ข้อมูลจาก caller ผิดตอบ 500 INVENTORY_CONTRACT_ERROR โดยไม่เรียก R3;
error จาก R3 ส่งต่อเดิมเพื่อ rollback. ไม่กำหนดรูปแบบ return value เพราะ R5 ไม่ใช้ผลคืน.
ทดสอบด้วย constructor injection เท่านั้น ไม่มี env/HTTP flag เปิด mock บนระบบจริง.
ใช้ PostgreSQL client ที่ R5 ส่งให้; ห้าม BEGIN/COMMIT transaction แยกเอง.
ต้องลด stock แบบ atomic เมื่อสินค้า available และ stock พอ พร้อมเพิ่ม sale movement
ลง `stock_movement` ใน transaction เดียวกัน. สำเร็จ R5 ไม่ใช้ return value;
ล้มเหลวให้ throw AppError (เสนอ 409 OUT_OF_STOCK) เพื่อ rollback ทั้งออเดอร์.
`created_by` คือ user_id ของผู้ซื้อ ไม่ใช่ admin โดยอัตโนมัติ.
ก่อนสร้าง payable QR R5 ตรวจว่ามี export นี้แล้ว; ถ้าไม่มีตอบ 503 INVENTORY_NOT_READY.
ยังไม่มี reservation ระหว่างรอ QR: จ่ายสำเร็จแต่ finalize ไม่ได้จะเป็น needs_review
และห้ามจ่ายซ้ำ. การกัน/คืน stock และ idempotency ของ movement ต้องตกลงเพิ่มก่อน Live.

**ผลตรวจการเตรียม integration — 1 พ.ย. 2026:** ใช้ PostgreSQL จริงกับ Inventory
และ gateway doubles เฉพาะ test server: ทดสอบ quote → pending → successful →
Order/OrderItem/Payment/StockMovement/status log → ลบเฉพาะจำนวนสินค้าที่ซื้อจาก cart.
ตรวจ HTTP ownership, sync/webhook พร้อมกัน, duplicate retry, สองผู้ซื้อชิ้นสุดท้าย,
และตัด stock รายการที่สองพัง (rollback ทั้งงานออเดอร์ คง needs_review).
เมื่อแก้สาเหตุแล้ว sync charge เดิมสร้างออเดอร์ได้ครั้งเดียว ไม่สร้าง charge ใหม่.
นี่ไม่ใช่ผลทดสอบ Omise ภายนอกหรือ Inventory implementation ของ R3;
หน้า Checkout ปกติยังคงปิดการสร้าง QR เมื่อ R3 ไม่พร้อม.

**R4 event proposal:** `add_to_cart` ส่งหลัง API เพิ่มสำเร็จเท่านั้น
(เสนอ product_id, quantity ที่เพิ่ม, unit_price); `purchase` ส่งหลัง server ยืนยันจ่ายและ
สร้างออเดอร์สำเร็จแล้ว (เสนอ order_id, currency THB, value, items).
ต้องตกลงชื่อ field, auth, consent และ deduplication key ก่อน implement.
ห้ามส่ง purchase จากการเห็น QR/กดปุ่มจ่าย หรือจาก Preview.
value จะรวม shipping หรือไม่ยังต้องตกลง; Events ล้มเหลวต้องไม่ทำให้จ่ายซ้ำ.

#### R5 Events preparation — 1 พ.ย. 2026

- `005_r5_event_outbox.sql` เพิ่ม `r5_event_outbox` ของ R5 แยกจากตาราง/API ของ R4.
- Cart add สำเร็จจะบันทึก `add_to_cart:<uuid>` ใน transaction เดียวกับการเพิ่ม;
  quantity คือจำนวนที่เพิ่มครั้งนั้น ไม่ใช่ยอดรวมในตะกร้า และ unit_price มาจาก server.
  การ set quantity/remove และ Preview ไม่ส่ง event นี้.
- หลังยืนยัน provider successful และสร้าง Order/Items/Payment แล้ว บันทึก
  `purchase:<order_id>`; unique key ป้องกัน webhook/sync/retry สร้าง purchase ซ้ำ.
  pending/failed/expired/needs_review หรือ backend simulated payment ไม่บันทึก purchase.
- purchase payload ปัจจุบันเป็นข้อเสนอ: order_id, currency THB, value=grand_total
  (รวมค่าส่ง), shipping_fee, test_mode, items[{product_id,quantity,unit_price}].
  Omise Test มี test_mode=true ต้องแยกจากยอดขายจริง; รอ R4 ยืนยัน field/value/consent.
- ไม่ใส่ชื่อ ที่อยู่ โทรศัพท์ อีเมล token หรือ payment keys ใน payload.
  user_id เก็บเป็น FK ภายในคิวเพื่อ ownership/cleanup ยังไม่ส่งใน envelope.
- `r5-events.createEvents({transport})` รับตัวส่งเฉพาะตอนประกอบ service;
  `dispatchOne()` คืน disabled เมื่อยังไม่มี transport. ไม่มี route/cron/flag เปิดส่งจริง.
  ขั้นเชื่อม R4 ต้องเพิ่ม transport ที่ยืนยัน endpoint/auth/schema แล้วและกำหนด scheduler.
- Transport รับ `{event_key,event_type,payload,occurred_at}` กับ `{signal}`;
  ต้องคืน `{accepted:true}` เมื่อ receiver รับสำเร็จเท่านั้น. ค่าอื่น/throw/timeout
  เก็บไว้ retry 30 วินาทีถัดไป. Default timeout 2 วินาที; ส่ง key เดิมทุกครั้ง.
- ใช้ row lock + SKIP LOCKED กัน worker แย่ง event; delivered_at กันส่งซ้ำในรอบปกติ.
  ถ้าตัวรับรับแล้วแต่คำตอบหาย อาจส่งซ้ำได้: R4 ต้อง deduplicate event_key.
  ไม่อ้าง exactly-once delivery. Retry นี้คือ retry ส่ง event ไม่ใช่ retry เพิ่ม Cart;
  API Cart add ยังไม่มี request-level idempotency จึงห้าม auto-retry การเพิ่มสินค้า.
- ไม่มี network call ใน transaction ซื้อ/ตะกร้า. Queue insert ล้มเหลวใช้ savepoint
  rollback เฉพาะ event แล้วให้ business commit ต่อ; event นั้นอาจสูญหาย โดยเตือนเพียง
  `R5_EVENT_ENQUEUE_FAILED` ไม่ log เนื้อหา error. Retention/reconciliation ต้องตกลงก่อน Live.
- ทดสอบด้วย mock receiver และ PostgreSQL จริงเท่านั้น ยังไม่ได้เรียก API R4.

**ข้อจำกัดปัจจุบัน:** ไม่มี automatic refund/void PromptPay, ไม่มี API ยกเลิกออเดอร์,
ไม่มี sales aggregate และไม่มีการส่ง Events จริง. ปุ่ม Refund ในหน้าจริงเชื่อม R1 eligibility แล้ว; ปุ่มใน Preview ปิดไว้ไม่ส่ง ID จำลอง.
สถานะ Order ใช้ paid → packing → shipped → delivered → completed;
cancelled/refunded อ่านได้แต่ไม่มี mutation flow. Waiting ใช้ payment attempt แยกจาก Order.

### Waiting / Refund UI (17 ต.ค. 2026)

- Waiting หมายถึง payment attempt ที่ยังไม่มี Order; ไม่เพิ่มสถานะ Order ใหม่.
- Checkout แสดงเวลาคงเหลือของ QR 15 นาที; ครบเวลาแล้วซ่อน QR แต่ยัง sync
  กับ Omise ต่อ ไม่เปลี่ยนเป็น expired หรือ cancelled จากนาฬิกาฝั่งเว็บ.
- กลับตะกร้าไม่ใช่การยกเลิก; กลับ Checkout จะกู้ attempt เดิมจาก API.
- เริ่มใหม่ได้เมื่อ provider ยืนยัน failed/expired และต้องตรวจ quote ใหม่.
- ยังไม่มี stock reservation จึงไม่คืน stock ตอน attempt หมดอายุ.
- Order Detail แสดงส่วนขอคืนเงินแบบ disabled สำหรับ payment succeeded ที่ไม่ใช่
  cancelled/refunded. นี่ไม่ใช่การตรวจ eligibility และไม่มีการส่งคำขอ.
  รอ R1 ส่งหน้า/API พร้อมกฎ eligibility และสถานะ request ก่อนเปิดใช้งาน.
- ไม่มีปุ่ม void PromptPay หรือ automatic refund; needs_review ต้องให้เจ้าหน้าที่
  ตรวจสอบหลักฐานชำระเงินและออเดอร์ ไม่ให้ลูกค้าจ่ายซ้ำ.

### Omise Test PromptPay — สถานะล่าสุด 16 ต.ค. 2026

- ยืนยันขอบเขตกับผู้ใช้: พร้อมเพย์ QR ก่อน ยังไม่ทำบัตร/Live mode.
- root `.env` ใช้ `OMISE_PUBLIC_KEY` และ `OMISE_SECRET_KEY` แบบ Test; Compose ส่งให้ API.
  Secret อยู่ server เท่านั้น; ไม่ส่งให้หน้าเว็บ ไม่บันทึกใน Git หรือ log.
- migration `004_r5_omise_payments.sql` เพิ่มตาราง `checkout_payment_attempt`;
  QR pending ไม่ใช่ Order waiting และไม่เปลี่ยนสถานะออเดอร์ที่ทีมยังไม่ตกลง.
- **ข้อจำกัดปัจจุบัน:** R3 inventory ยังไม่มี implementation. Checkout จึงตอบ
  `503 INVENTORY_NOT_READY` **ก่อน** สร้าง QR. ห้ามเปิดทางจ่ายโดยข้ามการตัดสต็อก.
- เชื่อม Omise API จริงใน Test mode และทดสอบสร้าง QR ยอด 20 บาทสำเร็จแล้ว;
  ตั้งรายการทดสอบนั้นเป็น failed และ GET ตรวจผลสำเร็จ. ไม่มีการจ่ายเงินจริง.

ทุก URL ในตารางอยู่ใต้ `/api`; ส่ง Bearer token. สร้างและ sync ต้องยืนยันอีเมล.

| Method | URL | ผลลัพธ์ |
|---|---|---|
| POST | `/orders/payment-attempts` | `{data: attempt}`; body เหมือน quote พร้อม `quote_hash`, `checkout_key` UUID v4; `payment_method=promptpay` เท่านั้น |
| GET | `/orders/payment-attempts/active` | `{data: attempt \| null}` กู้รายการค้างของเจ้าของ แม้ sessionStorage หาย |
| GET | `/orders/payment-attempts/:attemptId` | อ่านสถานะเจ้าของเท่านั้น; คนอื่น 404 |
| POST | `/orders/payment-attempts/:attemptId/sync` | body `{}`; GET charge จาก Omise แล้วตรวจผล; ตรวจห่างอย่างน้อย 4 วินาที |
| POST | `/payments/omise/webhook` | รับ `charge.complete`, ตรวจ charge ซ้ำจาก Omise; สำเร็จ 204 |

`attempt`: `attempt_id`, `status`, `test_mode:true`, `amount` บาท, `currency:thb`,
`qr_url`, `expires_at`, `charge_id`, `order_id`. ไม่มี Secret หรือข้อมูลที่อยู่ใน response.
สถานะ: `initializing`, `unknown`, `pending`, `successful`, `failed`, `expired`, `needs_review`.

การสร้างชำระเงิน:

1. Backend ตรวจยอด/เจ้าของ/ที่อยู่/stock adapter แล้วบันทึก snapshot และ attempt ก่อนเรียก Omise.
2. POST charge ใช้ยอดสตางค์จาก server, `source[type]=promptpay`, `ref_id=attempt_id`
   และ metadata `checkout_attempt=attempt_id`; QR อายุ 15 นาที. ยอด 20–150,000 บาท.
3. คำขอซ้ำ key/body เดิมคืน attempt เดิม; key เดิม body ต่างตอบ 409.
   หนึ่งผู้ใช้มีรายการเปิดได้หนึ่งรายการ เพื่อป้องกันสองแท็บสร้าง QR ซ้ำ.
4. หาก network/response ไม่แน่นอน เก็บ `unknown` และ **ไม่ retry สร้าง charge อัตโนมัติ**.
   เก็บรายการเดิมไว้ แม้เลยเวลาหมดอายุ จนตรวจผลจาก provider ได้.
5. sync/webhook เชื่อถือเฉพาะ GET charge จากบัญชีเรา, `livemode=false`, amount/currency,
   method, metadata/attempt, charge ID และ `paid=true` เมื่อ successful ตรงกันทั้งหมด.
6. สำเร็จแล้วสร้าง Order/Items/Payment/StockMovement/Log ใน transaction เดียว.
   ใช้ราคา/ที่อยู่ snapshot ตอนสร้าง QR และลดตะกร้าเฉพาะจำนวนที่ซื้อ;
   จำนวนที่เพิ่มระหว่างรอ QR ไม่ถูกลบทิ้ง. Payment method `omise_test_promptpay`.
7. หาก provider successful แต่สต็อกหมดหรือสร้างออเดอร์ไม่สำเร็จ: rollback เฉพาะงานออเดอร์,
   คงหลักฐาน charge ในสถานะ `needs_review`, ห้ามจ่ายซ้ำ และให้เจ้าหน้าที่ตรวจสอบ.
   **ยังไม่มีการจองสต็อกตลอดช่วงรอ QR**; ต้องตกลง reservation กับ R3 ก่อน Live.
   ไม่มี automatic refund เพราะ PromptPay ไม่รองรับ refund/void ผ่าน Omise ตามเอกสาร.

Webhook/localhost และกู้รายการไม่ทราบผล:

- เครื่อง local ใช้ปุ่มตรวจผล/อัปเดตทุก 6 วินาทีเฉพาะแท็บที่เปิดอยู่; ไม่ต้องเปิด tunnel.
- deploy ภายหลังลงทะเบียน HTTPS endpoint `/api/payments/omise/webhook` ใน Omise Dashboard.
  หากตั้ง `OMISE_WEBHOOK_SECRET` ให้ใช้ **Base64 signing secret แยกจาก API Secret**;
  ตรวจ HMAC SHA-256 บน timestamp + `.` + raw body และเวลาคลาดเคลื่อนไม่เกิน 5 นาที.
  หากยังไม่มี signing secret ยังคง GET charge เพื่อตรวจข้อมูลทุกครั้งก่อนเปลี่ยนสถานะ.
- กรณีสร้าง charge สำเร็จแต่ response หายและ localhost ไม่ได้รับ webhook:
  หา charge ใน Test Dashboard ด้วย metadata `checkout_attempt` ตรงกับรหัสอ้างอิง.
  เจ้าของรายการเรียก sync ด้วย `{ "charge_id": "chrg_test_..." }` เพื่อผูกกลับ;
  server จะ GET และตรวจข้อมูลทั้งหมดก่อนบันทึก ห้ามแก้ DB เป็น successful ด้วยมือ.
- `needs_review`: แก้สาเหตุ fulfillment แล้ว sync เดิมอีกครั้งเพื่อ retry transaction;
  ไม่สร้าง charge ใหม่. ยังไม่มีหน้าจอ Admin สำหรับ reconciliation โดยเฉพาะ.
- Test Dashboard เลือก charge → Actions → Successful/Failed; **ห้ามสแกนด้วยแอปธนาคาร**.

ตรวจการเชื่อมต่อแบบ opt-in: `docker compose exec -T api node scripts/omise-smoke.js`
สร้าง Test charge 20 บาทหนึ่งรายการ แล้ว mark failed และ GET ตรวจผล; ไม่สร้างออเดอร์.
ชุดทดสอบปกติใช้ provider/stock doubles ไม่เรียก Omise ภายนอก และไม่ถือว่าได้ทดสอบ R3 จริง.

เอกสารอ้างอิง: [PromptPay](https://docs.omise.co/promptpay),
[Charge/ref_id](https://docs.omise.co/charges-api), [Webhook](https://docs.omise.co/api-webhooks).

**อัปเดต 16 ต.ค. 2026:** Checkout ปกติเชื่อม Omise Test PromptPay แล้วตามหัวข้อท้ายเอกสาร
ส่วน flow จำลอง Step 3 ด้านล่างเก็บเป็นประวัติและ service tests; HTTP `POST /orders` ปิดแล้ว
หน้า `?preview=1` ยังคงจำลองในเบราว์เซอร์ ไม่เรียก Omise. ยังไม่รองรับ Live payment หรือบัตร.
Auth ใช้ R2; Quotes/Create ต้องยืนยันอีเมลแล้ว; อ่าน Order ต้องล็อกอินและเป็นเจ้าของ.
ขอบเขต Step 3 เดิมยังไม่รวมยืนยันรับของ/Admin Orders; โค้ดปัจจุบันมีทั้งสองส่วนแล้ว ส่วน Waiting/ยกเลิกและ Events transport ยังไม่เปิดใช้.

| Method | URL | สำเร็จ |
|---|---|---|
| POST | `/orders/quotes` | 200 `{ data: quote }` |
| POST | `/orders` | 409 `PAYMENT_PROVIDER_REQUIRED` — ใช้ payment-attempts แทน |
| GET | `/orders/:id` | 200 `{ data: order }`; ไม่ใช่ของผู้ใช้ตอบ 404 |

### ตรวจยอดก่อนสั่งซื้อ

```json
{
  "product_ids": [12, 13],
  "address_id": 1,
  "shipping_method": "standard",
  "payment_method": "promptpay"
}
```

- `product_ids`: integer บวก 1–100 รายการ ต้องอยู่ในตะกร้าของผู้ใช้; normalize ไม่ซ้ำและเรียง ID.
- `shipping_method`: `standard` (40 บาท, ฟรีเมื่อยอดสินค้า >=1500) หรือ `express` (80 บาทเสมอ).
- `payment_method`: `bank_transfer`, `promptpay`, `card` ทั้งหมดจำลอง.
- Backend อ่านราคา/จำนวน/สต็อกจากฐานข้อมูลและตรวจเจ้าของที่อยู่ ไม่รับยอดจาก client.
- ตอบ `items`, `shipping_address` (ship_* snapshot), `shipping_method`, `payment_method`,
  `subtotal`, `shipping_fee`, `grand_total` เป็นตัวเลขบาท และ `quote_hash` SHA-256.
- คิดเงินเป็นจำนวนเต็มสตางค์ก่อนแปลงกลับเป็นบาท; ไม่มีส่วนลด.

### ยืนยันสั่งซื้อแบบจำลองเดิม (service tests เท่านั้น; HTTP ปิดแล้ว)

ส่ง body เดิมพร้อม `quote_hash` จาก quote ล่าสุด, `checkout_key` UUID v4 และ
`simulation_result`: `succeeded` หรือ `failed`.

```json
{
  "product_ids": [12, 13],
  "address_id": 1,
  "shipping_method": "standard",
  "payment_method": "promptpay",
  "quote_hash": "<64 lowercase hex characters from quote>",
  "checkout_key": "<UUID v4 generated for this attempt>",
  "simulation_result": "succeeded"
}
```

สร้าง Order + OrderItems + Payment + sale StockMovement ผ่าน R3 + initial OrderStatusLog
และลบเฉพาะรายการที่ซื้อจากตะกร้าใน `withTransaction` เดียวกัน.
ล็อก cart ตามผู้ใช้ และล็อก product ตาม ID เรียงลำดับก่อนยืนยันยอด/ตัดสต็อก.
จ่ายสำเร็จเริ่ม `current_status = paid`, Payment `status = succeeded`,
`method = simulated_<payment_method>`; ไม่สร้างสถานะ Waiting ที่ยังไม่ตกลง.
จ่ายจำลองไม่สำเร็จตอบ 409 และ rollback ทั้งชุด ไม่สร้างออเดอร์เปล่าหรือหักสต็อก.

`checkout_key` ผูกกับผู้ใช้และ fingerprint ของ request. ส่ง key/body เดิมพร้อมกันหรือ retry
ได้ออเดอร์เดิมโดยไม่จ่าย/ตัดสต็อกซ้ำ; key เดิมกับ body อื่นตอบ 409.
หน้าจอเก็บคำขอที่ยังไม่ทราบผลใน sessionStorage แยกตาม user_id และ retry ด้วย key เดิม.
หาก refresh หลังเครือข่ายขาด ให้กดตรวจผลคำขอเดิมก่อนเริ่มคำขอใหม่.

| Error | ความหมาย |
|---|---|
| 400 `VALIDATION_ERROR` / `INVALID_TOTAL` | รูปแบบข้อมูลหรือยอดเกินขอบเขต NUMERIC(12,2) |
| 404 `ADDRESS_NOT_FOUND` / `ORDER_NOT_FOUND` | ไม่มีข้อมูลหรือไม่ใช่เจ้าของ |
| 409 `CART_EMPTY` / `CART_CHANGED` | รายการที่เลือกไม่ตรงกับตะกร้าปัจจุบัน |
| 409 `OUT_OF_STOCK` | สินค้าซ่อน/ไม่พร้อมขาย/จำนวนเกินสต็อก |
| 409 `QUOTE_CHANGED` | ราคา ชื่อ จำนวน หรือ snapshot ที่อยู่เปลี่ยน ต้องตรวจยอดและยืนยันใหม่ |
| 409 `PAYMENT_SIMULATED_FAILED` | จ่ายจำลองไม่สำเร็จ ไม่มีผลข้างเคียง |
| 409 `IDEMPOTENCY_CONFLICT` | ใช้ key เดิมกับ request อื่น |
| 503 `AUTH_NOT_READY` / `ADDRESS_NOT_READY` / `INVENTORY_NOT_READY` | dependency ยังไม่พร้อม ปิดการซื้อไว้ |

### Response Order ขั้นต้น

`order_id`, `current_status`, `placed_at`, `subtotal`, `shipping_fee`, `grand_total`,
`shipping_method`, `carrier`, `tracking_no`, `shipping_address`,
`items: [{order_item_id, product_id, quantity, unit_price_at_purchase, title_snapshot, cover_image_url}]`,
`payment: {amount, method, status, paid_at, simulated}`.
ชื่อ ราคา และที่อยู่เป็น snapshot; รูปดึงจาก product ปัจจุบัน.
ออเดอร์เก่าก่อน migration ที่ไม่มี subtotal/ค่าส่งแสดง `null` ไม่แต่งประวัติย้อนหลัง.

### Migration และจุดเชื่อมเพื่อน

- เพิ่ม `003_r5_checkout.sql` (เว้น 002 ให้ R2): subtotal, shipping_fee, shipping_method,
  checkout_key, checkout_request_hash และ unique/check constraints. ไม่แก้ 001.
- R2: ใช้ `addresses.service.getForUser(userId,addressId,client)` และ `toShippingSnapshot(address)`.
- **R3 ยังไม่มี implementation ใน branch นี้**. `orders.integrations.js` เป็น boundary รอการตกลง;
  contract ที่เสนอคือ `inventory.service.deductStock(client, {product_id, quantity, order_item_id, created_by})`.
  ต้องตรวจและหักสต็อกแบบ atomic พร้อมบันทึก sale movement ใน client เดียวกัน; ถ้าของไม่พอต้อง throw.
  **ชื่อ export/signature นี้ยังไม่ใช่ contract ที่ R3 ยืนยัน ต้องปรับ adapter ก่อน integration.**
- ไม่มี fallback ที่เขียน stock ใน R5 เมื่อ dependency หาย จึงยังซื้อผ่าน API จริงไม่ได้จนเชื่อมครบ.
- เทสต์ Checkout ใช้ stock/address contract doubles กับ PostgreSQL จริงเพื่อตรวจ R5 transaction,
  rollback, ownership และ concurrency ไม่ใช่การยืนยัน implementation ของ R2/R3.

### Preview สำหรับตรวจหน้าจอ

`/cart?preview=1` -> เลือกสินค้า -> `/checkout?preview=1` -> `/order-detail?preview=1`.
เปิด Checkout Preview โดยตรงจะมีสินค้าตัวอย่าง 4 รายการตาม Design.
เลือกที่อยู่ตัวอย่าง ส่งธรรมดา/ด่วน และจำลองสำเร็จ/ไม่สำเร็จได้.
Preview ใช้ sessionStorage คนละ key กับข้อมูลจริง ไม่เรียก Cart/Orders/Address API
และไม่สร้างข้อมูลในฐานข้อมูล. ใบสรุปมีป้าย PREVIEW และยังไม่แสดงเลขขนส่งสมมุติ.

## ประวัติการซื้อและรายละเอียด (R5 · Step 4)

### `GET /orders`

ต้องล็อกอิน (ไม่บังคับ verified สำหรับการอ่าน). ระบุเจ้าของจาก `req.user.user_id` เท่านั้น.

| Query | ค่า |
|---|---|
| `status` | ไม่ส่ง = ทั้งหมด; หรือ `paid`, `packing`, `shipped`, `delivered`, `completed`, `cancelled`, `refunded` |
| `status=shipping` | กลุ่มที่กำลังส่ง: รวม `shipped` และ `delivered` |
| `page` | integer 1–1000000; ค่าเริ่มต้น 1 |
| `pageSize` | integer 1–50; ค่าเริ่มต้น API 20; หน้าเว็บ 10 |

query ที่เป็น array/object, เลขทศนิยม, exponent, สถานะที่ไม่มีใน schema หรือค่าพ้นขอบเขต
ตอบ 400 `VALIDATION_ERROR`. ไม่รับ user ID จาก client และไม่อ่านออเดอร์บัญชีอื่น.
เรียง `placed_at DESC, order_id DESC`; count/page อ่านใน transaction แบบ repeatable-read read-only.

```json
{
  "data": [{
    "order_id": 12,
    "current_status": "packing",
    "placed_at": "2026-09-12T07:20:00.000Z",
    "grand_total": 240,
    "item_count": 2,
    "total_quantity": 2,
    "first_item": {
      "product_id": 3,
      "title_snapshot": "ชื่อสินค้า ณ เวลาซื้อ",
      "quantity": 1,
      "cover_image_url": "/assets/products/example.jpg"
    }
  }],
  "meta": { "page": 1, "pageSize": 20, "total": 1 }
}
```

แถวประวัติเป็นหนึ่งแถวต่อ Order. แสดงสินค้ารายการแรกและจำนวนรายการที่เหลือ แต่ราคาแถว
ใช้ grand_total ของทั้ง Order ไม่ใช่ราคาของสินค้าชิ้นแรก. ไม่ส่งที่อยู่หรือข้อมูลส่วนตัวในรายการ.
ตาราง product เปลี่ยนชื่อ/ราคา/เป็น hidden ภายหลังไม่เปลี่ยนชื่อหรือยอดประวัติซื้อ.
ภาพสินค้าเป็น URL ปัจจุบัน ไม่ใช่ snapshot.
หน้าเกินจำนวนหรือไม่มีผลลัพธ์ตอบ data ว่างโดยคง meta.total ที่ถูกต้อง.

### `GET /orders/:id` เพิ่มใน Step 4

เพิ่ม `status_history: [{from_status, to_status, changed_at}]` เรียงเวลาแล้วตาม log ID.
ไม่ส่ง note ภายในหรือ changed_by ของแอดมิน. รายละเอียดและประวัติอ่านจาก snapshot เดียวกัน;
ไม่พบ/คนละเจ้าของยังตอบ 404 `ORDER_NOT_FOUND`.
หน้ารายละเอียดแสดงสถานะจริงรวม cancelled/refunded; Step 5 เพิ่มปุ่มยืนยันรับสินค้าเฉพาะ delivered.
แสดง Payment ตามสถานะที่บันทึก (succeeded/failed/refunded) ไม่เขียนว่าสำเร็จเสมอ.
กรณีไม่มี Payment หรือไม่มี breakdown เก่าจะแจ้งว่าข้อมูลไม่ครบ ไม่แต่งราคา/ค่าส่งขึ้นเอง.
Timeline เป็นประวัติสถานะระบบร้าน ไม่ใช่ API ติดตามตำแหน่งจากบริษัทขนส่ง.

### หน้าเว็บและ Preview

- `/orders`: ประวัติจริง ต้องล็อกอิน; เพิ่มเมนูประวัติเมื่อมี token ตาม header ปัจจุบัน.
- `/orders?preview=1`: ประวัติตัวอย่าง กรองสถานะ กดรายละเอียดได้ และรวมใบสรุป Checkout Preview
  ล่าสุดใน tab เดียวกันถ้ามี. ตัวอย่างเหล่านี้ไม่ใช่ออเดอร์ในฐานข้อมูล.
- `/orders?preview=empty`: หน้าประวัติว่างตาม Design 25b.
- ทดสอบแบ่งหน้าได้ด้วย `pageSize=2`; filter/page อยู่ใน URL และรองรับ Back/Forward.
- `/order-detail?id=PREVIEW-1002&preview=1`: ตัวอย่างรายละเอียดที่เลือกจาก History.
- แท็บ paid ใช้ข้อความชำระเงินแล้วแทน waiting ที่ schema ยังไม่รองรับ.
- cancelled/refunded แสดงข้อมูลที่อ่านได้เท่านั้น; ยังไม่มี flow ยกเลิก คืนเงิน หรือคืนสต็อก.
- รองรับ TH/EN ธีมกลาง มือถือ สถานะ loading/error/ไม่พบผลลัพธ์ และปุ่มลองใหม่.
- Step 4 ไม่เปลี่ยน schema; งาน Step 5 อธิบายในหัวข้อถัดไป.
- รวม Auth ของ R2 แล้วและตรวจอ่าน Cart/Orders ผ่านการล็อกอินจริงได้; Preview ไม่ข้ามสิทธิ์ API.

## Admin Orders และยืนยันรับสินค้า (R5 · Step 5)

สถานะงาน: 🟡 รวม Auth/Address ของ R2 แล้ว ตรวจสิทธิ์อ่านเบื้องต้นได้ แต่ยังรอ Inventory/Events และตรวจเส้นทางซื้อจริงครบชุด.
ไม่มี migration ใหม่ ไม่มี payment gateway หรือ carrier API ในขั้นนี้.

### สิทธิ์และข้อมูล

ทุก `/admin/orders` endpoint ผ่าน `requireAuth` ของ R2 (boundary เดิมที่ใช้ Cart).
จากนั้นตรวจในฐานข้อมูลว่า `user.is_active=true` และมีแถวใน `admin` ตามสัญญา R2 (BR-30).
ไม่ใช้ `user.role` ตัดสินสิทธิ์ เพราะอาจไม่ตรงกับ admin membership.
สิทธิ์ไม่อิง token payload หรือการซ่อนเมนูหน้าเว็บเพียงอย่างเดียว.
Service ตรวจสิทธิ์ซ้ำใน transaction. Auth middleware ของ R2 ถูกนำเข้ามาพร้อม main แล้ว.
หากใช้ module บนฐานเก่าที่ไม่มี middleware boundary จะตอบ 503 `AUTH_NOT_READY` โดยไม่เปิดสิทธิ์ชั่วคราว.
อ่านชื่อผู้รับ/ที่อยู่/โทรศัพท์เท่าที่ต้องใช้จัดส่ง; ไม่ส่ง password/token/email หรือข้อมูลบัญชีอื่น.

### `GET /admin/orders`

- Query `status`, `page`, `pageSize` ใช้กฎเดียวกับประวัติของลูกค้า; ค่าเริ่มต้น 1 / 20.
- `q`: ข้อความไม่เกิน 100 ตัวอักษร ไม่มี control character; ค้น substring ในเลข order_id,
  ชื่อผู้รับ snapshot หรือเลขพัสดุ. ค้นรหัสจริงด้วยส่วนตัวเลข เช่น `12` ไม่ใช่ `ORD-0012`.
- เรียง `placed_at DESC, order_id DESC`; count/page ใช้ snapshot เดียวกัน.
- `{data:[{order_id,current_status,placed_at,grand_total,ship_name,carrier,tracking_no,item_count}],
  meta:{page,pageSize,total}}`.
- รายการนี้รวมทุกบัญชี เฉพาะแอดมินเท่านั้น; แยกจาก `GET /orders` ที่มี owner scope.

### `GET /admin/orders/:id`

ส่ง `{data:order}` รูปแบบเดียวกับรายละเอียดลูกค้า รวมสินค้า/ยอด/Payment/ที่อยู่/ประวัติสถานะ.
รายละเอียดทั้งฝั่งลูกค้าและแอดมินเพิ่ม `fulfillment_version` เป็น log ID สูงสุดหรือ 0 ถ้าไม่มี log.
History ยังคงไม่ส่ง note ภายในหรือ changed_by.

### `PATCH /admin/orders/:id/fulfillment`

```json
{
  "expected_status": "packing",
  "expected_version": 123,
  "status": "shipped",
  "carrier": "ชื่อบริษัทขนส่ง",
  "tracking_no": "TRACK-12345"
}
```

- ใช้ version ที่เพิ่งอ่านจากรายละเอียด ไม่ใช้จำนวนแถว history เดาเอง.
- รับเฉพาะฟิลด์ในตัวอย่าง; status/expected_status ต้องเป็น paid/packing/shipped/delivered;
  expected_version เป็น safe integer >= 0. ไม่รับแก้ยอด ที่อยู่ user_id หรือ Payment.
- เปลี่ยนได้ทีละขั้น `paid → packing → shipped → delivered` เท่านั้น.
- `packing → packing` และ `shipped → shipped` ใช้แก้ carrier/tracking; ข้อมูลไม่เปลี่ยนไม่เพิ่ม log.
- carrier/tracking_no เป็น string ไม่เกิน 100 ตัวอักษร ไม่มี control character; trim ช่องว่าง.
  ไม่ส่ง = คงค่าเดิม; string ว่าง = NULL. ต้องมีทั้งคู่เมื่อเปลี่ยนเป็น shipped/delivered.
- ต้องมี Payment.status=succeeded ก่อนทำ fulfillment.
- Lock Order และ Payment; ตรวจ expected_status/expected_version เพื่อป้องกันการบันทึกทับ
  ทั้งการเปลี่ยนสถานะและการแก้เลขพัสดุพร้อมกัน. UPDATE และ INSERT order_status_log
  (changed_by=admin ID) อยู่ transaction เดียวกัน.
- สำเร็จ 200 `{data:order}`. สถานะ/ข้อมูลเก่า 409 `ORDER_CHANGED`, ข้ามขั้น/ย้อนขั้น
  409 `INVALID_ORDER_TRANSITION`, Payment ไม่สำเร็จ 409 `ORDER_NOT_PAID`, ขาดข้อมูลพัสดุ
  400 `TRACKING_REQUIRED`, ไม่พบ 404 `ORDER_NOT_FOUND`, ไม่มีสิทธิ์ 403 `FORBIDDEN`.
- ยังไม่เปิด cancelled/refunded หรือแก้สต็อก; ไม่เปลี่ยน completed โดยแอดมิน.
- delivered คือการบันทึกด้วยมือของแอดมิน ไม่ใช่การยืนยันอัตโนมัติจากบริษัทขนส่ง.

### `POST /orders/:id/receipt`

Body `{}`; เจ้าของออเดอร์ที่ผ่าน Auth และ verified เท่านั้น. Lock Order พร้อม owner condition.
`delivered → completed`; update กับ status log อยู่ transaction เดียวกัน (changed_by=NULL,
เพราะ foreign key ของ changed_by อ้างตาราง admin; note ระบุว่าลูกค้ายืนยันรับ).
ทำซ้ำเมื่อ completed ตอบออเดอร์เดิม 200 ไม่เพิ่ม log. สถานะอื่นตอบ
409 `INVALID_ORDER_TRANSITION`; คนละเจ้าของ/ไม่พบตอบ 404. ไม่มีการแก้ Payment/สต็อก.

### หน้าเว็บและ Design

- `/admin/orders`: ต้องล็อกอินและผ่านสิทธิ์จริงจาก API; มี loading/login/forbidden/error/empty.
- `/admin/orders?preview=1`: ข้อมูลสมมติ กดรายละเอียดและลองบันทึกสถานะ/เลขพัสดุได้.
- `/admin/orders?preview=empty`: ตัวอย่างรายการว่าง.
- `/admin/orders?preview=1&id=PREVIEW-1001`: ตัวอย่างออเดอร์กำลังแพ็ก.
- Preview ไม่มี API request; บันทึกเฉพาะ sessionStorage `mdr_preview_fulfillment` แยกจากข้อมูลจริง.
  ประวัติและรายละเอียด Preview อ่าน override เดียวกันในแท็บเดียวกัน. เปิดแท็บแยกไม่ซิงก์.
  ปุ่มเริ่มตัวอย่างใหม่ล้างเฉพาะ fulfillment override ไม่ล้าง token/ตะกร้า/ฐานข้อมูล.
- ลูกค้ามีปุ่มยืนยันรับสินค้าเฉพาะ delivered พร้อมกดยืนยันซ้ำก่อนส่งคำขอ; completed แสดงข้อความจบงาน.
- เมื่อบันทึกผิดพลาด/ไม่ทราบผล ให้โหลดข้อมูลล่าสุดก่อนลองใหม่ ไม่ส่งคำขอซ้ำอัตโนมัติ.
- ยังไม่มี Admin Orders frame โดยตรงในหน้า 02 Wireframe. ใช้ sidebar/table/toolbar จาก
  05-Admin-Product-List (`11:152`) เป็นแนวทาง และใช้ component เดิมของโปรเจกต์.
  รายละเอียด/ขั้นรับสินค้าดู 24d (`53:859`) และ 24e (`53:946`); ไม่เพิ่ม flow Review/Refund ของ R1.
- รองรับ TH/EN และธีมกลาง. เมนู Admin ใน header ยังใช้ token-based visibility เดิมของโปรเจกต์;
  API เป็นตัวบังคับสิทธิ์จริง รอรวม role-aware navigation กับ R2.

ตรวจล่าสุด 16 ต.ค. 2026: Backend ผ่าน 56 tests รวม fulfillment 14, Cart 6 และ API auth boundary 1.
Frontend helper/translation/asset tests ผ่าน 10 tests ด้วย
`node --test frontend/test/r5-contract.test.mjs` (ใช้ Node 24 บนเครื่อง ไม่ต้องติดตั้ง package).
รวม 66 tests. เทสต์ Service ใช้ PostgreSQL จริงกับ fixture แยกแล้วล้างตาม ID ของตัวเอง;
ยังไม่ใช่การทดสอบ HTTP ที่ล็อกอินผ่าน Auth ของ R2 ครบเส้นทาง.

#### ปรับ Pagination หน้า Admin Orders

- แสดงช่วงรายการและจำนวนหน้าชัดเจน เช่น แสดง 1–3 จาก 7 คำสั่งซื้อ · หน้า 1/3.
- มีปุ่มเลขหน้า พร้อมก่อนหน้า/ถัดไป (ปิดใช้งานเมื่อสุดทาง); จำนวนหน้ามากใช้เครื่องหมาย ….
- เลือกจำนวนต่อหน้า 3/5/10/20/50 ได้; เปลี่ยนจำนวนหรือค้นหาใหม่กลับหน้า 1.
- ค่าเริ่มต้นหน้า Preview = 3 เพื่อดูหลายหน้าได้จากตัวอย่าง 7 ออเดอร์; หน้าจริง = 20.
- pageSize อยู่ใน URL และส่งให้ API; รับ integer 1–50 ตาม contract เดิม.
- คงตัวกรอง/คำค้นหา/pageSize เมื่อเปลี่ยนหน้า เข้า detail และกลับรายการ.

### ผลตรวจก่อนรวม main 16 ตุลาคม 2026

- Local HEAD `77e84d9`, fetched `origin/main` `6aa8b39`: ฐาน local ตามหลัง 13 commits.
  Fetch อัปเดต remote refs เท่านั้น ยังไม่ merge/pull เข้า working tree.
- R2 Auth/Address PR #39 รวม main แล้ว; frontend role guard และเมนูตามบัญชีพร้อมใช้ upstream.
  ดังนั้นส่วนนี้พร้อมเริ่ม Integration หลังรวม main ไม่ได้รอเพื่อนเขียนใหม่.
- R3 Admin Products/Catalog PR #40, R4 Team/Header PR #36 และ R2 mobile fix #41 รวม main แล้ว.
  ต้องปรับ Admin Orders ให้ใช้ admin-layout กลาง และเพิ่มลิงก์ Order/Cart ลงเมนูใหม่เมื่อรวม main.
- R3 inventory และ R4 events บน main ยังมีเพียง `.gitkeep`; ยังไม่มี adapter ให้เชื่อมจริง.
- R2 seed staff PR #42 ยังเปิดอยู่. ไม่จำเป็นต้องรอ PR นี้เพื่อเริ่มใช้ Auth/Address.
- ทดสอบ Preview บนมือถือ 360px/390px และ desktop 1440px; เส้นทางเลือกสินค้าถึงยืนยันรับ
  รวมค่าจัดส่งธรรมดา/ด่วน ผลจ่ายจำลองสำเร็จ/ล้มเหลว กรอง/แบ่งหน้า หน้าว่าง และ login guard.
- พบ header กลางฐานเก่าล้นจอเมื่อภาษาไทย (ประมาณ 418px ที่ viewport 360/390px).
  เนื้อหา main ของ R5 ไม่ล้น; อังกฤษไม่พบการล้นดังกล่าว. ใช้ header responsive ของ R2/R4
  จาก main และตรวจซ้ำตอน Integration ไม่เพิ่ม CSS ทับ header ของเพื่อนในหน้า R5.
- แก้ Checkout ให้ไม่ส่งคำสั่งซื้อหากบันทึก checkout retry key ไม่ได้; ใช้ error เดิมของระบบ.
  ปรับข้อความ login ให้ตรงกับ Checkout/Orders/Admin และข้อความสำเร็จให้เปลี่ยน TH/EN ได้.
- Payment ยังจำลอง; Omise, Waiting, ยกเลิก/คืนเงิน, carrier API และ Events ยังไม่พร้อมใช้งานจริง.
- งาน 2–5 จึงยังเป็น 🟡 แม้ automated tests ของ R5 จะผ่านแล้ว.

### หลังรวม main 16 ตุลาคม 2026

- Branch `feat/r5-cart` อัปเดต HEAD เป็น `6aa8b39` ตรงกับ `origin/main`; งาน R5 ยังเป็น working changes ไม่ commit/push.
- สำรองไฟล์แก้ไข 48 ไฟล์ไว้นอก repo และคง safety stash ก่อนรวมไว้. แก้ conflict เฉพาะ docs/layout/locales โดยเก็บทั้งสองฝั่ง.
- R5 service/controller/SQL/preview logic คงเดิม; HTML ของ R5 5 หน้าเพิ่มเฉพาะ font link Bodoni Moda ให้ตรงกับการโหลดฟอนต์แบบใหม่ของ main.
- Header ใช้ role-aware menu ของ R2 พร้อม Cart icon, Customer Orders และ Admin Orders ของ R5.
- Rebuild dependencies ของ R2, migrate 002 และ seed บัญชี/ที่อยู่สำเร็จ โดยคง database volume เดิมและไม่ reset ข้อมูล.
- Backend หลังรวม: 127 tests ทั้งหมด ผ่าน 126 ข้าม 1 (กรณี missing Auth ไม่เข้าเงื่อนไขแล้ว) ล้มเหลว 0.
  Frontend tests ผ่าน 10/10.
- HTTP จริง: ล็อกอิน customer แล้ว GET Cart/Orders/Addresses ตอบ 200; Admin Orders ตอบ 403.
  ล็อกอิน staff แล้ว GET Admin Orders ตอบ 200. ไม่ได้ใช้ token ปลอมหรือข้าม middleware.
- Preview Cart/History ยังทำงาน; header ภาษาไทยจอ 360px ไม่ล้นแล้วหลังใช้ CSS ใหม่จาก main.
- Inventory/Events/Omise ยังไม่เชื่อม; ยังไม่ถือว่าเส้นทางสั่งซื้อจริงพร้อมใช้งานครบชุด.

### Admin layout และ Cart HTTP — 17 ตุลาคม 2026

#### ตรวจงานที่เดินต่อได้โดยไม่รอทีม

- Fetch ล่าสุด: `origin/main=a01ff0d` เพิ่ม seed บัญชี staff ทีมผ่าน PR #42 เท่านั้น;
  local HEAD ยังคง `6aa8b39` ไม่ merge/ไม่ทับ working changes.
  Inventory/Events ยังเป็น `.gitkeep`; Products routes ยังมีเฉพาะ GET.
- ผลชุดทดสอบหลังแก้ Detail/Cart และ Admin UI: Backend ผ่าน 146 ข้าม 1 ล้มเหลว 0;
  Frontend ผ่าน 18 รวม product-cart component ใหม่ 5 ข้อ (login redirect, sold out,
  จำนวน/validation, double click, response uncertain, TH/EN success).
- แก้ข้อความเพิ่มตะกร้าสำเร็จ/validation ให้แปลใหม่เมื่อสลับภาษา.
- ตรวจ UI 6 หน้า: Detail จริง, Cart/Checkout/Orders/Order Detail/Admin Orders Preview;
  จอ 360 และ 1440px, TH/EN, light/dark รวม 48 กรณี ไม่พบหน้าล้นแนวนอน.
  ตาราง Admin เลื่อนภายในกรอบเมื่อพื้นที่แคบ. การตรวจ Preview ไม่แทน integration ของ Inventory.
- คงสินค้าทดสอบ 3 รายการใน local DB ให้ผู้ใช้ลอง: `[TEST R5] Labubu Macaron` 590 บาท stock 10,
  `Collector Card` 125.50 stock 3, `Model Limited Stock` 1499 stock 1.
  ทุกชื่อมี `[TEST R5]` และ attributes `r5_demo=true`, ไม่มีการสร้าง charge/order.
- สร้าง fixture นี้ซ้ำได้ด้วย `docker compose exec -T api node scripts/r5-demo-products.js`.
  เป็นคำสั่ง opt-in สำหรับ local dev เท่านั้น ไม่รวมใน seed อัตโนมัติ; รันซ้ำไม่เพิ่มซ้ำ
  และไม่ reset สต็อก/ราคาที่มีอยู่. ทดสอบด้วย `customer` ผ่านหน้า Search/Detail/Cart.

- Admin Orders ใช้ `admin-layout.js` + `admin.css` กลาง เช่นเดียวกับ Admin Products:
  แถบบน, เมนูซ้าย, สลับภาษา/ธีม, ชื่อบัญชี และ logout. เพิ่มลิงก์ Orders ในเมนูกลาง.
- เอา sidebar/header ของ Orders ที่ทำแยกไว้เดิมออก; ปรับสี component R5 ตาม token ของ Admin.
- เฉพาะ `/admin/orders?preview=1` และ `?preview=empty` แสดง fixture ได้โดยไม่ล็อกอิน;
  ไม่เรียก API. หน้าจริงใช้ `requireAdminPage` เดิม และ API ยังบังคับ Auth/Admin จริง.
- ตรวจในเบราว์เซอร์: layout กลางแสดงครบ, เปลี่ยนหน้า 2/3, เปิด detail แล้วกลับมายัง
  page/pageSize เดิมได้; หน้าจริงที่ไม่ล็อกอินไป `/login?next=%2Fadmin%2Forders`.
- เพิ่ม `backend/test/cart-http.test.js` 6 กรณีผ่านการล็อกอิน username/password จริงของ R2:
  เพิ่ม/รวมจำนวน, เพิ่มลด, stock overflow, validation, hidden product, unverified account,
  ownership, ลบเดี่ยว/หลายรายการ, concurrent additions, stock เปลี่ยน และตะกร้าว่าง.
  ใช้บัญชี/สินค้าใน PostgreSQL ที่สร้างเฉพาะรอบทดสอบ ล้างตาม ID หลังจบ;
  ไม่ใช้ Auth/Cart mocks และไม่แก้ตะกร้าหรือสินค้าของผู้ใช้เดิม.
- Cart HTTP ไม่สร้าง order/charge และไม่ตัดหรือจองสต็อก. Checkout ยังรอ Inventory ของ R3.

### ตรวจจัดส่งจนลูกค้ายืนยันรับจริง — 17 ตุลาคม 2026

#### จุดเชื่อม Detail → Cart ที่แก้เพิ่มเติม

- พบหน้า Detail เดิมแสดงเฉพาะชื่อ ยังไม่มีปุ่ม Cart แม้ Cart HTTP tests ผ่าน.
  เพิ่ม `product-cart.js` เป็นส่วนควบคุม R5 ที่ mount จาก Detail ของ R4:
  ราคา/stock, จำนวน, เพิ่มลงตะกร้า, เปิดตะกร้า, login redirect, TH/EN และ error.
- ใช้ `api.post('/cart/items', {product_id,quantity})`; ปิดกดซ้ำระหว่างส่ง,
  หาก response ไม่แน่นอนให้ตรวจตะกร้าก่อนเพิ่มซ้ำ. ไม่มีการเพิ่มสินค้าตัวอย่างเข้า API.
- ตรวจผ่าน UI จริงด้วย customer: เปิดสินค้าชั่วคราวราคา 125.50 เลือก 2 ชิ้น,
  กดเพิ่มสำเร็จ เปิด `/cart` เห็นจำนวน 2 ยอดสินค้า 251.00; ล้าง fixture หลังจบ.
- สินค้าตัวอย่างที่ Home แสดงเมื่อ catalog ว่างไม่มีแถว product จริง จึงซื้อไม่ได้;
  ต้องเพิ่มสินค้าสถานะ available และ stock > 0 ผ่าน Admin Products ก่อนลองซื้อเอง.

- เพิ่ม `backend/test/fulfillment-http.test.js` ผ่าน 3 กลุ่ม: ล็อกอินผ่าน R2 จริง,
  `paid → packing → shipped → delivered → completed`, อ่านเลขพัสดุ/ประวัติ,
  retry receipt ไม่เพิ่ม log, สิทธิ์เจ้าของ/แอดมิน, ห้ามรับก่อน delivered,
  ห้ามข้ามสถานะ, stale version และห้ามจัดส่งเมื่อ payment ไม่สำเร็จ.
- ตรวจผ่านเบราว์เซอร์หน้าจริง ไม่มี `preview`: บัญชี seed `staff` กดแพ็ก,
  ใส่บริษัทขนส่ง/เลขพัสดุ, จัดส่ง, ถึงปลายทาง; logout แล้ว `customer` ล็อกอิน,
  เห็นข้อมูลตรงกัน กดยืนยันรับสองขั้นสำเร็จ. รีเฟรชแล้วยัง completed และ History แสดงรับของแล้ว.
- ตรวจ DB ยืนยัน status `completed` และ log ครบ 5 ขั้น. ล้างออเดอร์/สินค้าชั่วคราวแล้ว
  โดยคงบัญชี seed และข้อมูลเดิมไว้. ไม่มี charge ใหม่หรือการตัด stock ในการตรวจครั้งนี้.
- ผลรวมล่าสุด Backend 147 tests: ผ่าน 146 ข้าม 1 ล้มเหลว 0; Frontend ผ่าน 13/13.
- ขอบเขตนี้เริ่มจากออเดอร์ paid ที่สร้างเป็น fixture ไม่ได้เกิดจาก Checkout/Omise;
  การทดสอบซื้อถึงรับสินค้าครบเส้นทางยังรอ Inventory ของ R3.


### R5 — TrueMoney Wallet (Omise Test)

Checkout now offers only PromptPay and TrueMoney Wallet. Existing historical card/bank-transfer records remain readable.

- POST /api/orders/quotes: payment_method accepts promptpay or truemoney. The selected method is bound into quote_hash.
- POST /api/orders/payment-attempts: same checkout fields; truemoney additionally requires phone_number (string, exactly ten digits starting with 0). Browser-supplied amounts and return URLs are ignored. The phone is sent to Omise and retained in the private attempt snapshot; it is not emitted in analytics events or public order responses.
- TrueMoney limit: THB 20–100,000; PromptPay remains THB 20–150,000. Inventory readiness is checked before any payable charge.
- Attempt responses add payment_method and authorize_url. authorize_url is present only for a pending wallet charge, with HTTPS pay.omise.co allowed. qr_url is null for TrueMoney.
- The server creates the source and charge in one Omise request using source[type]=truemoney and source[phone_number]. Return URL is APP_URL + /checkout?payment_attempt=<server-attempt-uuid> (configure APP_URL for the actual frontend). The identifier carries no paid status; GET/sync enforce ownership and verify the provider.
- On return, restore the authenticated user's existing attempt and retrieve its charge through the server. Redirect parameters never establish payment success. Webhook and sync share source/amount/currency/metadata/Test-mode checks and idempotent finalization.
- Successful orders store payment.method=omise_test_truemoney. Failed/expired attempts preserve cart and create no order. Existing needs_review recovery applies.
- Test provider connection without creating an order: docker compose exec -T api node scripts/omise-smoke.js --truemoney. Creates THB20 using the official example phone, validates authorization URL, marks the charge failed and independently retrieves it. This does not prove completed Checkout integration.
- Checkout preview remains local simulation and does not contact Omise.

Reference: https://docs.omise.co/truemoney-wallet . Live activation requires requesting TrueMoney access from Omise; no Live keys are accepted by this implementation.


### R5 — Payment recovery and integration verification (2026-11-01)

- TrueMoney return identifies the server-created attempt via payment_attempt. Checkout validates the UUID, authenticates, reads the owned attempt and syncs it before treating it as paid. Query-string status/order_id are never trusted. Completed attempts can be restored even after the original tab/session storage is gone.
- The login next URL preserves this return identifier. A terminal-payment restart drops the old return query and opens /checkout. Browser back/forward cache restoration restarts countdown and checks the same attempt.
- Delayed pending notifications cannot reopen failed/expired attempts. Successful verified payments retain existing idempotent order creation, source/metadata/amount checks, stock transaction rollback and needs_review recovery.
- Automated full HTTP flows cover both methods: real authentication, Cart add/update/selection, quote, provider attempt, verified result, customer history/detail, admin packing/shipping/delivery, owner receipt, duplicate callbacks, exact stock movement and queued events. Only gateway and Inventory are injected contract doubles; no mock runtime mode is exposed to users.
- Final app integration still requires R3 Inventory and R4 event transport. No stock is reserved while a payment is pending; two paid customers competing for the last item yield one order and one needs_review. Uncertain creation without a known charge ID remains blocked from recharging until staff reconciles the Omise charge through the existing sync API.


### R5 — Order Detail links to R1 review/refund

- For delivered/completed orders with succeeded payment, the customer page reads GET /reviews/reviewable and GET /refund-requests/refundable through the shared API wrapper.
- Buttons are attached to each purchased item, using order_item_id: /write-review?item=<id> and /refunds?item=<id>. Only IDs returned as eligible by R1 are enabled; refund requires refundable_qty > 0. The R1 APIs remain authoritative for ownership, duplicate reviews, quantities and the seven-day window at submission time.
- Missing/failed eligibility API does not enable buttons. Healthy review/refund responses can still be used independently; the page offers a reload for unavailable eligibility. Preview buttons are disabled examples and never send fake IDs to R1.
- R5 fulfillment writes the delivered transition to order_status_log in the same transaction. Receipt writes delivered -> completed separately; it does not reset the refund window.
- Cross-module integration tests in omise-payments.test.js verify real R1 APIs against R5 paid orders with constructor-injected provider/Inventory doubles. R1 modules are now merged locally and these tests pass, including admin partial/full refund, stock movements, audit and payment/order status.


### R5 — Events / admin audit integration readiness (2026-11-02)

**Browser context:** POST /cart/items, POST /orders/quotes and POST /orders/payment-attempts accept optional session_id (1–100 ASCII letters/digits/underscore/hyphen; absent/null allowed for older clients). Invalid values return 400 INVALID_SESSION before mutation. R5 reads/writes the same mdr_session {id,last} format and 30-minute idle window as R1 events.js. Browser storage failure uses memory for the current page. Session is analytics context, never authorization.

**Single producer:** Cart add and verified purchase enqueue events on the server. R5 does not also call trackEvent in the browser. Updates/removals, failed mutations, preview, failed payments and duplicate completion do not create extra business events. Existing outbox rows remain readable; missing session context gets a stable opaque event-derived fallback.

**R4 adapter:** createEvents({r4Transport,receiverDeduplicates:true}) prepares bodies exactly {product_id,event_type,session_id}, one per unique product. Quantity/price/order/user identifiers do not enter this public body. r4Transport(body,{signal,idempotencyKey,userId}) is constructor-injected; it must resolve status 201 or 204 and pass user identity through an agreed trusted channel. Do not save/replay browser Bearer tokens in the outbox. Stable idempotency key is parent event key + product ID; receiver must honor it (e.g. a dedup header agreed with R4). The contract/helper from merged PR #51 does not yet specify this or server identity propagation; it does not provide the Events API implementation.

Migration 007 stores delivered_product_ids so partial success retries only unacknowledged products. Lost HTTP acknowledgement can still cause a retry of the same key; only receiver deduplication closes that gap. Per-call timeout is two seconds, AbortSignal forwarded. Payloads/raw transport errors/keys are not logged. Omise Test purchase events are excluded by default; allowTestEvents is explicit constructor-only test plumbing.

No real R4 transport, worker, environment switch or HTTP activation endpoint is enabled. Without an agreed dedup receiver, per-product dispatch returns contract_pending and sends nothing. The original internal envelope transport is preserved for existing adapter tests.

**Admin audit:** status and tracking changes call the R1 logAdminAction helper using the exact fulfillment transaction client when that module is present. Before R1 merge, an R5 adapter inserts the same parameterized shared admin_action_log schema. Both are mandatory: audit failure rolls back order/status/tracking writes. action_type is update_order_status or update_order_tracking, target_type=order, target_id=order ID. Notes contain only order code and transition, not addresses, names, phone numbers or tracking contents. Rejected/stale requests, unchanged tracking and customer receipt add no admin action. Receipt still has its separate order_status_log entry.

Isolated R1 activity integration adds order target codes/search and links /admin/orders?id=<id>, with TH/EN labels. The R1 shared-file extension is preserved separately in .local/r5/r1-order-audit-extension.patch pending the normal main merge; it is not copied into primary R1 paths before merge.
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
- ภายหลัง R4 จะเพิ่ม `GET /recommend/related/:productId` (สินค้าที่เกี่ยวข้อง) และ `GET /recommend/for-you` (ต้องล็อกอิน) ที่ใช้ `product.embedding`
R1 activity integration in the primary branch now includes order target codes/search and links /admin/orders?id=<id>, with TH/EN labels, after the main merge through PR #52. The earlier isolated patch is only a local backup, not a pending integration step.

### R5 → R4 Events — ข้อเสนอรอ R4 ยืนยัน (7 พ.ย. 2026)

**สถานะที่ตรวจ:** fetched `origin/feat/r4-events-api` ถึง `eca5f61` มี `POST /api/events` และเปิด `EVENTS_ENABLED` แล้ว แต่ยังไม่รวมเข้า main/branch R5 ที่ตรวจ (`origin/main` ขณะตรวจครั้งนั้น = `1ad3a21`). API ปัจจุบันรับ `{product_id,event_type,session_id}` อ่านผู้ใช้จาก Bearer token แบบ optional และ INSERT ทุกคำขอ ยังไม่พบ deduplication หรือช่องทางรับ trusted user identity จาก outbox ฝั่ง Backend ข้อเสนอต่อไปนี้ **ยังไม่ใช่ความสามารถของ API ปัจจุบัน** และยังไม่เปิดส่งจริงจาก R5

| เรื่องที่ต้องตกลง | ข้อเสนอของ R5 | สิ่งที่ขอให้ R4 ยืนยัน |
|---|---|---|
| ป้องกันส่งซ้ำ | ใช้ `Idempotency-Key` ใน header; key คงเดิมต่อ outbox event + product หนึ่งรายการ แม้ retry หรือคำตอบหาย ไม่เปลี่ยน public body | ชื่อ/ความยาว/ขอบเขต key และวิธีเก็บแบบ durable ที่กัน concurrent requests ได้; key เดิมและข้อมูลเดิมตอบสำเร็จโดยไม่ INSERT อีก, key เดิมแต่ข้อมูลต่างตอบ 409; กำหนดระยะเก็บให้ครอบคลุมช่วง retry |
| ตัวตนผู้ใช้จาก Backend | เรียก service ภายในที่ตรวจสอบตัวตนแล้ว โดยส่ง `userId` เป็น trusted context จาก outbox; หากใช้ HTTP ต้องมีช่องทางยืนยัน service แยกจาก Browser และตกลงรูปแบบก่อน | เลือก in-process service หรือ authenticated internal HTTP และระบุการตรวจสิทธิ์; ห้ามเชื่อ `user_id` ที่ Browser ส่งเอง ห้ามเก็บ/ส่งซ้ำ Bearer token ของลูกค้าใน outbox และไม่ลด event ของลูกค้าที่รู้ตัวตนให้เป็น anonymous โดยเงียบ ๆ |
| ผลตอบรับ | adapter R5 รับ HTTP 201 หรือ 204 เป็นการรับสำเร็จ; ส่งซ้ำที่ dedup แล้วให้ใช้ผลสำเร็จที่ตกลงกัน | ยืนยัน response ของรายการใหม่/รายการซ้ำ และให้ return หลัง event กับ dedup record commit แล้ว; กำหนด error/retry ให้ชัด |

**ทางส่งเดียว:** `add_to_cart` เข้าคิวหลังเพิ่มตะกร้าสำเร็จ; `purchase` เข้าคิวหลัง Backend ตรวจ provider และสร้าง Order สำเร็จ ไม่ส่งจากการแสดง QR หรือ redirect กลับมาอย่างเดียว ส่งแยกต่อสินค้าไม่ซ้ำในออเดอร์ โดยไม่เรียก `trackEvent()` ฝั่ง Browser ซ้ำสำหรับสอง event นี้ Omise Test purchase ยังไม่เข้าข้อมูลแนะนำจริงตามค่าเริ่มต้น

**เกณฑ์ก่อนเปิดใช้:** ทดสอบส่ง key เดิมซ้ำ/พร้อมกันแล้วมี event เดียว, คำตอบหายแล้ว retry ไม่เพิ่มแถว, ระบุผู้ใช้ถูกคนโดย Browser ปลอมไม่ได้ และส่งบางสินค้าสำเร็จแล้ว retry เฉพาะที่เหลือ เมื่อ R4 ยืนยัน contract จึงเชื่อม transport/worker และทดสอบร่วมกัน; ระหว่างนี้ R5 คงการส่งจริงปิดไว้


### R5 — รวม main 7 พ.ย. 2026

รวม upstream ถึง `9a5ada6` (PR #53–58) ใน working tree R5 แล้ว: Search/Detail, Events/Recommendation, Header และ Embedding/Docker. ใช้ Gallery/breadcrumb/specs ของ R4 พร้อม mount Cart ของ R5 โดยรักษาจำนวน/ผลการเพิ่มเมื่อสลับภาษา; ใช้ Header ของ R2 และคงเมนู Cart/Orders. Events API มีในแอปแล้ว แต่ outbox R5 ยังไม่เปิด dispatch เพราะ contract deduplication/trusted identity ยังรอยืนยัน. Inventory ยังไม่มี implementation. ข้อความก่อนหน้านี้ที่ระบุว่ายังไม่ merge เป็นบันทึกตามวันที่ตรวจ ไม่ใช่สถานะหลังรวมครั้งนี้.
