// service จัดการบัญชีผู้ดูแล (R2) — SQL ทั้งหมดของหน้า admin/users อยู่ที่นี่
// ผู้ดูแล = แถวใน "user" ที่มีแถวคู่กันในตาราง admin (BR-30)
// ทุกการเพิ่ม / แก้ / ปิดบัญชี บันทึกลง admin_action_log ใน transaction เดียวกัน (BR-31)
const bcrypt = require('bcryptjs');
const { query, withTransaction } = require('../../db/pool');
const AppError = require('../../utils/AppError');
const { rethrowDuplicate } = require('./account.validation');

const BCRYPT_COST = 10;

const COLUMNS = `
  u.user_id, u.username, u.email, u.first_name, u.last_name, u.display_name, u.phone,
  u.is_active, u.created_at, a.admin_role, a.granted_at`;

const FROM = `
  FROM "user" u
  JOIN admin a ON a.user_id = u.user_id`;

// ช่องในตาราง "user" ที่แก้ผ่านหน้านี้ได้ (ชื่อช่องมาจากโค้ดเราเอง ไม่ได้มาจากผู้ใช้)
const USER_FIELDS = ['email', 'first_name', 'last_name', 'display_name', 'phone', 'is_active'];

const FIELD_LABELS = {
  email: 'อีเมล',
  first_name: 'ชื่อ',
  last_name: 'นามสกุล',
  display_name: 'ชื่อที่แสดง',
  phone: 'เบอร์โทร',
};

function toAdmin(row) {
  return {
    user_id: Number(row.user_id),
    username: row.username,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    display_name: row.display_name,
    phone: row.phone,
    admin_role: row.admin_role,
    is_active: row.is_active,
    granted_at: row.granted_at,
    created_at: row.created_at,
  };
}

async function logAction(client, adminId, actionType, targetId, note) {
  await client.query(
    `INSERT INTO admin_action_log (admin_id, action_type, target_type, target_id, note)
     VALUES ($1, $2, 'user', $3, $4)`,
    [adminId, actionType, targetId, note]
  );
}

/**
 * รายชื่อผู้ดูแลแบบแบ่งหน้า
 * filters: { q, status: 'all' | 'active' | 'inactive', page, pageSize }
 * เรียง: ที่ใช้งานอยู่ก่อน → owner ก่อน staff → username
 */
async function list({ q, status, page, pageSize }) {
  const where = [];
  const params = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (q) {
    const ph = add(`%${q}%`);
    where.push(`(u.username ILIKE ${ph} OR u.email ILIKE ${ph} OR u.display_name ILIKE ${ph}
                 OR u.first_name ILIKE ${ph} OR u.last_name ILIKE ${ph})`);
  }
  if (status === 'active') where.push('u.is_active');
  if (status === 'inactive') where.push('NOT u.is_active');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countResult = await query(`SELECT COUNT(*)::int AS total ${FROM} ${whereSql}`, params);

  const limit = add(pageSize);
  const offset = add((page - 1) * pageSize);
  const { rows } = await query(
    `SELECT ${COLUMNS} ${FROM} ${whereSql}
      ORDER BY u.is_active DESC, (a.admin_role = 'owner') DESC, u.username
      LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  return { items: rows.map(toAdmin), total: countResult.rows[0].total };
}

async function getById(id, db = { query }) {
  const { rows } = await db.query(`SELECT ${COLUMNS} ${FROM} WHERE u.user_id = $1`, [id]);
  return rows[0] ? toAdmin(rows[0]) : null;
}

/**
 * เพิ่มผู้ดูแลใหม่ (สร้างแถวใน "user" + admin พร้อมกัน)
 * บัญชีที่แอดมินสร้างให้ถือว่ายืนยันอีเมลแล้ว ไม่ต้องผ่าน OTP
 */
async function create(actorId, data) {
  const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST);
  return withTransaction(async (client) => {
    let userId;
    try {
      const { rows } = await client.query(
        `INSERT INTO "user"
           (username, email, password_hash, first_name, last_name, display_name, phone, role, is_email_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'admin', TRUE)
         RETURNING user_id`,
        [data.username, data.email, passwordHash, data.first_name, data.last_name, data.display_name, data.phone ?? null]
      );
      userId = rows[0].user_id;
    } catch (err) {
      rethrowDuplicate(err);
    }
    await client.query('INSERT INTO admin (user_id, admin_role) VALUES ($1, $2)', [userId, data.admin_role]);
    await logAction(client, actorId, 'create_admin', userId, `เพิ่มผู้ดูแล ${data.username} (${data.admin_role})`);
    return getById(userId, client);
  });
}

/**
 * แก้ข้อมูลผู้ดูแล — changes มีเฉพาะช่องที่จะแก้
 *   { email, first_name, last_name, display_name, phone, password, admin_role, is_active }
 * ปิดบัญชี = update(actorId, id, { is_active: false })
 */
async function update(actorId, id, changes) {
  const passwordHash = changes.password ? await bcrypt.hash(changes.password, BCRYPT_COST) : null;

  return withTransaction(async (client) => {
    // ล็อกแถวไว้ กันสองคนแก้บัญชีเดียวกันพร้อมกันแล้ว log ไม่ตรงกับที่เกิดจริง
    const { rows } = await client.query(
      `SELECT ${COLUMNS} ${FROM} WHERE u.user_id = $1 FOR UPDATE OF u, a`,
      [id]
    );
    if (!rows[0]) throw AppError.notFound('ADMIN_NOT_FOUND', 'ไม่พบผู้ดูแลคนนี้');
    const before = toAdmin(rows[0]);

    // เก็บเฉพาะช่องที่ค่าเปลี่ยนจริง
    const sets = [];
    const params = [];
    const notes = [];
    for (const field of USER_FIELDS) {
      if (changes[field] === undefined || changes[field] === before[field]) continue;
      params.push(changes[field]);
      sets.push(`${field} = $${params.length}`);
      if (FIELD_LABELS[field]) notes.push(FIELD_LABELS[field]);
    }
    if (passwordHash) {
      params.push(passwordHash);
      sets.push(`password_hash = $${params.length}`);
      notes.push('รหัสผ่าน');
    }

    if (sets.length) {
      params.push(id);
      try {
        await client.query(`UPDATE "user" SET ${sets.join(', ')} WHERE user_id = $${params.length}`, params);
      } catch (err) {
        rethrowDuplicate(err);
      }
    }

    const roleChanged = changes.admin_role !== undefined && changes.admin_role !== before.admin_role;
    if (roleChanged) {
      await client.query('UPDATE admin SET admin_role = $1 WHERE user_id = $2', [changes.admin_role, id]);
      notes.push(`ระดับ ${before.admin_role} → ${changes.admin_role}`);
    }

    const activeChanged = changes.is_active !== undefined && changes.is_active !== before.is_active;
    if (activeChanged || notes.length) {
      let actionType = 'update_admin';
      if (activeChanged) actionType = changes.is_active ? 'reactivate_admin' : 'deactivate_admin';
      const note = notes.length ? `แก้: ${notes.join(', ')}` : null;
      await logAction(client, actorId, actionType, id, note);
    }

    return getById(id, client);
  });
}

module.exports = { list, getById, create, update };
