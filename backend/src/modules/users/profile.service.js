// service โปรไฟล์ (R2) — ผู้ใช้แก้ข้อมูลของตัวเอง
const bcrypt = require('bcryptjs');
const { query, withTransaction } = require('../../db/pool');
const AppError = require('../../utils/AppError');
const { signToken } = require('../../middleware/auth');

const BCRYPT_COST = 10;
const COLUMNS = `user_id, username, email, first_name, last_name, display_name, phone, avatar_url,
                 is_email_verified, created_at`;
// ช่องที่แก้ได้ (ชื่อช่องมาจากโค้ดเราเอง ไม่ได้มาจากผู้ใช้)
const EDITABLE = ['first_name', 'last_name', 'display_name', 'phone', 'avatar_url'];

function toProfile(row) {
  return { ...row, user_id: Number(row.user_id) };
}

async function get(userId) {
  const { rows } = await query(`SELECT ${COLUMNS} FROM "user" WHERE user_id = $1`, [userId]);
  return toProfile(rows[0]);
}

async function update(userId, changes) {
  const sets = [];
  const params = [];
  for (const field of EDITABLE) {
    if (changes[field] === undefined) continue;
    params.push(changes[field]);
    sets.push(`${field} = $${params.length}`);
  }
  params.push(userId);
  const { rows } = await query(
    `UPDATE "user" SET ${sets.join(', ')} WHERE user_id = $${params.length} RETURNING ${COLUMNS}`,
    params
  );
  return toProfile(rows[0]);
}

/**
 * เปลี่ยนรหัสผ่าน — รหัสเดิมผิด → 400 WRONG_PASSWORD
 * สำเร็จ → token เก่าทุกใบใช้ไม่ได้ (ออกจากระบบทุกเครื่อง) คืน token ใหม่ให้เครื่องที่กดเปลี่ยน
 */
async function changePassword(userId, currentPassword, newPassword) {
  const newHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT password_hash FROM "user" WHERE user_id = $1 FOR UPDATE', [userId]);
    if (!(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
      throw AppError.badRequest('WRONG_PASSWORD', 'รหัสผ่านปัจจุบันไม่ถูกต้อง', [
        { field: 'current_password', issue: 'รหัสผ่านไม่ถูกต้อง' },
      ]);
    }
    await client.query(
      'UPDATE "user" SET password_hash = $1, tokens_valid_after = NOW() WHERE user_id = $2',
      [newHash, userId]
    );
  });
  return signToken(userId);
}

module.exports = { get, update, changePassword };
