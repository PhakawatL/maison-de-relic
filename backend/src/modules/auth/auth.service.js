// service ของระบบล็อกอินและสมัครสมาชิก (R2) — SQL และการตรวจรหัสผ่านอยู่ที่นี่
const bcrypt = require('bcryptjs');
const { query, withTransaction } = require('../../db/pool');
const AppError = require('../../utils/AppError');
const { signToken, toAuthUser, findActiveUser, revokeTokensNow } = require('../../middleware/auth');
const { rethrowDuplicate } = require('../users/account.validation');
const verification = require('./verification.service');

const BCRYPT_COST = 10;

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

/**
 * สมัครสมาชิก (ลูกค้า) → สร้างบัญชีที่ยังไม่ยืนยันอีเมล + ส่ง OTP แล้วล็อกอินให้เลย
 * คืน { token, user, email_sent, otp_expires_at }
 *
 * อีเมลนี้มีบัญชีที่ "ยังไม่ยืนยัน" อยู่แล้ว → เขียนทับแถวเดิม (คนที่สมัครค้างไว้กลับมาสมัครใหม่ได้)
 *   และยกเลิก token เก่าของแถวนั้น — คนที่เคยสมัครด้วยอีเมลของคนอื่นจะใช้บัญชีต่อไม่ได้
 *   ปลอดภัยเพราะบัญชีที่ยังไม่ยืนยันเขียนข้อมูลอะไรไม่ได้เลย จึงไม่มีอะไรหาย
 * อีเมลนี้ยืนยันแล้ว / เป็นแอดมิน / ถูกปิดบัญชี → 409 อีเมลซ้ำ
 * สมัครทับซ้ำภายใน 60 วินาทีหลังส่ง OTP ครั้งก่อน → 429 (กันใช้หน้านี้ยิงอีเมลใส่คนอื่นรัว ๆ)
 */
async function register(data) {
  const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST);

  const { userId, code, expiresAt } = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT u.user_id, u.is_email_verified, u.is_active, a.user_id IS NOT NULL AS is_admin
         FROM "user" u
         LEFT JOIN admin a ON a.user_id = u.user_id
        WHERE u.email = $1
        FOR UPDATE OF u`,
      [data.email]
    );
    const existing = rows[0];
    if (existing && (existing.is_email_verified || existing.is_admin || !existing.is_active)) {
      throw AppError.conflict('DUPLICATE', 'อีเมลนี้ถูกใช้แล้ว', [{ field: 'email', issue: 'อีเมลนี้ถูกใช้แล้ว' }]);
    }

    if (existing) {
      const wait = await verification.secondsUntilNextOtp(client, existing.user_id);
      if (wait > 0) throw verification.tooManyRequests(wait);
    }

    const values = [
      data.username, passwordHash, data.first_name, data.last_name, data.display_name, data.phone ?? null,
    ];
    let id;
    try {
      if (existing) {
        await client.query(
          `UPDATE "user"
              SET username = $1, password_hash = $2, first_name = $3, last_name = $4,
                  display_name = $5, phone = $6, tokens_valid_after = $7
            WHERE user_id = $8`,
          [...values, revokeTokensNow(), existing.user_id]
        );
        id = existing.user_id;
      } else {
        const inserted = await client.query(
          `INSERT INTO "user" (username, password_hash, first_name, last_name, display_name, phone, email)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING user_id`,
          [...values, data.email]
        );
        id = inserted.rows[0].user_id;
      }
    } catch (err) {
      rethrowDuplicate(err);
    }

    const otp = await verification.issueOtp(client, id);
    return { userId: id, ...otp };
  });

  const emailSent = await verification.sendOtpEmail(data.email, code);
  return {
    token: signToken(userId),
    user: await findActiveUser(userId),
    email_sent: emailSent,
    otp_expires_at: expiresAt,
  };
}

module.exports = { login, register };
