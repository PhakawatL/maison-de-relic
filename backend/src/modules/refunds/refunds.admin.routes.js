// routes ของคำขอคืนเงินฝั่งผู้ดูแล (R1 · S9 · หน้า /admin/refunds) → /api/admin/refund-requests
// แอดมินทุกคน (owner และ staff) พิจารณาคำขอได้ · ทุกการกระทำบันทึกลง admin_action_log (BR-31)
const { Router } = require('express');
const controller = require('./refunds.controller');
const { requireAdmin } = require('../../middleware/auth');

const router = Router();

router.use(requireAdmin);

router.get('/', controller.list);           // GET   /api/admin/refund-requests?q=&status=&page=&pageSize=
router.get('/:id', controller.getById);     // GET   /api/admin/refund-requests/:id
router.patch('/:id', controller.update);    // PATCH /api/admin/refund-requests/:id  { action, restock_decision?, note? }

module.exports = router;
