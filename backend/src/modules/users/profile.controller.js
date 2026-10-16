// controller โปรไฟล์ (R2): ตรวจข้อมูลที่ส่งมา → เรียก service → ตอบ { data }
const AppError = require('../../utils/AppError');
const service = require('./profile.service');
const { parseAccountBody, passwordIssue } = require('./account.validation');

// อีเมลแก้ที่นี่ไม่ได้ (ต้องยืนยันอีเมลใหม่ด้วย OTP ซึ่งยังไม่ได้ทำ) · username เปลี่ยนไม่ได้
const PROFILE_FIELDS = ['first_name', 'last_name', 'display_name', 'phone', 'avatar_url'];

// GET /api/profile
async function get(req, res) {
  res.json({ data: await service.get(req.user.user_id) });
}

// PATCH /api/profile
async function update(req, res) {
  const changes = parseAccountBody(req.body, { isCreate: false, fields: PROFILE_FIELDS });
  res.json({ data: await service.update(req.user.user_id, changes) });
}

// PUT /api/profile/password — ต้องใส่รหัสเดิมด้วย สำเร็จแล้วได้ token ใหม่ (token เก่าทุกเครื่องใช้ไม่ได้)
async function changePassword(req, res) {
  const input = req.body && typeof req.body === 'object' ? req.body : {};
  const errors = [];
  if (typeof input.current_password !== 'string' || input.current_password === '') {
    errors.push({ field: 'current_password', issue: 'required' });
  } else if (input.current_password.length > 100) {
    errors.push({ field: 'current_password', issue: 'ยาวได้ไม่เกิน 100 ตัวอักษร' });
  }
  const issue = passwordIssue(input.new_password);
  if (issue) errors.push({ field: 'new_password', issue });
  if (errors.length) throw AppError.badRequest('VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง', errors);

  const token = await service.changePassword(req.user.user_id, input.current_password, input.new_password);
  res.json({ data: { token } });
}

module.exports = { get, update, changePassword };
