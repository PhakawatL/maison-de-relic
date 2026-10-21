// controller จัดการบัญชีลูกค้า (R2): ตรวจข้อมูลที่ส่งมา → เรียก service → ตอบ { data }
const AppError = require('../../utils/AppError');
const service = require('./customers.service');
const { parseAccountBody } = require('./account.validation');
const { parseId, parseListQuery } = require('./list-query');

// ช่องที่หน้าจัดการลูกค้ารับ · ไม่มี username (เปลี่ยนไม่ได้) และ password (ลูกค้าตั้งเองผ่าน "ลืมรหัสผ่าน")
const UPDATE_FIELDS = ['email', 'first_name', 'last_name', 'display_name', 'phone', 'is_active'];

// GET /api/customers
async function list(req, res) {
  const filters = parseListQuery(req.query);
  const { items, total } = await service.list(filters);
  res.json({ data: items, meta: { page: filters.page, pageSize: filters.pageSize, total } });
}

// GET /api/customers/:id
async function getById(req, res) {
  const customer = await service.getById(parseId(req.params.id));
  if (!customer) throw AppError.notFound('CUSTOMER_NOT_FOUND', 'ไม่พบลูกค้าคนนี้');
  res.json({ data: customer });
}

// PATCH /api/customers/:id
async function update(req, res) {
  const id = parseId(req.params.id);
  const changes = parseAccountBody(req.body, { isCreate: false, fields: UPDATE_FIELDS });
  // staff ปิด / เปิดบัญชีลูกค้าได้ แต่แก้ข้อมูลส่วนตัวของลูกค้าได้เฉพาะ owner
  const editsProfile = Object.keys(changes).some((key) => key !== 'is_active');
  if (editsProfile && req.user.admin_role !== 'owner') throw AppError.forbidden();
  const customer = await service.update(req.user.user_id, id, changes);
  res.json({ data: customer });
}

// DELETE /api/customers/:id — ปิดบัญชี ไม่ลบจริง
async function deactivate(req, res) {
  await service.update(req.user.user_id, parseId(req.params.id), { is_active: false });
  res.status(204).end();
}

module.exports = { list, getById, update, deactivate };
