// routes ของสินค้า (R3) → /api/products
// อ่าน (GET) ไม่ต้องล็อกอิน เห็นเฉพาะสินค้าที่วางขาย · เพิ่ม / แก้ / ลบ เฉพาะแอดมิน (owner และ staff)
// รายการและรายละเอียดแบบเห็นทุกสถานะของแอดมินอยู่ที่ products.admin.routes.js (/api/admin/products)
const { Router } = require('express');
const controller = require('./products.controller');
const { requireAdmin } = require('../../middleware/auth');

const router = Router();

router.get('/', controller.list);        // GET /api/products?q=&category=&series=&condition=&minPrice=&maxPrice=&inStock=&sort=&page=&pageSize=
router.get('/:id', controller.getById);  // GET /api/products/:id

router.post('/', requireAdmin, controller.create);        // POST   /api/products
router.put('/:id', requireAdmin, controller.update);      // PUT    /api/products/:id  (ส่งครบทุกช่อง)
router.delete('/:id', requireAdmin, controller.remove);   // DELETE /api/products/:id  (เคยขายแล้ว = ซ่อนแทน)

module.exports = router;
