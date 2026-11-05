const AppError = require('../../utils/AppError');
const service = require('./cart.service');
const {parseSessionId}=require('../orders/r5-event-contract');
function positive(value, field) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 2147483647)
    throw AppError.badRequest('VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง', [{ field, issue: 'ต้องเป็นจำนวนเต็มบวก ไม่เกิน 2147483647' }]);
  return value;
}
function id(raw) {
  if (!/^\d+$/.test(raw)) throw AppError.badRequest('INVALID_ID', 'รหัสสินค้าไม่ถูกต้อง');
  return positive(Number(raw), 'product_id');
}
async function list(req, res) { res.json({ data: await service.list(req.user.user_id) }); }
async function add(req, res) {
  await service.mutate(req.user.user_id, 'add', positive(req.body?.product_id, 'product_id'), positive(req.body?.quantity, 'quantity'), undefined, {sessionId:parseSessionId(req.body?.session_id)});
  res.status(201).json({ data: await service.list(req.user.user_id) });
}
async function update(req, res) {
  await service.mutate(req.user.user_id, 'set', id(req.params.productId), positive(req.body?.quantity, 'quantity'));
  res.json({ data: await service.list(req.user.user_id) });
}
async function remove(req, res) {
  const productId = id(req.params.productId);
  await service.mutate(req.user.user_id, 'remove', productId, null, [productId]);
  res.status(204).end();
}
async function removeMany(req, res) {
  const ids = req.body?.product_ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > 100) throw AppError.badRequest('VALIDATION_ERROR', 'เลือกรายการที่จะลบ 1–100 รายการ');
  await service.mutate(req.user.user_id, 'remove', null, null, [...new Set(ids.map(v => positive(v, 'product_ids')))]);
  res.status(204).end();
}
module.exports = { list, add, update, remove, removeMany };
