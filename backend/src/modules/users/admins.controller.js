// controller จัดการบัญชีผู้ดูแล (R2): ตรวจข้อมูลที่ส่งมา → เรียก service → ตอบ { data }
const AppError = require('../../utils/AppError');
const service = require('./admins.service');
const { parseAccountBody } = require('./account.validation');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const STATUSES = ['all', 'active', 'inactive'];

// ช่องที่หน้าจัดการผู้ดูแลรับ (ตรวจด้วยกติกากลางใน account.validation.js)
const ACCOUNT_FIELDS = ['username', 'email', 'password', 'first_name', 'last_name', 'display_name', 'phone'];
const CREATE_FIELDS = [...ACCOUNT_FIELDS, 'admin_role'];
const UPDATE_FIELDS = [...ACCOUNT_FIELDS, 'admin_role', 'is_active'];

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw AppError.badRequest('INVALID_ID', 'รหัสผู้ใช้ไม่ถูกต้อง');
  }
  return id;
}

function firstValue(v) {
  return Array.isArray(v) ? v[0] : v;
}

function parseListQuery(qs) {
  const errors = [];
  const get = (key) => {
    const v = firstValue(qs[key]);
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
  };
  const intParam = (key, max, fallback) => {
    const raw = get(key);
    if (raw === undefined) return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > max) {
      errors.push({ field: key, issue: `ต้องเป็นจำนวนเต็ม 1–${max === Infinity ? '∞' : max}` });
      return fallback;
    }
    return n;
  };

  const q = get('q');
  if (q && q.length > 100) errors.push({ field: 'q', issue: 'ยาวได้ไม่เกิน 100 ตัวอักษร' });

  const status = get('status') || 'all';
  if (!STATUSES.includes(status)) {
    errors.push({ field: 'status', issue: `ต้องเป็นหนึ่งใน ${STATUSES.join(', ')}` });
  }

  const page = intParam('page', Infinity, 1);
  const pageSize = intParam('pageSize', MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);

  if (errors.length) {
    throw AppError.badRequest('VALIDATION_ERROR', 'เงื่อนไขการค้นหาไม่ถูกต้อง', errors);
  }
  return { q, status, page, pageSize };
}

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
