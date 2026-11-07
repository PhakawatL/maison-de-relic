// routes ของประวัติการทำงานของผู้ดูแล (R1 · BR-31 · issue #10 · หน้า /admin/activity) → /api/admin/action-logs
// ดูได้เฉพาะ owner (ประวัติทั้งร้าน) — staff เห็นประวัติของคำขอ / เคสที่เปิดดูอยู่ในหน้ารายละเอียดนั้นแทน
// อ่านอย่างเดียว: admin_action_log เป็น append-only ไม่มี API แก้หรือลบ
const { Router } = require('express');
const controller = require('./action-log.controller');
const { requireAdmin, requireRole } = require('../../middleware/auth');

const router = Router();

router.use(requireAdmin, requireRole('owner'));

router.get('/', controller.list); // GET /api/admin/action-logs?q=&admin=&action=&target=&page=&pageSize=

module.exports = router;
