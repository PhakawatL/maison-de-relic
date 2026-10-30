// routes ของระบบแจ้งปัญหาฝั่งลูกค้า (R1 · S12 · issue #10) → /api/support-tickets
// ทุก route ต้องล็อกอิน และเห็นได้แค่เคสของตัวเอง (เคสของคนอื่นตอบ 404)
// ดูได้แค่ล็อกอิน ส่วนเปิดเคสใหม่ต้องยืนยันอีเมลแล้ว (กติกาเดียวกับที่อยู่และ wishlist)
const { Router } = require('express');
const controller = require('./tickets.controller');
const { requireAuth, requireVerified } = require('../../middleware/auth');
const { rateLimit } = require('../../middleware/rateLimit');

const HOUR = 60 * 60 * 1000;
// กันสแปม: เปิดเคสใหม่ได้ไม่เกิน 15 ครั้งต่อชั่วโมงต่อผู้ใช้
// (นับตามผู้ใช้ ไม่ใช่ IP — นักศึกษาใน Wi-Fi มหาวิทยาลัยใช้ IP เดียวกัน จะได้ไม่โดนนับรวม)
const createLimit = rateLimit({ name: 'ticket', max: 15, windowMs: HOUR, key: (req) => `u${req.user.user_id}` });

const router = Router();

router.use(requireAuth);

router.get('/', controller.listMine);                    // GET  /api/support-tickets?status=&page=&pageSize=
router.get('/:id', controller.getMine);                  // GET  /api/support-tickets/:id
router.post('/', requireVerified, createLimit, controller.create); // POST /api/support-tickets  { subject, category, body, order_id? } หรือ { product_id, category, body? }

module.exports = router;
