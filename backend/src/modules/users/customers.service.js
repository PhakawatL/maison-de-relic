// service จัดการบัญชีลูกค้า (R2) — SQL ทั้งหมดของหน้า admin/customers อยู่ที่นี่
// ลูกค้า = แถวใน "user" ที่ไม่มีแถวคู่กันในตาราง admin (BR-30)
// ทุกการแก้ / ปิด / เปิดบัญชี บันทึกลง admin_action_log ใน transaction เดียวกัน (BR-31)
const { query, withTransaction } = require('../../db/pool');
const AppError = require('../../utils/AppError');
const { rethrowDuplicate } = require('./account.validation');

const COLUMNS = `
  u.user_id, u.username, u.email, u.first_name, u.last_name, u.display_name, u.phone,
  u.is_email_verified, u.is_active, u.created_at`;

const FROM = `
  FROM "user" u
  WHERE NOT EXISTS (SELECT 1 FROM admin a WHERE a.user_id = u.user_id)`;

// ช่องในตาราง "user" ที่แก้ผ่านหน้านี้ได้ (ชื่อช่องมาจากโค้ดเราเอง ไม่ได้มาจากผู้ใช้)
const USER_FIELDS = ['email', 'first_name', 'last_name', 'display_name', 'phone', 'is_active'];

const FIELD_LABELS = {
  email: 'อีเมล',
  first_name: 'ชื่อ',
  last_name: 'นามสกุล',
  display_name: 'ชื่อที่แสดง',
  phone: 'เบอร์โทร',
};

function toCustomer(row) {
  return {
    user_id: Number(row.user_id),
    username: row.username,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    display_name: row.display_name,
    phone: row.phone,
    is_email_verified: row.is_email_verified,
    is_active: row.is_active,
    created_at: row.created_at,
  };
}

/**
 * รายชื่อลูกค้าแบบแบ่งหน้า
 * filters: { q, status: 'all' | 'active' | 'inactive', page, pageSize }
 * เรียง: ที่ใช้งานอยู่ก่อน → สมัครล่าสุดก่อน
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

  const whereSql = where.map((w) => ` AND ${w}`).join('');
  const countResult = await query(`SELECT COUNT(*)::int AS total ${FROM} ${whereSql}`, params);

  const limit = add(pageSize);
  const offset = add((page - 1) * pageSize);
  const { rows } = await query(
    `SELECT ${COLUMNS} ${FROM} ${whereSql}
      ORDER BY u.is_active DESC, u.created_at DESC, u.user_id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  return { items: rows.map(toCustomer), total: countResult.rows[0].total };
}

async function getById(id, db = { query }) {
  const { rows } = await db.query(`SELECT ${COLUMNS} ${FROM} AND u.user_id = $1`, [id]);
  return rows[0] ? toCustomer(rows[0]) : null;
}

/**
 * แก้ข้อมูลลูกค้า — changes มีเฉพาะช่องที่จะแก้
 *   { email, first_name, last_name, display_name, phone, is_active }
 * ปิดบัญชี = update(actorId, id, { is_active: false })
 * ไม่มีการตั้งรหัสผ่านให้ลูกค้า ลูกค้าใช้ "ลืมรหัสผ่าน" เอง
 */
async function update(actorId, id, changes) {
  return withTransaction(async (client) => {
    // ล็อกแถวไว้ กันสองคนแก้บัญชีเดียวกันพร้อมกันแล้ว log ไม่ตรงกับที่เกิดจริง
    const { rows } = await client.query(`SELECT ${COLUMNS} ${FROM} AND u.user_id = $1 FOR UPDATE OF u`, [id]);
    if (!rows[0]) throw AppError.notFound('CUSTOMER_NOT_FOUND', 'ไม่พบลูกค้าคนนี้');
    const before = toCustomer(rows[0]);

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
    // เปลี่ยนอีเมล = อีเมลใหม่ยังไม่ได้ยืนยัน
    if (notes.includes(FIELD_LABELS.email)) sets.push('is_email_verified = FALSE');

    if (sets.length) {
      params.push(id);
      try {
        await client.query(`UPDATE "user" SET ${sets.join(', ')} WHERE user_id = $${params.length}`, params);
      } catch (err) {
        rethrowDuplicate(err);
      }
    }

    const activeChanged = changes.is_active !== undefined && changes.is_active !== before.is_active;
    if (activeChanged || notes.length) {
      let actionType = 'update_user';
      if (activeChanged) actionType = changes.is_active ? 'reactivate_user' : 'deactivate_user';
      const note = notes.length ? `แก้: ${notes.join(', ')}` : null;
      await client.query(
        `INSERT INTO admin_action_log (admin_id, action_type, target_type, target_id, note)
         VALUES ($1, $2, 'user', $3, $4)`,
        [actorId, actionType, id, note]
      );
    }

    return getById(id, client);
  });
}

module.exports = { list, getById, update };
