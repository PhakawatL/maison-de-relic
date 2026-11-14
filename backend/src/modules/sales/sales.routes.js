// routes สรุปยอดขาย (R3 · หน้า /admin/sales) → /api/admin/sales-summary
const { Router } = require('express');
const controller = require('./sales.controller');
const { requireAdmin } = require('../../middleware/auth');

const router = Router();

router.get('/', requireAdmin, controller.summary); // GET /api/admin/sales-summary?from=&to=&top=

module.exports = router;
