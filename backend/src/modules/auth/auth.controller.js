// controller ของระบบสมาชิก (R2): ตรวจข้อมูลที่ส่งมา → เรียก service → ตอบ { data }
const AppError = require('../../utils/AppError');
const service = require('./auth.service');
const verification = require('./verification.service');
const passwordReset = require('./password-reset.service');
const { parseAccountBody, passwordIssue } = require('../users/account.validation');

const MAX_LENGTH = 100; // กันคนส่งข้อความยาวมาก ๆ มาให้ bcrypt คำนวณ
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGISTER_FIELDS = ['username', 'email', 'password', 'first_name', 'last_name', 'display_name', 'phone'];

function body(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

// POST /api/auth/login
async function login(req, res) {
  const { username, password } = body(req);
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

// POST /api/auth/register
async function register(req, res) {
  const data = parseAccountBody(req.body, { isCreate: true, fields: REGISTER_FIELDS });
  const result = await service.register(data);
  res.status(201).json({ data: result });
}

// POST /api/auth/verify-email
async function verifyEmail(req, res) {
  const { code } = body(req);
  const value = typeof code === 'string' ? code.replace(/\s/g, '') : '';
  if (!/^\d{6}$/.test(value)) {
    throw AppError.badRequest('VALIDATION_ERROR', 'กรุณากรอกรหัส 6 หลัก', [{ field: 'code', issue: 'ต้องเป็นตัวเลข 6 หลัก' }]);
  }
  const user = await verification.verifyEmail(req.user.user_id, value);
  res.json({ data: user });
}

// POST /api/auth/resend-otp
async function resendOtp(req, res) {
  res.json({ data: await verification.resendOtp(req.user.user_id) });
}

// POST /api/auth/forgot-password — ตอบเหมือนกันเสมอ ไม่บอกว่าอีเมลนี้มีในระบบหรือไม่
async function forgotPassword(req, res) {
  const { email } = body(req);
  const value = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(value) || value.length > 254) {
    throw AppError.badRequest('VALIDATION_ERROR', 'รูปแบบอีเมลไม่ถูกต้อง', [{ field: 'email', issue: 'รูปแบบอีเมลไม่ถูกต้อง' }]);
  }
  await passwordReset.requestReset(value);
  res.json({
    data: { message: 'ถ้ามีบัญชีที่ใช้อีเมลนี้ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปแล้ว กรุณาตรวจสอบกล่องจดหมาย' },
  });
}

// POST /api/auth/reset-password
async function resetPassword(req, res) {
  const { token, password } = body(req);
  const errors = [];
  if (typeof token !== 'string' || token === '' || token.length > 200) {
    errors.push({ field: 'token', issue: 'required' });
  }
  const issue = passwordIssue(password);
  if (issue) errors.push({ field: 'password', issue });
  if (errors.length) throw AppError.badRequest('VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง', errors);

  await passwordReset.resetPassword(token, password);
  res.json({ data: { message: 'ตั้งรหัสผ่านใหม่แล้ว กรุณาเข้าสู่ระบบด้วยรหัสใหม่' } });
}

module.exports = { login, me, register, verifyEmail, resendOtp, forgotPassword, resetPassword };
