// routes ของสินค้า (R3)
// ตอนนี้มีเฉพาะฝั่งอ่าน (หน้าร้าน ไม่ต้องล็อกอิน)
// POST / PUT / DELETE ของแอดมินจะเพิ่มหลัง R2 ทำ middleware auth เสร็จ
const { Router } = require('express');
const controller = require('./products.controller');

const router = Router();

router.get('/', controller.list);        // GET /api/products?q=&category=&series=&condition=&minPrice=&maxPrice=&inStock=&sort=&page=&pageSize=
router.get('/:id', controller.getById);  // GET /api/products/:id

module.exports = router;
