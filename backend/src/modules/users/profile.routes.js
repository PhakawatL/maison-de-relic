// routes โปรไฟล์ของผู้ใช้ที่ล็อกอินอยู่ (R2 · S2)
// ดูได้แค่ล็อกอิน · แก้ไข / เปลี่ยนรหัสผ่าน ต้องยืนยันอีเมลแล้ว
const { Router } = require('express');
const controller = require('./profile.controller');
const { requireAuth, requireVerified } = require('../../middleware/auth');

const router = Router();

router.use(requireAuth);

router.get('/', controller.get);                                       // GET   /api/profile
router.patch('/', requireVerified, controller.update);                 // PATCH /api/profile
router.put('/password', requireVerified, controller.changePassword);   // PUT   /api/profile/password

module.exports = router;
