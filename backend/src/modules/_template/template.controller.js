// controller: แปลง HTTP request → เรียก service → ตอบกลับ
// Express 5 ส่ง error จาก async function ไปที่ errorHandler ให้อัตโนมัติ ไม่ต้องเขียน try/catch ทุกที่
const AppError = require('../../utils/AppError');
const service = require('./template.service');

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw AppError.badRequest('INVALID_ID', 'รหัสไม่ถูกต้อง');
  }
  return id;
}

async function list(req, res) {
  const items = await service.list({ q: req.query.q });
  res.json({ data: items });
}

async function getById(req, res) {
  const item = await service.getById(parseId(req.params.id));
  if (!item) throw AppError.notFound('ITEM_NOT_FOUND', 'ไม่พบรายการนี้');
  res.json({ data: item });
}

async function create(req, res) {
  const { name } = req.body || {};
  if (!name) {
    throw AppError.badRequest('VALIDATION_ERROR', 'กรอกข้อมูลไม่ครบ', [
      { field: 'name', issue: 'required' },
    ]);
  }
  const item = await service.create({ name });
  res.status(201).json({ data: item });
}

async function update(req, res) {
  const item = await service.update(parseId(req.params.id), req.body || {});
  if (!item) throw AppError.notFound('ITEM_NOT_FOUND', 'ไม่พบรายการนี้');
  res.json({ data: item });
}

async function remove(req, res) {
  const deleted = await service.remove(parseId(req.params.id));
  if (!deleted) throw AppError.notFound('ITEM_NOT_FOUND', 'ไม่พบรายการนี้');
  res.status(204).end();
}

module.exports = { list, getById, create, update, remove };
