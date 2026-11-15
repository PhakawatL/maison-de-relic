// route ของระบบแนะนำสินค้า (R4) — เปิดใน src/app.js ที่ /api/recommend
// popular, related/:productId (ไม่ต้องล็อกอิน) · for-you (ต้องล็อกอิน)
const { Router } = require('express');
const { requireAuth } = require('../../middleware/auth'); // ตรวจ token ของ R2 → ไม่มี / เสีย / บัญชีถูกปิด = 401
const controller = require('./recommend.controller');

const router = Router();

router.get('/popular', controller.popular); // GET /api/recommend/popular (ไม่ต้องล็อกอิน)

router.get('/related/:productId', controller.related); // GET /api/recommend/related/:productId (ไม่ต้องล็อกอิน)

// แนะนำเฉพาะตัว ต้องรู้ว่าเป็นใคร → requireAuth
// ไม่ใส่ requireVerified: แค่อ่านคำแนะนำ ไม่ได้เขียนข้อมูล คนที่ยังไม่ยืนยันอีเมลก็ดูได้ (ตามกติกา "ดูได้อย่างเดียว")
router.get('/for-you', requireAuth, controller.forYou); // GET /api/recommend/for-you

module.exports = router;
