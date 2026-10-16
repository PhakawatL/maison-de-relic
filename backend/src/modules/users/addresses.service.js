// service ที่อยู่จัดส่ง (R2 · BR-03) — SQL ทั้งหมดของ address อยู่ที่นี่
//
// กติกาที่อยู่หลัก (is_default):
//   * มีได้คนละหนึ่งที่ (partial unique index ในฐานข้อมูลกันไว้อีกชั้น)
//   * ที่อยู่แรกของแต่ละคนเป็นที่อยู่หลักให้อัตโนมัติ
//   * ตั้งที่อยู่ไหนเป็นหลัก → อันเดิมถูกยกเลิกให้เองใน transaction เดียวกัน
//   * ลบที่อยู่หลัก → ที่อยู่ที่เพิ่มล่าสุดที่เหลืออยู่กลายเป็นหลักแทน
//
// สำหรับ R5 (checkout) — ตรวจว่าที่อยู่เป็นของผู้ซื้อ แล้วคัดลอกลงออเดอร์ (BR-18):
//   const addresses = require('../users/addresses.service');
//   const address = await addresses.getForUser(req.user.user_id, addressId, client);
//   if (!address) throw AppError.notFound('ADDRESS_NOT_FOUND', 'ไม่พบที่อยู่นี้');
//   const ship = addresses.toShippingSnapshot(address); // { ship_name, ship_phone, ... }
const { query, withTransaction } = require('../../db/pool');

const COLUMNS = `address_id, label, recipient_name, phone, line1, district, province, postcode, is_default`;

// ช่องที่แก้ได้ (ชื่อช่องมาจากโค้ดเราเอง ไม่ได้มาจากผู้ใช้)
const EDITABLE = ['label', 'recipient_name', 'phone', 'line1', 'district', 'province', 'postcode'];

function toAddress(row) {
  return {
    address_id: Number(row.address_id),
    label: row.label,
    recipient_name: row.recipient_name,
    phone: row.phone,
    line1: row.line1,
    district: row.district,
    province: row.province,
    postcode: row.postcode,
    is_default: row.is_default,
  };
}

/** แปลงที่อยู่เป็นคอลัมน์ ship_* ของตาราง "order" (สำเนา ณ เวลาสั่ง แก้ที่อยู่ทีหลังออเดอร์ไม่เปลี่ยน) */
function toShippingSnapshot(address) {
  return {
    ship_name: address.recipient_name,
    ship_phone: address.phone,
    ship_line1: address.line1,
    ship_district: address.district,
    ship_province: address.province,
    ship_postcode: address.postcode,
  };
}

/**
 * ล็อกแถวผู้ใช้ไว้จนจบ transaction — การเพิ่ม / แก้ / ลบที่อยู่ของคนเดียวกันจะทำทีละคำขอ
 * กันกรณีกดพร้อมกันสองแท็บแล้วได้ที่อยู่หลักสองที่ หรือไม่มีที่อยู่หลักเลย
 */
async function lockUser(client, userId) {
  await client.query('SELECT 1 FROM "user" WHERE user_id = $1 FOR UPDATE', [userId]);
}

async function clearDefault(client, userId) {
  await client.query('UPDATE address SET is_default = FALSE WHERE user_id = $1 AND is_default', [userId]);
}

/** ที่อยู่ทั้งหมดของผู้ใช้ — ที่อยู่หลักก่อน แล้วตามด้วยที่เพิ่มล่าสุด */
async function listForUser(userId) {
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM address WHERE user_id = $1 ORDER BY is_default DESC, address_id DESC`,
    [userId]
  );
  return rows.map(toAddress);
}

/** ที่อยู่ 1 ที่ ถ้าเป็นของผู้ใช้คนนี้ ไม่ใช่ของเขา/ไม่มี → null · ส่ง client มาได้ถ้าอยู่ใน transaction */
async function getForUser(userId, addressId, db = { query }) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM address WHERE address_id = $1 AND user_id = $2`,
    [addressId, userId]
  );
  return rows[0] ? toAddress(rows[0]) : null;
}

async function create(userId, data) {
  return withTransaction(async (client) => {
    await lockUser(client, userId);
    const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM address WHERE user_id = $1', [userId]);
    const isFirst = rows[0].n === 0;
    const isDefault = isFirst || data.is_default === true;
    if (isDefault && !isFirst) await clearDefault(client, userId);

    const inserted = await client.query(
      `INSERT INTO address (user_id, label, recipient_name, phone, line1, district, province, postcode, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${COLUMNS}`,
      [userId, data.label ?? null, data.recipient_name, data.phone, data.line1, data.district, data.province, data.postcode, isDefault]
    );
    return toAddress(inserted.rows[0]);
  });
}

/** แก้ที่อยู่ของตัวเอง — ไม่พบ / ไม่ใช่ของเขา → null */
async function update(userId, addressId, changes) {
  return withTransaction(async (client) => {
    await lockUser(client, userId);
    const current = await getForUser(userId, addressId, client);
    if (!current) return null;

    if (changes.is_default === true && !current.is_default) await clearDefault(client, userId);

    const sets = [];
    const params = [];
    for (const field of EDITABLE) {
      if (changes[field] === undefined) continue;
      params.push(changes[field]);
      sets.push(`${field} = $${params.length}`);
    }
    if (changes.is_default === true) sets.push('is_default = TRUE');

    params.push(addressId);
    const { rows } = await client.query(
      `UPDATE address SET ${sets.join(', ')} WHERE address_id = $${params.length} RETURNING ${COLUMNS}`,
      params
    );
    return toAddress(rows[0]);
  });
}

/**
 * ลบที่อยู่ของตัวเอง — ไม่พบ / ไม่ใช่ของเขา → false
 * ออเดอร์เก่าที่เคยใช้ที่อยู่นี้ไม่กระทบ: order.address_id กลายเป็น NULL แต่ ship_* ที่คัดลอกไว้ยังอยู่
 */
async function remove(userId, addressId) {
  return withTransaction(async (client) => {
    await lockUser(client, userId);
    const { rows } = await client.query(
      'DELETE FROM address WHERE address_id = $1 AND user_id = $2 RETURNING is_default',
      [addressId, userId]
    );
    if (!rows[0]) return false;

    if (rows[0].is_default) {
      await client.query(
        `UPDATE address SET is_default = TRUE
          WHERE address_id = (SELECT address_id FROM address WHERE user_id = $1 ORDER BY address_id DESC LIMIT 1)`,
        [userId]
      );
    }
    return true;
  });
}

module.exports = { listForUser, getForUser, create, update, remove, toShippingSnapshot };
