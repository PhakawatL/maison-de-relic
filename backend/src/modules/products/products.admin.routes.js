// ===================== ตัวอย่างข้อมูลสำหรับทดสอบเว็บเซอร์วิสด้วย Postman =====================
// ใช้กับฐานข้อมูลตัวอย่าง (หลังสั่ง npm run db:reset) · ชุดเดียวกับ docs/testing/postman/maison-de-relic.postman_collection.json
// route ที่ต้องล็อกอิน: แท็บ Headers ใส่  Authorization: Bearer <token>  (token ได้จาก POST /api/auth/login)
//
// Testing Search สินค้าทุกสถานะ (ตัวอย่างที่ 1: เฉพาะแบบร่าง)
// method: get
// URL: http://localhost:3000/api/admin/products?status=draft
// header: Authorization: Bearer <token ของ ผู้ดูแล>
// ผลที่ควรได้: 200 OK
//
// Testing Search สินค้าทุกสถานะ (ตัวอย่างที่ 2: ไม่มีเกณฑ์)
// method: get
// URL: http://localhost:3000/api/admin/products
// header: Authorization: Bearer <token ของ ผู้ดูแล>
// ผลที่ควรได้: 200 OK · ไม่ล็อกอิน → 401 · ลูกค้า → 403
//
// Testing View สินค้า 1 ชิ้น (เห็นได้ทุกสถานะ)
// method: get
// URL: http://localhost:3000/api/admin/products/1
// header: Authorization: Bearer <token ของ ผู้ดูแล>
// ผลที่ควรได้: 200 OK
// ====================================================================================

// routes สินค้าฝั่งแอดมิน (R3 · หน้า /admin/products) → /api/admin/products
// เห็นสินค้าทุกสถานะ (available / hidden / draft) ต่างจาก /api/products ที่หน้าร้านเห็นแค่ available
const { Router } = require('express');
const controller = require('./products.controller');
const { requireAdmin } = require('../../middleware/auth');

const router = Router();

router.use(requireAdmin);

router.get('/', controller.adminList);        // GET /api/admin/products?status=&q=&category=&...&page=&pageSize=
router.get('/:id', controller.adminGetById);  // GET /api/admin/products/:id

module.exports = router;
