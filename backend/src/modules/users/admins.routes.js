// routes จัดการบัญชีผู้ดูแลระบบ (R2 · S13 · หน้า admin/users)
// แอดมินทุกคนดูรายชื่อได้ แต่เพิ่ม / แก้ / ปิดบัญชีได้เฉพาะเจ้าของร้าน (owner)
// "ลบ" = ปิดบัญชี (is_active = false) ไม่ลบแถวจริง เพราะสินค้า ออเดอร์ และ log ยังอ้างถึงบัญชีอยู่
const { Router } = require('express');
const controller = require('./admins.controller');
const { requireAdmin, requireRole } = require('../../middleware/auth');

const router = Router();
const ownerOnly = requireRole('owner');

router.use(requireAdmin);

router.get('/', controller.list);                       // GET    /api/admins?q=&status=&page=&pageSize=
router.get('/:id', controller.getById);                 // GET    /api/admins/:id
router.post('/', ownerOnly, controller.create);         // POST   /api/admins
router.patch('/:id', ownerOnly, controller.update);     // PATCH  /api/admins/:id  (แก้บางช่อง / เปิดบัญชีคืน)
router.delete('/:id', ownerOnly, controller.deactivate); // DELETE /api/admins/:id  (ปิดบัญชี)

module.exports = router;
