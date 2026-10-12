// ===== ตัวอย่าง module: คัดลอกโฟลเดอร์นี้ไปเป็น module ของตัวเอง แล้วเปลี่ยนชื่อ =====
// โครง 3 ชั้น:
//   routes      → กำหนด URL + method แล้วส่งต่อให้ controller
//   controller  → อ่าน req (params/query/body), ตรวจข้อมูลเบื้องต้น, ส่ง res
//   service     → logic + SQL จริง (ไม่รู้จัก req/res เลย → test ง่าย ใช้ซ้ำได้)
//
// เปิดใช้: ใน src/app.js เพิ่ม  app.use('/api/items', require('./modules/items/items.routes'));
const { Router } = require('express');
const controller = require('./template.controller');

const router = Router();

router.get('/', controller.list);          // GET    /api/items
router.get('/:id', controller.getById);    // GET    /api/items/:id
router.post('/', controller.create);       // POST   /api/items
router.put('/:id', controller.update);     // PUT    /api/items/:id
router.delete('/:id', controller.remove);  // DELETE /api/items/:id

// route ที่ต้องล็อกอิน: ใส่ middleware ของ R2 ไว้ก่อน controller
// const { requireAuth, requireRole } = require('../../middleware/auth');
// router.post('/', requireAuth, requireRole('admin'), controller.create);

module.exports = router;
