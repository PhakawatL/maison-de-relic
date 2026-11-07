// controller ของระบบแนะนำสินค้า (R4)
const { Checker, firstValue, parseId } = require('../../utils/validate');
const service = require('./recommend.service');

const DEFAULT_LIMIT = 8; // หน้าแรกโชว์ 8 ชิ้น
const MAX_LIMIT = 24; // กันขอทีละมาก ๆ

// GET /api/recommend/popular?limit=8
async function popular(req, res) {
  const check = new Checker('เงื่อนไขไม่ถูกต้อง');
  const limit = check.positiveInt(firstValue(req.query.limit), 'limit', { max: MAX_LIMIT }) ?? DEFAULT_LIMIT;
  check.done();
  const items = await service.popular({ limit });
  res.json({ data: items });
}

// GET /api/recommend/related/:productId?limit=8
async function related(req, res) {
  // parseId ของทีม: ต้องเป็นจำนวนเต็มบวก ไม่งั้น 400 INVALID_ID (แบบเดียวกับ /products/:id)
  const productId = parseId(req.params.productId, 'รหัสสินค้าไม่ถูกต้อง');
  const check = new Checker('เงื่อนไขไม่ถูกต้อง');
  const limit = check.positiveInt(firstValue(req.query.limit), 'limit', { max: MAX_LIMIT }) ?? DEFAULT_LIMIT;
  check.done();
  const items = await service.related({ productId, limit });
  res.json({ data: items });
}

module.exports = { popular, related };