// routes ของสินค้า (R3) → /api/products
// อ่าน (GET) ไม่ต้องล็อกอิน เห็นเฉพาะสินค้าที่วางขาย · เพิ่ม / แก้ / ลบ เฉพาะแอดมิน (owner และ staff)
// รายการและรายละเอียดแบบเห็นทุกสถานะของแอดมินอยู่ที่ products.admin.routes.js (/api/admin/products)
const { Router } = require('express');
const controller = require('./products.controller');
const images = require('./product-images.controller');
const { requireAdmin } = require('../../middleware/auth');

const router = Router();

router.get('/', controller.list);        // GET /api/products?q=&category=&series=&condition=&minPrice=&maxPrice=&inStock=&sort=&page=&pageSize=
router.get('/:id', controller.getById);  // GET /api/products/:id

router.post('/', requireAdmin, controller.create);        // POST   /api/products
router.put('/:id', requireAdmin, controller.update);      // PUT    /api/products/:id  (ส่งครบทุกช่อง)
router.delete('/:id', requireAdmin, controller.remove);   // DELETE /api/products/:id  (เคยขายแล้ว = ซ่อนแทน)

// รูปสินค้า (แอดมิน) — ส่งไฟล์รูปเป็น body ตรง ๆ · เก็บใน Supabase Storage (docs/deploy.md ข้อ 3)
router.post('/:id/images', requireAdmin, images.readImageBody, images.upload);   // POST   /api/products/:id/images?cover=true&alt=
router.delete('/:id/images/:seq', requireAdmin, images.remove);                  // DELETE /api/products/:id/images/:seq
router.put('/:id/images/:seq/cover', requireAdmin, images.setCover);              // PUT    /api/products/:id/images/:seq/cover

module.exports = router;
