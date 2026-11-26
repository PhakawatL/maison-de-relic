// ===================== ตัวอย่างข้อมูลสำหรับทดสอบเว็บเซอร์วิสด้วย Postman =====================
// ใช้กับฐานข้อมูลตัวอย่าง (หลังสั่ง npm run db:reset) · ชุดเดียวกับ docs/testing/postman/maison-de-relic.postman_collection.json
// route ที่ต้องล็อกอิน: แท็บ Headers ใส่  Authorization: Bearer <token>  (token ได้จาก POST /api/auth/login)
//
// Testing Search สินค้าแบบไม่มีเกณฑ์ (Select All)
// method: get
// URL: http://localhost:3000/api/products
// ผลที่ควรได้: 200 OK · สินค้าที่วางขายทั้งหมด (แบ่งหน้า ดู meta.total)
//
// Testing Search สินค้าด้วยชื่อ (ตัวอย่างที่ 1)
// method: get
// URL: http://localhost:3000/api/products?q=charizard
// ผลที่ควรได้: 200 OK · สินค้าที่ชื่อมีคำว่า charizard
//
// Testing Search สินค้าหลายเกณฑ์ (ตัวอย่างที่ 2: หมวด + สภาพ)
// method: get
// URL: http://localhost:3000/api/products?category=figures&condition=like_new
// ผลที่ควรได้: 200 OK
//
// Testing Search สินค้าหลายเกณฑ์ (ตัวอย่างที่ 3: คำค้น + หมวด + ราคาสูงสุด)
// method: get
// URL: http://localhost:3000/api/products?q=holo&category=trading-cards&maxPrice=5000
// ผลที่ควรได้: 200 OK
//
// Testing View สินค้า 1 ชิ้น
// method: get
// URL: http://localhost:3000/api/products/1
// ผลที่ควรได้: 200 OK · id ที่ไม่มีอยู่ (เช่น 999999) → 404
//
// Testing Insert สินค้าใหม่ (ตัวอย่างที่ 1)
// method: post
// URL: http://localhost:3000/api/products
// header: Authorization: Bearer <token ของ ผู้ดูแล (Neptz หรือ staff)>
// body: raw JSON
// {
//     "title": "[Postman] Zaku II — ประกอบแล้ว",
//     "description": "ทดสอบเพิ่มสินค้าผ่าน Postman",
//     "category_id": 3,
//     "series_id": 3,
//     "status": "draft",
//     "condition": "like_new",
//     "price": 1290,
//     "stock_quantity": 2,
//     "attributes": {
//         "year": "2021",
//         "original_box": "yes"
//     }
// }
// ผลที่ควรได้: 201 Created · จด data.product_id ไว้ใช้ตอนแก้ไข/ลบ (หลัง db:reset จะได้ 61)
//
// Testing Insert สินค้าใหม่ (ตัวอย่างที่ 2)
// method: post
// URL: http://localhost:3000/api/products
// header: Authorization: Bearer <token ของ ผู้ดูแล>
// body: raw JSON
// {
//     "title": "[Postman] Labubu The Monsters — Have a Seat",
//     "description": "กล่องสุ่มเปิดแล้ว ตัวครบ",
//     "category_id": 4,
//     "series_id": 5,
//     "status": "available",
//     "condition": "new",
//     "price": 850,
//     "stock_quantity": 1
// }
// ผลที่ควรได้: 201 Created (หลัง db:reset จะได้ product_id 62)
//
// Testing Update สินค้า (ตัวอย่างที่ 1: แก้ราคาและเปิดขาย) — ส่งครบทุกช่อง
// method: put
// URL: http://localhost:3000/api/products/61
// header: Authorization: Bearer <token ของ ผู้ดูแล>
// body: raw JSON
// {
//     "title": "[Postman] Zaku II — ประกอบแล้ว (แก้ไข)",
//     "description": "แก้ราคาและเปิดขาย",
//     "category_id": 3,
//     "series_id": 3,
//     "status": "available",
//     "condition": "excellent",
//     "price": 1190,
//     "attributes": {
//         "year": "2021",
//         "original_box": "no"
//     }
// }
// ผลที่ควรได้: 200 OK
//
// Testing Update สินค้า (ตัวอย่างที่ 2: ซ่อนสินค้า)
// method: put
// URL: http://localhost:3000/api/products/62
// header: Authorization: Bearer <token ของ ผู้ดูแล>
// body: raw JSON
// {
//     "title": "[Postman] Labubu The Monsters — Have a Seat",
//     "description": "ซ่อนไว้ชั่วคราว",
//     "category_id": 4,
//     "series_id": 5,
//     "status": "hidden",
//     "condition": "new",
//     "price": 890
// }
// ผลที่ควรได้: 200 OK
//
// Testing Delete สินค้า (ตัวอย่างที่ 1)
// method: delete
// URL: http://localhost:3000/api/products/61
// header: Authorization: Bearer <token ของ ผู้ดูแล>
// ผลที่ควรได้: 200 OK (สินค้าที่เคยขายแล้วจะถูกซ่อนแทนการลบ)
//
// Testing Delete สินค้า (ตัวอย่างที่ 2)
// method: delete
// URL: http://localhost:3000/api/products/62
// header: Authorization: Bearer <token ของ ผู้ดูแล>
// ผลที่ควรได้: 200 OK · ลบซ้ำ → 404
// ====================================================================================

// routes ของสินค้า (R3) → /api/products
// อ่าน (GET) ไม่ต้องล็อกอิน เห็นเฉพาะสินค้าที่วางขาย · เพิ่ม / แก้ / ลบ เฉพาะแอดมิน (owner และ staff)
// รายการและรายละเอียดแบบเห็นทุกสถานะของแอดมินอยู่ที่ products.admin.routes.js (/api/admin/products)
const { Router } = require('express');
const controller = require('./products.controller');
const images = require('./product-images.controller');
const { requireAdmin } = require('../../middleware/auth');

const router = Router();

router.get('/', controller.list);        // GET /api/products?q=&category=&series=&condition=&minPrice=&maxPrice=&inStock=&sort=&page=&pageSize=
router.get('/:id', controller.getById);  // GET /api/products/:id

router.post('/', requireAdmin, controller.create);        // POST   /api/products
router.put('/:id', requireAdmin, controller.update);      // PUT    /api/products/:id  (ส่งครบทุกช่อง)
router.delete('/:id', requireAdmin, controller.remove);   // DELETE /api/products/:id  (เคยขายแล้ว = ซ่อนแทน)

// รูปสินค้า (แอดมิน) — ส่งไฟล์รูปเป็น body ตรง ๆ · เก็บใน Supabase Storage (docs/deploy.md ข้อ 3)
router.post('/:id/images', requireAdmin, images.readImageBody, images.upload);   // POST   /api/products/:id/images?cover=true&alt=
router.delete('/:id/images/:seq', requireAdmin, images.remove);                  // DELETE /api/products/:id/images/:seq
router.put('/:id/images/:seq/cover', requireAdmin, images.setCover);              // PUT    /api/products/:id/images/:seq/cover

module.exports = router;
