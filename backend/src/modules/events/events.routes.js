// route ของ event พฤติกรรมผู้ใช้ (R4) — เปิดใน src/app.js ที่ /api/events
// หน้าเว็บส่งผ่าน frontend/js/events.js (R1) แบบ "ยิงแล้วลืม" ไม่รอผล
const { Router } = require('express');
const { rateLimit } = require('../../middleware/rateLimit');
const controller = require('./events.controller');

const router = Router();

// กันยิงรัว: 1 IP ส่งได้ 120 ครั้งต่อนาที (คนใช้งานจริงกดไม่ถึง แต่สคริปต์ปั๊มยอดวิวจะโดนตัด)
const eventLimit = rateLimit({ name: 'events', max: 120, windowMs: 60 * 1000 });

router.post('/', eventLimit, controller.create); // POST /api/events (ไม่ต้องล็อกอิน)

module.exports = router;
