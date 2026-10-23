// routes ของระบบแจ้งปัญหาฝั่งลูกค้า (R1 · S12 · issue #10) → /api/support-tickets
// ทุก route ต้องล็อกอิน และเห็นได้แค่เคสของตัวเอง (เคสของคนอื่นตอบ 404)
// ดูได้แค่ล็อกอิน ส่วนเปิดเคสใหม่ต้องยืนยันอีเมลแล้ว (กติกาเดียวกับที่อยู่และ wishlist)
const { Router } = require('express');
const controller = require('./tickets.controller');
const { requireAuth, requireVerified } = require('../../middleware/auth');

const router = Router();

router.use(requireAuth);

router.get('/', controller.listMine);                    // GET  /api/support-tickets?status=&page=&pageSize=
router.get('/:id', controller.getMine);                  // GET  /api/support-tickets/:id
router.post('/', requireVerified, controller.create);    // POST /api/support-tickets  { subject, category, body, order_id? } หรือ { product_id, category, body? }

module.exports = router;
