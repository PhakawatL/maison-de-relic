// routes ของระบบแจ้งปัญหาฝั่งผู้ดูแล (R1 · S12 · issue #10 · หน้า /admin/reports) → /api/admin/support-tickets
// แอดมินทุกคน (owner และ staff) ดู ตอบ เปลี่ยนสถานะ และมอบหมายเคสได้ · ลบเคสได้เฉพาะ owner
// ทุกการเปลี่ยนแปลงบันทึกลง admin_action_log (BR-31)
const { Router } = require('express');
const controller = require('./tickets.controller');
const { requireAdmin, requireRole } = require('../../middleware/auth');

const router = Router();

router.use(requireAdmin);

router.get('/', controller.list);                                    // GET    /api/admin/support-tickets?q=&category=&status=&assigned=&page=&pageSize=
router.get('/assignees', controller.assignees);                      // GET    /api/admin/support-tickets/assignees
router.get('/:id', controller.getById);                              // GET    /api/admin/support-tickets/:id
router.patch('/:id', controller.update);                             // PATCH  /api/admin/support-tickets/:id  { admin_reply?, status?, assigned_to? }
router.delete('/:id', requireRole('owner'), controller.remove);      // DELETE /api/admin/support-tickets/:id

module.exports = router;
