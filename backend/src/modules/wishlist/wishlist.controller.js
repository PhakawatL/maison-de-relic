// controller ของ wishlist (R1): ตรวจข้อมูลที่ส่งมา → เรียก service → ตอบ { data }
// ผู้ใช้มาจาก token เสมอ (req.user จาก requireAuth) ไม่รับ user_id จาก body / URL
const AppError = require('../../utils/AppError');
const service = require('./wishlist.service');

/** รหัสสินค้าต้องเป็นจำนวนเต็มบวก — รับได้ทั้งตัวเลข (body JSON) และข้อความตัวเลข (URL) */
function parseProductId(raw, { field } = {}) {
  const ok =
    (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) ||
    (typeof raw === 'string' && /^[1-9]\d{0,17}$/.test(raw));
  if (!ok) {
    const details = field ? [{ field, issue: 'ต้องเป็นจำนวนเต็มบวก' }] : undefined;
    throw AppError.badRequest(field ? 'VALIDATION_ERROR' : 'INVALID_ID', 'รหัสสินค้าไม่ถูกต้อง', details);
  }
  return Number(raw);
}

// GET /api/wishlist
async function list(req, res) {
  const items = await service.listForUser(req.user.user_id);
  res.json({ data: items, meta: { total: items.length } });
}

// GET /api/wishlist/ids
async function ids(req, res) {
  res.json({ data: await service.listIds(req.user.user_id) });
}

// POST /api/wishlist   { product_id }
//   เพิ่มใหม่ → 201 · มีอยู่แล้ว → 200 (กดซ้ำไม่ error) · ไม่มีสินค้านี้ / ยังไม่วางขาย → 404
async function add(req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (body.product_id === undefined) {
    throw AppError.badRequest('VALIDATION_ERROR', 'กรุณาระบุสินค้า', [{ field: 'product_id', issue: 'required' }]);
  }
  const productId = parseProductId(body.product_id, { field: 'product_id' });

  const result = await service.add(req.user.user_id, productId);
  if (!result) throw AppError.notFound('PRODUCT_NOT_FOUND', 'ไม่พบสินค้านี้ หรือสินค้ายังไม่ได้วางขาย');
  res.status(result.created ? 201 : 200).json({ data: result.item });
}

// DELETE /api/wishlist/:productId
//   ตอบ 204 เสมอ แม้สินค้านี้ไม่ได้อยู่ใน wishlist อยู่แล้ว
//   (กดเอาออกซ้ำ หรือเอาออกพร้อมกันสองแท็บ ผลลัพธ์ก็เหมือนกัน คือไม่มีสินค้านี้ใน wishlist)
async function remove(req, res) {
  await service.remove(req.user.user_id, parseProductId(req.params.productId));
  res.status(204).end();
}

module.exports = { list, ids, add, remove };
