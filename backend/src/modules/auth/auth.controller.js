// controller ของระบบล็อกอิน (R2): ตรวจข้อมูลที่ส่งมา → เรียก service → ตอบ { data }
const AppError = require('../../utils/AppError');
const service = require('./auth.service');

const MAX_LENGTH = 100; // กันคนส่งข้อความยาวมาก ๆ มาให้ bcrypt คำนวณ

// POST /api/auth/login
async function login(req, res) {
  const { username, password } = req.body || {};
  const errors = [];
  if (typeof username !== 'string' || username.trim() === '') {
    errors.push({ field: 'username', issue: 'required' });
  } else if (username.length > MAX_LENGTH) {
    errors.push({ field: 'username', issue: `ยาวได้ไม่เกิน ${MAX_LENGTH} ตัวอักษร` });
  }
  if (typeof password !== 'string' || password === '') {
    errors.push({ field: 'password', issue: 'required' });
  } else if (password.length > MAX_LENGTH) {
    errors.push({ field: 'password', issue: `ยาวได้ไม่เกิน ${MAX_LENGTH} ตัวอักษร` });
  }
  if (errors.length) {
    throw AppError.badRequest('VALIDATION_ERROR', 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน', errors);
  }

  // username ตัด space หัวท้ายได้ แต่รหัสผ่านต้องใช้ตามที่พิมพ์มาทุกตัว
  const result = await service.login(username.trim(), password);
  res.json({ data: result });
}

// GET /api/auth/me — requireAuth ใส่ข้อมูลผู้ใช้ไว้ใน req.user แล้ว
async function me(req, res) {
  res.json({ data: req.user });
}

module.exports = { login, me };
