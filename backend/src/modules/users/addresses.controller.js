// controller ที่อยู่จัดส่ง (R2): ตรวจข้อมูลที่ส่งมา → เรียก service → ตอบ { data }
const AppError = require('../../utils/AppError');
const service = require('./addresses.service');

const PHONE_RE = /^[0-9+\-\s]{9,20}$/;
const POSTCODE_RE = /^\d{5}$/;

// ช่องข้อความของที่อยู่: [ชื่อช่อง, บังคับไหม, ยาวสุด, รูปแบบ, ข้อความเมื่อผิดรูปแบบ]
const TEXT_FIELDS = [
  ['label', false, 50],
  ['recipient_name', true, 100],
  ['phone', true, 20, PHONE_RE, 'ใส่ได้เฉพาะตัวเลข + - และเว้นวรรค 9–20 ตัว'],
  ['line1', true, 255],
  ['district', true, 100],
  ['province', true, 100],
  ['postcode', true, 5, POSTCODE_RE, 'ต้องเป็นตัวเลข 5 หลัก'],
];

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw AppError.badRequest('INVALID_ID', 'รหัสที่อยู่ไม่ถูกต้อง');
  }
  return id;
}

/**
 * ตรวจข้อมูลที่อยู่จาก body
 *   isCreate = true  → ช่องบังคับต้องครบ
 *   isCreate = false → ส่งเฉพาะช่องที่จะแก้ อย่างน้อยหนึ่งช่อง
 * is_default: ส่ง true เพื่อตั้งเป็นที่อยู่หลักได้ แต่ส่ง false ไม่ได้
 * (จะเปลี่ยนที่อยู่หลัก ให้ตั้งที่อยู่อื่นเป็นหลักแทน ระบบจะยกเลิกอันเดิมให้เอง)
 */
function parseBody(body, { isCreate }) {
  const input = body && typeof body === 'object' ? body : {};
  const errors = [];
  const out = {};

  for (const [key, required, max, pattern, issue] of TEXT_FIELDS) {
    const raw = input[key];
    if (raw === undefined) {
      if (isCreate && required) errors.push({ field: key, issue: 'required' });
      continue;
    }
    if (raw !== null && typeof raw !== 'string') {
      errors.push({ field: key, issue: 'ต้องเป็นข้อความ' });
      continue;
    }
    const value = (raw ?? '').trim();
    if (value === '') {
      if (required) errors.push({ field: key, issue: 'required' });
      else out[key] = null; // label ส่งค่าว่าง = ลบชื่อเรียก
    } else if (value.length > max) {
      errors.push({ field: key, issue: `ยาวได้ไม่เกิน ${max} ตัวอักษร` });
    } else if (pattern && !pattern.test(value)) {
      errors.push({ field: key, issue });
    } else {
      out[key] = value;
    }
  }

  if (input.is_default !== undefined) {
    if (input.is_default === true) out.is_default = true;
    else if (input.is_default === false && isCreate) out.is_default = false;
    else if (input.is_default === false) {
      errors.push({ field: 'is_default', issue: 'ตั้งที่อยู่อื่นเป็นที่อยู่หลักแทน' });
    } else errors.push({ field: 'is_default', issue: 'ต้องเป็น true หรือ false' });
  }

  if (errors.length) {
    throw AppError.badRequest('VALIDATION_ERROR', 'ข้อมูลที่อยู่ไม่ถูกต้อง', errors);
  }
  if (!isCreate && Object.keys(out).length === 0) {
    throw AppError.badRequest('VALIDATION_ERROR', 'ไม่มีข้อมูลที่จะแก้ไข');
  }
  return out;
}

const notFound = () => AppError.notFound('ADDRESS_NOT_FOUND', 'ไม่พบที่อยู่นี้');

// GET /api/addresses
async function list(req, res) {
  res.json({ data: await service.listForUser(req.user.user_id) });
}

// GET /api/addresses/:id
async function getById(req, res) {
  const address = await service.getForUser(req.user.user_id, parseId(req.params.id));
  if (!address) throw notFound();
  res.json({ data: address });
}

// POST /api/addresses
async function create(req, res) {
  const address = await service.create(req.user.user_id, parseBody(req.body, { isCreate: true }));
  res.status(201).json({ data: address });
}

// PATCH /api/addresses/:id
async function update(req, res) {
  const id = parseId(req.params.id);
  const address = await service.update(req.user.user_id, id, parseBody(req.body, { isCreate: false }));
  if (!address) throw notFound();
  res.json({ data: address });
}

// DELETE /api/addresses/:id
async function remove(req, res) {
  const deleted = await service.remove(req.user.user_id, parseId(req.params.id));
  if (!deleted) throw notFound();
  res.status(204).end();
}

module.exports = { list, getById, create, update, remove };
