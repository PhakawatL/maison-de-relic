// routes สินค้าฝั่งแอดมิน (R3 · หน้า /admin/products) → /api/admin/products
// เห็นสินค้าทุกสถานะ (available / hidden / draft) ต่างจาก /api/products ที่หน้าร้านเห็นแค่ available
const { Router } = require('express');
const controller = require('./products.controller');
const { requireAdmin } = require('../../middleware/auth');

const router = Router();

router.use(requireAdmin);

router.get('/', controller.adminList);        // GET /api/admin/products?status=&q=&category=&...&page=&pageSize=
router.get('/:id', controller.adminGetById);  // GET /api/admin/products/:id

module.exports = router;
