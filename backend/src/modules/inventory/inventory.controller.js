// สต็อกสินค้า (R3 · แอดมิน)
//   POST /api/products/:id/stock             เติม / ตัดของเสีย / ปรับยอด
//   GET  /api/products/:id/stock-movements   ประวัติสต็อก
const AppError = require('../../utils/AppError');
const service = require('./inventory.service');

// แอดมินทำได้ 3 แบบ · sale / return ระบบสร้างเองจากคำสั่งซื้อและการคืนเงิน
const ADMIN_TYPES = ['restock', 'write_off', 'adjust'];

function parseId(value) {
  if (!/^\d+$/.test(String(value)) || Number(value) < 1) {
    throw AppError.badRequest('INVALID_ID', 'รหัสสินค้าไม่ถูกต้อง');
  }
  return Number(value);
}

function parseStockBody(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const errors = [];
  const err = (field, issue) => errors.push({ field, issue });

  if (!ADMIN_TYPES.includes(b.type)) err('type', `ต้องเป็นหนึ่งใน ${ADMIN_TYPES.join(', ')}`);

  const count = (v) => Number.isInteger(v) && v >= 0 && v <= 100000;
  if (b.type === 'adjust') {
    if (!count(b.new_quantity)) err('new_quantity', 'ใส่จำนวนที่นับได้จริง (จำนวนเต็ม 0 ขึ้นไป)');
  } else if (b.type) {
    if (!count(b.quantity) || b.quantity === 0) err('quantity', 'จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป');
  }

  let note = typeof b.note === 'string' ? b.note.trim() : b.note ?? null;
  if (note === '') note = null;
  if (note !== null && typeof note !== 'string') err('note', 'ต้องเป็นข้อความ');
  else if (note && note.length > 300) err('note', 'ยาวได้ไม่เกิน 300 ตัวอักษร');
  // ลดของ / ปรับยอด ต้องบอกเหตุผล ตรวจย้อนหลังได้ว่าของหายไปไหน
  else if (!note && (b.type === 'write_off' || b.type === 'adjust')) err('note', 'ระบุเหตุผล');

  if (errors.length) throw AppError.badRequest('VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง', errors);
  return b.type === 'adjust'
    ? { type: 'adjust', new_quantity: b.new_quantity, note }
    : { type: b.type, quantity: b.quantity, note };
}

// POST /api/products/:id/stock
async function changeStock(req, res) {
  const id = parseId(req.params.id);
  const result = await service.adminChangeStock(id, parseStockBody(req.body), req.user.user_id);
  if (!result) throw AppError.notFound('PRODUCT_NOT_FOUND', 'ไม่พบสินค้านี้');
  res.status(201).json({ data: result });
}

// GET /api/products/:id/stock-movements?type=&page=&pageSize=
async function listMovements(req, res) {
  const id = parseId(req.params.id);
  const errors = [];
  const type = req.query.type || undefined;
  if (type && !service.TYPES.includes(type)) errors.push({ field: 'type', issue: `ต้องเป็นหนึ่งใน ${service.TYPES.join(', ')}` });
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  const pageSize = req.query.pageSize === undefined ? 20 : Number(req.query.pageSize);
  if (!Number.isInteger(page) || page < 1) errors.push({ field: 'page', issue: 'ต้องเป็นจำนวนเต็มตั้งแต่ 1' });
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) errors.push({ field: 'pageSize', issue: '1–100' });
  if (errors.length) throw AppError.badRequest('VALIDATION_ERROR', 'ค่าที่ส่งมาไม่ถูกต้อง', errors);

  const result = await service.listMovements(id, { type, page, pageSize });
  if (!result) throw AppError.notFound('PRODUCT_NOT_FOUND', 'ไม่พบสินค้านี้');
  res.json({
    data: result.items,
    meta: { page, pageSize, total: result.total, stock_quantity: result.stock_quantity },
  });
}

module.exports = { changeStock, listMovements };
