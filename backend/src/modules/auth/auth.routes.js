// routes ของระบบสมาชิก (R2): ล็อกอิน · สมัคร + ยืนยันอีเมลด้วย OTP · ลืม / รีเซ็ตรหัสผ่าน
// ออกจากระบบ: หน้าเว็บลบ token ทิ้งเอง (auth.clear() ใน js/api.js) ไม่ต้องเรียก API
// แก้โปรไฟล์ / เปลี่ยนรหัสผ่าน อยู่ที่ /api/profile (modules/users/profile.routes.js)
const { Router } = require('express');
const controller = require('./auth.controller');
const { requireAuth } = require('../../middleware/auth');

const router = Router();

router.post('/login', controller.login);                          // POST /api/auth/login           { username, password }
router.get('/me', requireAuth, controller.me);                    // GET  /api/auth/me              ผู้ใช้ที่ล็อกอินอยู่

router.post('/register', controller.register);                    // POST /api/auth/register        สมัคร → ได้ token + ส่ง OTP
router.post('/verify-email', requireAuth, controller.verifyEmail); // POST /api/auth/verify-email    { code }
router.post('/resend-otp', requireAuth, controller.resendOtp);     // POST /api/auth/resend-otp      ขอรหัสใหม่

router.post('/forgot-password', controller.forgotPassword);        // POST /api/auth/forgot-password { email }
router.post('/reset-password', controller.resetPassword);          // POST /api/auth/reset-password  { token, password }

module.exports = router;
