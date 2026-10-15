// ตรวจข้อมูลบัญชีผู้ใช้จาก body (R2) — ใช้ร่วมกันหลายที่ กติกาเลยตรงกันทั้งระบบ
//   สมัครสมาชิก     POST /api/auth/register
//   แก้โปรไฟล์      PATCH /api/profile
//   จัดการผู้ดูแล   POST / PATCH /api/admins
const AppError = require('../../utils/AppError');

const USERNAME_RE = /^[A-Za-z0-9_.]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-\s]{9,20}$/;
const URL_RE = /^https?:\/\/\S+$/;
const ADMIN_ROLES = ['owner', 'staff'];

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 100;

// ช่องที่เป็น NOT NULL ในตาราง "user" — ตอนแก้ห้ามส่งค่าว่างมา
const NOT_NULL = ['email', 'first_name', 'last_name', 'display_name'];

/** ตรวจรหัสผ่าน คืนข้อความปัญหา หรือ null ถ้าผ่าน */
function passwordIssue(pw) {
  if (typeof pw !== 'string' || pw.length < PASSWORD_MIN || pw.length > PASSWORD_MAX) {
    return `ต้องยาว ${PASSWORD_MIN}–${PASSWORD_MAX} ตัวอักษร`;
  }
  return null;
}

/**
 * ตรวจข้อมูลบัญชี
 *   fields   = ช่องที่ endpoint นี้รับ (ช่องอื่นที่ส่งมาจะถูกข้าม)
 *   isCreate = true  → ช่องบังคับต้องครบ
 *   isCreate = false → ส่งเฉพาะช่องที่จะแก้ อย่างน้อยหนึ่งช่อง
 * คืนค่าเฉพาะช่องที่ส่งมา (ตัด space หัวท้ายแล้ว ยกเว้นรหัสผ่าน · อีเมลเป็นตัวพิมพ์เล็ก)
 */
function parseAccountBody(body, { isCreate, fields }) {
  const input = body && typeof body === 'object' ? body : {};
  const accepts = (key) => fields.includes(key);
  const has = (key) => input[key] !== undefined;
  const errors = [];
  const out = {};

  const text = (key, { required = false, max = 100, pattern, issue, normalize } = {}) => {
    if (!accepts(key)) return;
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
  text('avatar_url', { max: 500, pattern: URL_RE, issue: 'ต้องเป็นลิงก์ที่ขึ้นต้นด้วย http:// หรือ https://' });

  if (!isCreate) {
    for (const key of NOT_NULL) {
      if (out[key] === null) errors.push({ field: key, issue: 'required' });
    }
  }

  if (accepts('password')) {
    if (has('password') && input.password !== '' && input.password !== null) {
      const issue = passwordIssue(input.password);
      if (issue) errors.push({ field: 'password', issue });
      else out.password = input.password;
    } else if (isCreate) {
      errors.push({ field: 'password', issue: 'required' });
    }
  }

  if (accepts('admin_role')) {
    if (has('admin_role')) {
      if (!ADMIN_ROLES.includes(input.admin_role)) {
        errors.push({ field: 'admin_role', issue: `ต้องเป็นหนึ่งใน ${ADMIN_ROLES.join(', ')}` });
      } else {
        out.admin_role = input.admin_role;
      }
    } else if (isCreate) {
      out.admin_role = 'staff';
    }
  }

  if (accepts('is_active') && has('is_active')) {
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
  if (isCreate && accepts('display_name') && !out.display_name) out.display_name = out.first_name;
  return out;
}

/**
 * แปลง error ข้อมูลซ้ำของ PostgreSQL (username / email ของตาราง "user") เป็น 409 ที่บอกว่าช่องไหนซ้ำ
 * ใช้ใน catch: } catch (err) { rethrowDuplicate(err); }
 */
function rethrowDuplicate(err) {
  if (err.code === '23505') {
    if (err.constraint === 'user_username_key') {
      throw AppError.conflict('DUPLICATE', 'ชื่อผู้ใช้นี้ถูกใช้แล้ว', [{ field: 'username', issue: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' }]);
    }
    if (err.constraint === 'user_email_key') {
      throw AppError.conflict('DUPLICATE', 'อีเมลนี้ถูกใช้แล้ว', [{ field: 'email', issue: 'อีเมลนี้ถูกใช้แล้ว' }]);
    }
  }
  throw err;
}

module.exports = { parseAccountBody, passwordIssue, rethrowDuplicate, PASSWORD_MIN, PASSWORD_MAX };
