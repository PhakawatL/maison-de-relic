// route ของ semantic search (R4) — เปิดใน src/app.js ที่ /api/search
const { Router } = require('express');
const { rateLimit } = require('../../middleware/rateLimit');
const controller = require('./search.controller');

const router = Router();

// ค้นแต่ละครั้งต้องให้โมเดลคิด (หนักกว่า API ทั่วไป) → จำกัด 30 ครั้งต่อนาทีต่อ IP กันยิงถี่
const searchLimit = rateLimit({ name: 'semantic-search', max: 30, windowMs: 60_000 });

router.get('/semantic', searchLimit, controller.semantic); // GET /api/search/semantic?q= (ไม่ต้องล็อกอิน)

module.exports = router;