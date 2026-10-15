// service ของระบบล็อกอิน (R2) — SQL และการตรวจรหัสผ่านอยู่ที่นี่
const bcrypt = require('bcryptjs');
const { query } = require('../../db/pool');
const AppError = require('../../utils/AppError');
const { signToken, toAuthUser } = require('../../middleware/auth');

// hash ของรหัสผ่านมั่ว ๆ ใช้ตอนไม่พบ username เพื่อให้ใช้เวลาตอบพอ ๆ กับกรณีรหัสผิด
// (ถ้าตอบเร็วกว่า คนนอกจะจับเวลาแล้วเดาได้ว่า username ไหนมีอยู่จริง)
const DUMMY_HASH = '$2b$10$7o2akqAclFclEZDHKgz5PeY150W58MXuFnnAXYanz38mevfqTAKFy';

/**
 * ล็อกอินด้วย username + password
 *   สำเร็จ → { token, user }
 *   ไม่พบผู้ใช้ หรือรหัสผิด → 401 INVALID_CREDENTIALS (ข้อความเดียวกัน ไม่บอกว่าผิดช่องไหน)
 *   รหัสถูกแต่บัญชีถูกปิด → 403 ACCOUNT_DISABLED
 */
async function login(username, password) {
  const { rows } = await query(
    `SELECT u.user_id, u.username, u.email, u.display_name, u.is_email_verified,
            u.is_active, u.password_hash, a.admin_role
       FROM "user" u
       LEFT JOIN admin a ON a.user_id = u.user_id
      WHERE u.username = $1`,
    [username]
  );
  const row = rows[0];

  const passwordOk = await bcrypt.compare(password, row ? row.password_hash : DUMMY_HASH);
  if (!row || !passwordOk) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }
  // เช็กหลังรหัสถูกแล้วเท่านั้น คนที่ไม่รู้รหัสจะได้ไม่รู้ว่าบัญชีนี้ถูกปิด
  if (!row.is_active) {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแลร้าน');
  }

  return { token: signToken(row.user_id), user: toAuthUser(row) };
}

module.exports = { login };
