// controller จัดการบัญชีผู้ดูแล (R2): ตรวจข้อมูลที่ส่งมา → เรียก service → ตอบ { data }
const AppError = require('../../utils/AppError');
const service = require('./admins.service');
const { parseAccountBody } = require('./account.validation');
const { parseId, parseListQuery } = require('./list-query');

// ช่องที่หน้าจัดการผู้ดูแลรับ (ตรวจด้วยกติกากลางใน account.validation.js)
const ACCOUNT_FIELDS = ['username', 'email', 'password', 'first_name', 'last_name', 'display_name', 'phone'];
const CREATE_FIELDS = [...ACCOUNT_FIELDS, 'admin_role'];
const UPDATE_FIELDS = [...ACCOUNT_FIELDS, 'admin_role', 'is_active'];

// GET /api/admins
async function list(req, res) {
  const filters = parseListQuery(req.query);
  const { items, total } = await service.list(filters);
  res.json({ data: items, meta: { page: filters.page, pageSize: filters.pageSize, total } });
}

// GET /api/admins/:id
async function getById(req, res) {
  const admin = await service.getById(parseId(req.params.id));
  if (!admin) throw AppError.notFound('ADMIN_NOT_FOUND', 'ไม่พบผู้ดูแลคนนี้');
  res.json({ data: admin });
}

// POST /api/admins
async function create(req, res) {
  const data = parseAccountBody(req.body, { isCreate: true, fields: CREATE_FIELDS });
  const admin = await service.create(req.user.user_id, data);
  res.status(201).json({ data: admin });
}

// PATCH /api/admins/:id
async function update(req, res) {
  const id = parseId(req.params.id);
  const changes = parseAccountBody(req.body, { isCreate: false, fields: UPDATE_FIELDS });
  // กันเจ้าของร้านล็อกตัวเองออก: ลดระดับหรือปิดบัญชีตัวเองไม่ได้
  // (ผลพลอยได้: ร้านมี owner ที่ใช้งานได้อย่างน้อย 1 คนเสมอ เพราะคนที่แก้ได้ต้องเป็น owner อยู่แล้ว)
  if (id === req.user.user_id && (changes.admin_role !== undefined || changes.is_active !== undefined)) {
    throw AppError.conflict('CANNOT_CHANGE_SELF', 'เปลี่ยนระดับสิทธิ์หรือสถานะบัญชีของตัวเองไม่ได้');
  }
  const admin = await service.update(req.user.user_id, id, changes);
  res.json({ data: admin });
}

// DELETE /api/admins/:id — ปิดบัญชี ไม่ลบจริง
async function deactivate(req, res) {
  const id = parseId(req.params.id);
  if (id === req.user.user_id) {
    throw AppError.conflict('CANNOT_CHANGE_SELF', 'ปิดบัญชีของตัวเองไม่ได้');
  }
  await service.update(req.user.user_id, id, { is_active: false });
  res.status(204).end();
}

module.exports = { list, getById, create, update, deactivate };
