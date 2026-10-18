// routes จัดการบัญชีลูกค้า (R2 · หน้า admin/customers แท็บ "ลูกค้า" ของหน้าจัดการบัญชีผู้ใช้)
// แอดมินทุกคน (owner และ staff) ดูรายชื่อ ปิด และเปิดบัญชีลูกค้าได้ · แก้ข้อมูลลูกค้าได้เฉพาะ owner (ตรวจใน controller)
// ไม่มี POST: ลูกค้าสมัครเองที่ /register
// "ลบ" = ปิดบัญชี (is_active = false) ไม่ลบแถวจริง เพราะออเดอร์ รีวิว และที่อยู่ยังอ้างถึงบัญชีอยู่
const { Router } = require('express');
const controller = require('./customers.controller');
const { requireAdmin } = require('../../middleware/auth');

const router = Router();

router.use(requireAdmin);

router.get('/', controller.list);              // GET    /api/customers?q=&status=&page=&pageSize=
router.get('/:id', controller.getById);        // GET    /api/customers/:id
router.patch('/:id', controller.update);       // PATCH  /api/customers/:id  (แก้ข้อมูล: owner · เปิดบัญชีคืน: แอดมินทุกคน)
router.delete('/:id', controller.deactivate);  // DELETE /api/customers/:id  (ปิดบัญชี)

module.exports = router;
