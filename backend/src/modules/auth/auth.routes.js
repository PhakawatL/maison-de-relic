// routes ของระบบสมาชิก (R2): ล็อกอิน · สมัคร + ยืนยันอีเมลด้วย OTP · ลืม / รีเซ็ตรหัสผ่าน
// ออกจากระบบ: หน้าเว็บลบ token ทิ้งเอง (auth.clear() ใน js/api.js) ไม่ต้องเรียก API
// แก้โปรไฟล์ / เปลี่ยนรหัสผ่าน อยู่ที่ /api/profile (modules/users/profile.routes.js)
const { Router } = require('express');
const controller = require('./auth.controller');
const { requireAuth } = require('../../middleware/auth');
const { rateLimit } = require('../../middleware/rateLimit');

const router = Router();

// จำกัดจำนวนครั้งต่อ IP (ดู middleware/rateLimit.js) — เกินได้ 429 TOO_MANY_REQUESTS
//   verify-email / resend-otp ไม่ต้อง: มีกติกาของตัวเองอยู่แล้ว (กรอกผิดได้ 5 ครั้ง, ขอรหัสใหม่ทุก 60 วินาที)
const MINUTE = 60 * 1000;
const loginLimit = rateLimit({ name: 'login', max: 10, windowMs: 15 * MINUTE, onlyFailed: true }); // เดารหัสผ่าน
const registerLimit = rateLimit({ name: 'register', max: 10, windowMs: 60 * MINUTE });               // สร้างบัญชีรัว ๆ
const forgotLimit = rateLimit({ name: 'forgot', max: 5, windowMs: 15 * MINUTE });                    // ยิงอีเมลใส่คนอื่น
const resetLimit = rateLimit({ name: 'reset', max: 10, windowMs: 15 * MINUTE, onlyFailed: true });   // เดา token

router.post('/login', loginLimit, controller.login);              // POST /api/auth/login           { username, password }
router.get('/me', requireAuth, controller.me);                    // GET  /api/auth/me              ผู้ใช้ที่ล็อกอินอยู่

router.post('/register', registerLimit, controller.register);     // POST /api/auth/register        สมัคร → ได้ token + ส่ง OTP
router.post('/verify-email', requireAuth, controller.verifyEmail); // POST /api/auth/verify-email    { code }
router.post('/resend-otp', requireAuth, controller.resendOtp);     // POST /api/auth/resend-otp      ขอรหัสใหม่

router.post('/forgot-password', forgotLimit, controller.forgotPassword); // POST /api/auth/forgot-password { email }
router.post('/reset-password', resetLimit, controller.resetPassword); // POST /api/auth/reset-password  { token, password }

module.exports = router;
