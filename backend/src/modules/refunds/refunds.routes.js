// routes ของคำขอคืนเงินฝั่งลูกค้า (R1 · S9 · issue #9) → /api/refund-requests
// ทุก route ต้องล็อกอิน และเห็นได้แค่คำขอของตัวเอง · ขอคืนเงินใหม่ต้องยืนยันอีเมลแล้ว
const { Router } = require('express');
const controller = require('./refunds.controller');
const { requireAuth, requireVerified } = require('../../middleware/auth');
const { rateLimit } = require('../../middleware/rateLimit');

const HOUR = 60 * 60 * 1000;
// กันสแปม: ขอคืนเงินได้ไม่เกิน 20 ครั้งต่อชั่วโมงต่อผู้ใช้ (คำสั่งซื้อใหญ่ขอคืนหลายรายการได้สบาย)
const createLimit = rateLimit({ name: 'refund', max: 20, windowMs: HOUR, key: (req) => `u${req.user.user_id}` });

const router = Router();

router.use(requireAuth);

router.get('/refundable', controller.refundable);       // GET  /api/refund-requests/refundable  สินค้าที่ยังขอคืนได้
router.get('/', controller.listMine);                   // GET  /api/refund-requests?status=&page=&pageSize=
router.get('/:id', controller.getMine);                 // GET  /api/refund-requests/:id
router.post('/', requireVerified, createLimit, controller.create); // POST /api/refund-requests  { order_item_id, refund_qty, reason, evidence_url? }

module.exports = router;
