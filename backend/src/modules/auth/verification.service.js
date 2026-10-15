// ยืนยันอีเมลด้วย OTP (R2 · BR-01)
//   * รหัส 6 หลัก หมดอายุใน 10 นาที กรอกผิดได้ 5 ครั้ง
//   * ใช้ได้เฉพาะรหัสล่าสุด ขอรหัสใหม่แล้วรหัสเก่าใช้ไม่ได้
//   * ขอรหัสใหม่ได้ทุก 60 วินาที (กันกดรัวจนอีเมลกลายเป็นสแปม)
const { withTransaction } = require('../../db/pool');
const AppError = require('../../utils/AppError');
const mailer = require('../../utils/mailer');
const { findActiveUser } = require('../../middleware/auth');
const { generateOtp, hashSecret, matchesHash } = require('./secrets');

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const PURPOSE = 'verify_email';

/** สร้างรหัส OTP ใหม่ให้ผู้ใช้ (เรียกใน transaction) คืนรหัสจริงไว้ส่งอีเมล */
async function issueOtp(client, userId) {
  const code = generateOtp();
  const { rows } = await client.query(
    `INSERT INTO otp_verification (user_id, code_hash, purpose, expires_at)
     VALUES ($1, $2, $3, NOW() + make_interval(mins => $4))
     RETURNING expires_at`,
    [userId, hashSecret(code), PURPOSE, OTP_TTL_MINUTES]
  );
  return { code, expiresAt: rows[0].expires_at };
}

/** ส่งรหัสทางอีเมล — ส่งไม่สำเร็จไม่ทำให้ทั้งคำขอพัง (ผู้ใช้กดขอรหัสใหม่ได้) คืน true/false */
async function sendOtpEmail(to, code) {
  try {
    await mailer.send({
      to,
      subject: `รหัสยืนยันอีเมล Maison de Relic: ${code}`,
      text:
        `รหัสยืนยันอีเมลของคุณคือ ${code}\n\n` +
        `รหัสนี้ใช้ได้ ${OTP_TTL_MINUTES} นาที ห้ามบอกรหัสนี้กับผู้อื่น\n` +
        'ถ้าคุณไม่ได้สมัครสมาชิก Maison de Relic ไม่ต้องทำอะไร',
    });
    return true;
  } catch (err) {
    console.error('ส่งอีเมล OTP ไม่สำเร็จ:', err.message);
    return false;
  }
}

/** ขอรหัสใหม่ — ยืนยันแล้ว → 409, ขอถี่เกิน → 429 */
async function resendOtp(userId) {
  const { code, expiresAt, email } = await withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT email, is_email_verified FROM "user" WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    if (rows[0].is_email_verified) {
      throw AppError.conflict('ALREADY_VERIFIED', 'ยืนยันอีเมลแล้ว');
    }
    const last = await client.query(
      `SELECT CEIL(EXTRACT(EPOCH FROM (created_at + make_interval(secs => $3) - NOW())))::int AS wait
         FROM otp_verification
        WHERE user_id = $1 AND purpose = $2
        ORDER BY otp_id DESC LIMIT 1`,
      [userId, PURPOSE, RESEND_COOLDOWN_SECONDS]
    );
    const wait = last.rows[0]?.wait ?? 0;
    if (wait > 0) {
      throw new AppError(429, 'TOO_MANY_REQUESTS', `ขอรหัสใหม่ได้อีกครั้งใน ${wait} วินาที`, {
        retry_after: wait,
      });
    }
    return { ...(await issueOtp(client, userId)), email: rows[0].email };
  });
  const emailSent = await sendOtpEmail(email, code);
  return { otp_expires_at: expiresAt, email_sent: emailSent };
}

/**
 * ตรวจรหัส OTP — ถูก → ยืนยันอีเมลแล้วคืนข้อมูลผู้ใช้ล่าสุด
 *   ผิด → 400 INVALID_OTP (บอกจำนวนครั้งที่เหลือ)
 *   หมดอายุ / ผิดครบ / ไม่มีรหัส → 400 OTP_EXPIRED (ต้องขอรหัสใหม่)
 */
async function verifyEmail(userId, code) {
  // การนับครั้งที่ผิดต้อง COMMIT ก่อนแล้วค่อยตอบ error — ถ้า throw ใน transaction จะถูก ROLLBACK หายไป
  const result = await withTransaction(async (client) => {
    const { rows: users } = await client.query(
      'SELECT is_email_verified FROM "user" WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    if (users[0].is_email_verified) return { ok: true };

    const { rows } = await client.query(
      `SELECT otp_id, code_hash, attempts, expires_at <= NOW() AS expired
         FROM otp_verification
        WHERE user_id = $1 AND purpose = $2 AND verified_at IS NULL
        ORDER BY otp_id DESC LIMIT 1`,
      [userId, PURPOSE]
    );
    const otp = rows[0];
    if (!otp || otp.expired || otp.attempts >= MAX_ATTEMPTS) return { ok: false, expired: true };

    if (!matchesHash(code, otp.code_hash)) {
      await client.query('UPDATE otp_verification SET attempts = attempts + 1 WHERE otp_id = $1', [otp.otp_id]);
      return { ok: false, remaining: MAX_ATTEMPTS - otp.attempts - 1 };
    }

    await client.query('UPDATE otp_verification SET verified_at = NOW() WHERE otp_id = $1', [otp.otp_id]);
    await client.query('UPDATE "user" SET is_email_verified = TRUE WHERE user_id = $1', [userId]);
    return { ok: true };
  });

  if (result.expired || result.remaining === 0) {
    throw AppError.badRequest('OTP_EXPIRED', 'รหัสหมดอายุหรือกรอกผิดครบจำนวนครั้งแล้ว กรุณากดขอรหัสใหม่');
  }
  if (!result.ok) {
    throw AppError.badRequest('INVALID_OTP', `รหัสไม่ถูกต้อง (ลองได้อีก ${result.remaining} ครั้ง)`, {
      remaining_attempts: result.remaining,
    });
  }
  return findActiveUser(userId);
}

module.exports = { issueOtp, sendOtpEmail, resendOtp, verifyEmail, OTP_TTL_MINUTES, MAX_ATTEMPTS };
