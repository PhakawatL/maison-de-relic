// routes สต็อกสินค้า (R3 · แอดมิน) → ต่อท้าย /api/products
const { Router } = require('express');
const controller = require('./inventory.controller');
const { requireAdmin } = require('../../middleware/auth');

const router = Router();

router.post('/:id/stock', requireAdmin, controller.changeStock);                // POST /api/products/:id/stock
router.get('/:id/stock-movements', requireAdmin, controller.listMovements);     // GET  /api/products/:id/stock-movements

module.exports = router;
