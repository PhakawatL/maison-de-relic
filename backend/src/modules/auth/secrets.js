// สร้างและเก็บรหัสลับของระบบสมาชิก (R2): รหัส OTP 6 หลัก และ token ในลิงก์รีเซ็ตรหัสผ่าน
// ในฐานข้อมูลเก็บแค่ hash (HMAC-SHA256 ด้วย JWT_SECRET) ถ้าฐานข้อมูลหลุด คนได้ไปก็เอารหัสจริงมาใช้ไม่ได้
const crypto = require('crypto');
const env = require('../../config/env');

/** รหัส OTP 6 หลัก เช่น '042917' (สุ่มแบบปลอดภัย ไม่ใช่ Math.random) */
function generateOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/** token สุ่ม 32 ไบต์ สำหรับลิงก์รีเซ็ตรหัสผ่าน (เดาไม่ได้ จึงไม่ต้องนับจำนวนครั้งที่ลอง) */
function generateResetToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashSecret(value) {
  return crypto.createHmac('sha256', env.jwtSecret).update(String(value)).digest('hex');
}

/** เทียบรหัสกับ hash ที่เก็บไว้ ใช้เวลาเท่ากันทุกกรณี (กันการจับเวลาเดาทีละตัว) */
function matchesHash(value, storedHash) {
  const a = Buffer.from(hashSecret(value), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { generateOtp, generateResetToken, hashSecret, matchesHash };
