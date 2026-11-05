// routes ของคำขอคืนเงินฝั่งลูกค้า (R1 · S9 · issue #9) → /api/refund-requests
// ทุก route ต้องล็อกอิน และเห็นได้แค่คำขอของตัวเอง · ขอคืนเงินใหม่ต้องยืนยันอีเมลแล้ว
const { Router } = require('express');
const controller = require('./refunds.controller');
const { requireAuth, requireVerified } = require('../../middleware/auth');

const router = Router();

router.use(requireAuth);

router.get('/refundable', controller.refundable);       // GET  /api/refund-requests/refundable  สินค้าที่ยังขอคืนได้
router.get('/', controller.listMine);                   // GET  /api/refund-requests?status=&page=&pageSize=
router.get('/:id', controller.getMine);                 // GET  /api/refund-requests/:id
router.post('/', requireVerified, controller.create);   // POST /api/refund-requests  { order_item_id, refund_qty, reason, evidence_url? }

module.exports = router;
