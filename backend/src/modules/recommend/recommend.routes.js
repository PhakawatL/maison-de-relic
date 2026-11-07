// route ของระบบแนะนำสินค้า (R4) — เปิดใน src/app.js ที่ /api/recommend
// ตอนนี้: popular, related/:productId · ภายหลัง: for-you (ใช้ embedding)
const { Router } = require('express');
const controller = require('./recommend.controller');

const router = Router();

router.get('/popular', controller.popular); // GET /api/recommend/popular (ไม่ต้องล็อกอิน)

router.get('/related/:productId', controller.related); // GET /api/recommend/related/:productId (ไม่ต้องล็อกอิน)

module.exports = router;
