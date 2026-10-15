// ลืมรหัสผ่าน / รีเซ็ตรหัสผ่าน (R2 · BR-02)
//   1. ผู้ใช้กรอกอีเมล → ส่งลิงก์ที่มี token สุ่มไปทางอีเมล (ใช้ได้ 30 นาที ครั้งเดียว)
//   2. กดลิงก์ → ตั้งรหัสใหม่ → token ทุกใบที่ยังไม่ใช้ถูกยกเลิก และออกจากระบบทุกเครื่อง
// ตอบเหมือนกันทุกกรณีไม่ว่าอีเมลจะมีในระบบหรือไม่ คนนอกจะได้ใช้หน้านี้เช็กไม่ได้ว่าใครเป็นสมาชิก
const bcrypt = require('bcryptjs');
const env = require('../../config/env');
const { query, withTransaction } = require('../../db/pool');
const AppError = require('../../utils/AppError');
const mailer = require('../../utils/mailer');
const { generateResetToken, hashSecret } = require('./secrets');

const RESET_TTL_MINUTES = 30;
const REQUEST_COOLDOWN_SECONDS = 60;
const BCRYPT_COST = 10;

/** ขอลิงก์รีเซ็ตรหัสผ่าน — ไม่คืนอะไร และไม่ throw ถ้าไม่พบอีเมล */
async function requestReset(email) {
  const { rows } = await query(
    `SELECT u.user_id, u.email, u.display_name,
            (SELECT MAX(created_at) FROM password_reset_request r WHERE r.user_id = u.user_id)
              > NOW() - make_interval(secs => $2) AS too_soon
       FROM "user" u
      WHERE u.email = $1 AND u.is_active`,
    [email, REQUEST_COOLDOWN_SECONDS]
  );
  const user = rows[0];
  if (!user || user.too_soon) return; // ไม่มีบัญชี หรือเพิ่งขอไป → เงียบไว้ ตอบเหมือนส่งแล้ว

  const token = generateResetToken();
  await query(
    `INSERT INTO password_reset_request (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + make_interval(mins => $3))`,
    [user.user_id, hashSecret(token), RESET_TTL_MINUTES]
  );

  const link = `${env.appUrl}/reset-password?token=${token}`;
  try {
    await mailer.send({
      to: user.email,
      subject: 'ตั้งรหัสผ่านใหม่ Maison de Relic',
      text:
        `สวัสดีคุณ ${user.display_name}\n\n` +
        `กดลิงก์นี้เพื่อตั้งรหัสผ่านใหม่ (ใช้ได้ ${RESET_TTL_MINUTES} นาที และใช้ได้ครั้งเดียว)\n${link}\n\n` +
        'ถ้าคุณไม่ได้ขอเปลี่ยนรหัสผ่าน ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ',
    });
  } catch (err) {
    console.error('ส่งอีเมลรีเซ็ตรหัสผ่านไม่สำเร็จ:', err.message);
  }
}

/**
 * ตั้งรหัสผ่านใหม่ด้วย token จากลิงก์
 * token ผิด / หมดอายุ / ใช้ไปแล้ว / บัญชีถูกปิด → 400 INVALID_RESET_TOKEN
 * สำเร็จแล้ว: ถือว่ายืนยันอีเมลด้วย (กดลิงก์จากอีเมลได้ = เป็นเจ้าของอีเมลจริง)
 */
async function resetPassword(token, newPassword) {
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT r.request_id, r.user_id
         FROM password_reset_request r
         JOIN "user" u ON u.user_id = r.user_id
        WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > NOW() AND u.is_active
        FOR UPDATE OF r`,
      [hashSecret(token)]
    );
    if (!rows[0]) {
      throw AppError.badRequest('INVALID_RESET_TOKEN', 'ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่');
    }
    const userId = rows[0].user_id;
    await client.query(
      `UPDATE "user"
          SET password_hash = $1, is_email_verified = TRUE, tokens_valid_after = NOW()
        WHERE user_id = $2`,
      [passwordHash, userId]
    );
    // ลิงก์ทุกอันของผู้ใช้คนนี้ที่ยังไม่ได้ใช้ ใช้ไม่ได้อีก
    await client.query(
      'UPDATE password_reset_request SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
      [userId]
    );
  });
}

module.exports = { requestReset, resetPassword, RESET_TTL_MINUTES };
