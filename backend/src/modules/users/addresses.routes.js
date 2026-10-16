// routes ที่อยู่จัดส่งของสมาชิก (R2 · S2 · BR-03)
// ทุก route ทำกับที่อยู่ของ "ตัวเอง" เท่านั้น (ผู้ใช้จาก token) — ที่อยู่ของคนอื่นตอบ 404 เสมอ
// ดูได้แค่ล็อกอิน ส่วนเพิ่ม / แก้ / ลบ ต้องยืนยันอีเมลแล้ว (ผู้ใช้ที่ยังไม่ยืนยันเขียนข้อมูลไม่ได้)
const { Router } = require('express');
const controller = require('./addresses.controller');
const { requireAuth, requireVerified } = require('../../middleware/auth');

const router = Router();

router.use(requireAuth);

router.get('/', controller.list);                               // GET    /api/addresses       ที่อยู่หลักขึ้นก่อน
router.get('/:id', controller.getById);                         // GET    /api/addresses/:id
router.post('/', requireVerified, controller.create);           // POST   /api/addresses
router.patch('/:id', requireVerified, controller.update);       // PATCH  /api/addresses/:id
router.delete('/:id', requireVerified, controller.remove);      // DELETE /api/addresses/:id

module.exports = router;
