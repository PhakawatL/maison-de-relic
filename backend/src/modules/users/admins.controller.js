// controller จัดการบัญชีผู้ดูแล (R2): ตรวจข้อมูลที่ส่งมา → เรียก service → ตอบ { data }
const AppError = require('../../utils/AppError');
const service = require('./admins.service');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const STATUSES = ['all', 'active', 'inactive'];
const ADMIN_ROLES = ['owner', 'staff'];

const USERNAME_RE = /^[A-Za-z0-9_.]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-\s]{9,20}$/;

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

/**
 * ตรวจข้อมูลบัญชีจาก body
 *   isCreate = true  → ช่องบังคับต้องมีครบ
 *   isCreate = false → ส่งมาเฉพาะช่องที่จะแก้ แต่ต้องมีอย่างน้อยหนึ่งช่อง
 * คืนค่าเฉพาะช่องที่ส่งมา (ตัด space หัวท้ายแล้ว ยกเว้นรหัสผ่าน)
 */
function parseAccountBody(body, { isCreate }) {
  const input = body && typeof body === 'object' ? body : {};
  const errors = [];
  const out = {};
  const has = (key) => input[key] !== undefined;

  const text = (key, { required = false, max = 100, pattern, issue, normalize } = {}) => {
    if (!has(key) || input[key] === null || input[key] === '') {
      if (required) errors.push({ field: key, issue: 'required' });
      else if (has(key)) out[key] = null; // ช่องที่ไม่บังคับ ส่งค่าว่างมา = ลบค่าเดิม
      return;
    }
    if (typeof input[key] !== 'string') {
      errors.push({ field: key, issue: 'ต้องเป็นข้อความ' });
      return;
    }
    let value = input[key].trim();
    if (normalize) value = normalize(value);
    if (value === '') {
      if (required) errors.push({ field: key, issue: 'required' });
      else out[key] = null;
      return;
    }
    if (value.length > max) {
      errors.push({ field: key, issue: `ยาวได้ไม่เกิน ${max} ตัวอักษร` });
    } else if (pattern && !pattern.test(value)) {
      errors.push({ field: key, issue });
    } else {
      out[key] = value;
    }
  };

  if (isCreate) {
    text('username', {
      required: true,
      pattern: USERNAME_RE,
      issue: 'ใช้ได้เฉพาะ a-z, A-Z, 0-9, _ และ . ยาว 3–30 ตัว',
    });
  } else if (has('username')) {
    errors.push({ field: 'username', issue: 'เปลี่ยนชื่อผู้ใช้ไม่ได้' });
  }

  text('email', {
    required: isCreate,
    max: 254,
    pattern: EMAIL_RE,
    issue: 'รูปแบบอีเมลไม่ถูกต้อง',
    normalize: (v) => v.toLowerCase(),
  });
  text('first_name', { required: isCreate });
  text('last_name', { required: isCreate });
  text('display_name');
  text('phone', { max: 20, pattern: PHONE_RE, issue: 'ใส่ได้เฉพาะตัวเลข + - และเว้นวรรค 9–20 ตัว' });

  // ชื่อจริง นามสกุล ชื่อที่แสดง เป็น NOT NULL ในตาราง — ตอนแก้ห้ามส่งค่าว่างมา
  for (const key of ['email', 'first_name', 'last_name', 'display_name']) {
    if (!isCreate && out[key] === null) errors.push({ field: key, issue: 'required' });
  }

  if (has('password') && input.password !== '' && input.password !== null) {
    const pw = input.password;
    if (typeof pw !== 'string' || pw.length < 8 || pw.length > 100) {
      errors.push({ field: 'password', issue: 'ต้องยาว 8–100 ตัวอักษร' });
    } else {
      out.password = pw;
    }
  } else if (isCreate) {
    errors.push({ field: 'password', issue: 'required' });
  }

  if (has('admin_role')) {
    if (!ADMIN_ROLES.includes(input.admin_role)) {
      errors.push({ field: 'admin_role', issue: `ต้องเป็นหนึ่งใน ${ADMIN_ROLES.join(', ')}` });
    } else {
      out.admin_role = input.admin_role;
    }
  } else if (isCreate) {
    out.admin_role = 'staff';
  }

  if (!isCreate && has('is_active')) {
    if (typeof input.is_active !== 'boolean') {
      errors.push({ field: 'is_active', issue: 'ต้องเป็น true หรือ false' });
    } else {
      out.is_active = input.is_active;
    }
  }

  if (errors.length) {
    throw AppError.badRequest('VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง', errors);
  }
  if (!isCreate && Object.keys(out).length === 0) {
    throw AppError.badRequest('VALIDATION_ERROR', 'ไม่มีข้อมูลที่จะแก้ไข');
  }
  if (isCreate && !out.display_name) out.display_name = out.first_name;
  return out;
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
  const data = parseAccountBody(req.body, { isCreate: true });
  const admin = await service.create(req.user.user_id, data);
  res.status(201).json({ data: admin });
}

// PATCH /api/admins/:id
async function update(req, res) {
  const id = parseId(req.params.id);
  const changes = parseAccountBody(req.body, { isCreate: false });
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
