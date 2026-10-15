// routes ของระบบล็อกอิน (R2)
// ออกจากระบบ: หน้าเว็บลบ token ทิ้งเอง (auth.clear() ใน js/api.js) ไม่ต้องเรียก API
// เพราะ token ไม่ได้เก็บไว้ฝั่ง server — ส่วนการปิดบัญชีมีผลทันทีอยู่แล้ว (ดู middleware/auth.js)
const { Router } = require('express');
const controller = require('./auth.controller');
const { requireAuth } = require('../../middleware/auth');

const router = Router();

router.post('/login', controller.login);         // POST /api/auth/login  { username, password }
router.get('/me', requireAuth, controller.me);   // GET  /api/auth/me     ผู้ใช้ที่ล็อกอินอยู่

module.exports = router;
