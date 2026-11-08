// controller ของ semantic search (R4)
const { Checker, firstValue } = require('../../utils/validate');
const service = require('./search.service');

const DEFAULT_LIMIT = 20; // ตามแผน: 20 ชิ้นที่ใกล้ที่สุด
const MAX_LIMIT = 50; // เท่ากับ pageSize สูงสุดของ GET /products

// GET /api/search/semantic?q=กันดั้ม&limit=20
async function semantic(req, res) {
  const check = new Checker('เงื่อนไขไม่ถูกต้อง');
  // q บังคับ ยาวไม่เกิน 100 ตัวอักษร (กันข้อความยาวมาก ๆ ไปให้โมเดลคิดนาน)
  // text() ตัดเว้นวรรคหัวท้ายให้ · ว่างหรือมีแต่เว้นวรรค → 400 required
  const q = check.text(firstValue(req.query.q), 'q', { required: true, max: 100 });
  const limit = check.positiveInt(firstValue(req.query.limit), 'limit', { max: MAX_LIMIT }) ?? DEFAULT_LIMIT;
  check.done(); // ผิดช่องไหนบ้าง ตอบ 400 ทีเดียวพร้อมบอกทุกช่อง
  const items = await service.semantic({ q, limit });
  res.json({ data: items });
}

module.exports = { semantic };