// ระบบยืนยันตัวตนของ API (R2) — ใส่ไว้หน้า controller ของ route ที่ต้องล็อกอิน
//
//   const { requireAuth, requireRole, requireAdmin, requireVerified } = require('../../middleware/auth');
//
//   router.get('/me', requireAuth, controller.me);                        ต้องล็อกอิน (ใครก็ได้)
//   router.post('/', requireAuth, requireRole('admin'), controller.create); แอดมินเท่านั้น (owner หรือ staff)
//   router.post('/', requireAdmin, controller.create);                     แบบย่อของบรรทัดบน
//   router.post('/', requireAuth, requireRole('owner'), controller.x);     เจ้าของร้านเท่านั้น
//   router.post('/', requireAuth, requireVerified, controller.add);        ลูกค้าที่ยืนยันอีเมลแล้ว (ตะกร้า, wishlist, ...)
//
// ผ่าน requireAuth แล้ว controller อ่านผู้ใช้ที่ล็อกอินอยู่ได้จาก req.user (ดูรูปร่างที่ toAuthUser)
//
// หลักการ:
//   * หน้าเว็บส่ง token มากับ header  Authorization: Bearer <token>
//   * token เก็บแค่ user_id ส่วนสิทธิ์และสถานะบัญชีอ่านจากฐานข้อมูลใหม่ทุก request
//     → ปิดบัญชี (is_active = false) หรือถอดสิทธิ์แอดมินแล้วมีผลทันที ไม่ต้องรอ token หมดอายุ
//   * token ที่ออกก่อน user.tokens_valid_after ใช้ไม่ได้ (ตั้งตอนรีเซ็ต/เปลี่ยนรหัสผ่าน) = ออกจากระบบทุกเครื่อง
//   * "เป็นแอดมิน" = มีแถวในตาราง admin (BR-30 specialization) — คอลัมน์ user.role ไม่ได้ใช้ตัดสินสิทธิ์
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { query } = require('../db/pool');
const AppError = require('../utils/AppError');

const ALGORITHM = 'HS256';

/**
 * เวลาที่ใช้ยกเลิก token เก่า: UPDATE "user" SET tokens_valid_after = $1 ด้วยค่านี้
 * ใช้นาฬิกาของ API ตัวเดียวกับที่ลงเวลาใน token (ห้ามใช้ NOW() ของฐานข้อมูล ดู migration 002)
 */
function revokeTokensNow() {
  return new Date();
}

/**
 * สร้าง token หลังล็อกอินสำเร็จ
 * t = เวลาที่ออก (มิลลิวินาที) ใช้เทียบกับ tokens_valid_after — iat มาตรฐานละเอียดแค่วินาที
 * ถ้าใช้ iat token เก่าที่ออกในวินาทีเดียวกับที่สั่งยกเลิกจะยังใช้ได้
 */
function signToken(userId) {
  return jwt.sign({ sub: String(userId), t: Date.now() }, env.jwtSecret, {
    algorithm: ALGORITHM,
    expiresIn: env.jwtExpiresIn,
  });
}

/** แปลงแถวจากฐานข้อมูลเป็นข้อมูลผู้ใช้ที่ส่งให้หน้าเว็บ / เก็บใน req.user (ไม่มี password_hash) */
function toAuthUser(row) {
  return {
    user_id: Number(row.user_id),
    username: row.username,
    email: row.email,
    display_name: row.display_name,
    is_email_verified: row.is_email_verified,
    is_admin: row.admin_role !== null,
    admin_role: row.admin_role, // 'owner' | 'staff' | null
  };
}

/**
 * ผู้ใช้ที่ยังเปิดใช้งานอยู่ พร้อมสิทธิ์แอดมิน (ถ้ามี) — ไม่พบหรือถูกปิดบัญชีแล้วได้ null
 * ส่ง client มาได้ถ้าอยู่ใน transaction
 */
async function findActiveUser(userId, db = { query }) {
  const { rows } = await db.query(
    `SELECT u.user_id, u.username, u.email, u.display_name, u.is_email_verified, a.admin_role,
            FLOOR(EXTRACT(EPOCH FROM u.tokens_valid_after) * 1000)::bigint AS tokens_valid_after_ms
       FROM "user" u
       LEFT JOIN admin a ON a.user_id = u.user_id
      WHERE u.user_id = $1 AND u.is_active`,
    [userId]
  );
  if (!rows[0]) return null;
  // ซ่อนค่า tokens_valid_after ไว้ (ไม่ส่งให้หน้าเว็บ) แต่ requireAuth ยังอ่านได้
  return Object.defineProperty(toAuthUser(rows[0]), 'tokensValidAfterMs', {
    value: Number(rows[0].tokens_valid_after_ms),
  });
}

/** ต้องล็อกอิน: ไม่มี token / token ผิดหรือหมดอายุ / บัญชีถูกปิด → 401 */
async function requireAuth(req, res, next) {
  const match = /^Bearer (\S+)$/i.exec(req.get('Authorization') || '');
  if (!match) throw AppError.unauthorized();

  let payload;
  try {
    payload = jwt.verify(match[1], env.jwtSecret, { algorithms: [ALGORITHM] });
  } catch {
    throw AppError.unauthorized('เซสชันหมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่');
  }
  if (typeof payload.sub !== 'string' || !/^\d+$/.test(payload.sub)) {
    throw AppError.unauthorized('เซสชันหมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่');
  }

  const user = await findActiveUser(payload.sub);
  if (!user) throw AppError.unauthorized('บัญชีนี้ถูกปิดการใช้งานหรือไม่มีอยู่แล้ว');

  const issuedAtMs = typeof payload.t === 'number' ? payload.t : payload.iat * 1000;
  if (issuedAtMs < user.tokensValidAfterMs) {
    throw AppError.unauthorized('รหัสผ่านถูกเปลี่ยนแล้ว กรุณาเข้าสู่ระบบใหม่');
  }

  req.user = user;
  next();
}

const ROLE_CHECKS = {
  admin: (user) => user.is_admin, // แอดมินทุกระดับ
  owner: (user) => user.admin_role === 'owner', // เจ้าของร้านเท่านั้น
};

/** ต้องมีสิทธิ์ตามที่กำหนด ('admin' หรือ 'owner') — ใช้ต่อจาก requireAuth เสมอ ไม่มีสิทธิ์ → 403 */
function requireRole(role) {
  const check = ROLE_CHECKS[role];
  if (!check) {
    throw new Error(`requireRole: ไม่รู้จัก role "${role}" (ใช้ได้: ${Object.keys(ROLE_CHECKS).join(', ')})`);
  }
  return function roleGuard(req, res, next) {
    if (!req.user) throw AppError.unauthorized(); // ลืมใส่ requireAuth ไว้ก่อน
    if (!check(req.user)) throw AppError.forbidden();
    next();
  };
}

/** ต้องยืนยันอีเมลแล้ว — ผู้ใช้ที่ยังไม่ยืนยันดูสินค้าได้ แต่เขียนข้อมูลไม่ได้ → 403 */
function requireVerified(req, res, next) {
  if (!req.user) throw AppError.unauthorized();
  if (!req.user.is_email_verified) {
    throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'กรุณายืนยันอีเมลก่อนใช้งานส่วนนี้');
  }
  next();
}

// ทางลัดของ route แอดมิน: router.post('/', requireAdmin, controller.create)
const requireAdmin = [requireAuth, requireRole('admin')];

module.exports = {
  signToken,
  revokeTokensNow,
  toAuthUser,
  findActiveUser,
  requireAuth,
  requireRole,
  requireVerified,
  requireAdmin,
};
