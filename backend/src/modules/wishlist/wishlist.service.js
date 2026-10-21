// service ของ wishlist (R1 · S6 · BR-12, BR-13) — SQL ทั้งหมดของตาราง wishlist อยู่ที่นี่
//
// wishlist = ตาราง M:N ระหว่าง "user" กับ product มี PK (user_id, product_id)
//   → สินค้าชิ้นเดียวกันอยู่ใน wishlist ของคนเดียวกันได้ครั้งเดียว ฐานข้อมูลกันซ้ำให้เอง
//
// กติกา:
//   * ทุกฟังก์ชันรับ userId จาก token (req.user) เสมอ ผู้ใช้จึงเห็นและแก้ได้แค่ wishlist ของตัวเอง
//   * เพิ่มได้เฉพาะสินค้าที่วางขายอยู่ (status = 'available') เหมือนที่หน้าร้านเห็น
//   * สินค้าที่ถูกซ่อน / กลับเป็น draft ทีหลัง แถวใน wishlist ยังอยู่ แต่ไม่แสดงในรายการ
//     (ถ้าแอดมินเปิดขายอีกครั้ง จะกลับมาแสดงเอง)
//   * สินค้าที่ของหมด (stock_quantity = 0) ยังแสดงอยู่ หน้าเว็บดูได้จาก in_stock
const { query } = require('../../db/pool');
const { SUMMARY_COLUMNS, FROM_JOINS, toSummary } = require('../products/products.service');

/** รายการสินค้าใน wishlist ของผู้ใช้ (กดถูกใจล่าสุดขึ้นก่อน) */
async function listForUser(userId) {
  const { rows } = await query(
    `SELECT ${SUMMARY_COLUMNS}, w.added_at
       FROM wishlist w
       JOIN product p     ON p.product_id  = w.product_id
       JOIN category c    ON c.category_id = p.category_id
       LEFT JOIN series s ON s.series_id   = p.series_id
      WHERE w.user_id = $1 AND p.status = 'available'
      ORDER BY w.added_at DESC, p.product_id DESC`,
    [userId]
  );
  return rows.map((row) => ({ ...toSummary(row), added_at: row.added_at }));
}

/**
 * รหัสสินค้าทั้งหมดใน wishlist (เฉพาะที่วางขายอยู่) — หน้าเว็บใช้ระบายสีปุ่มหัวใจในการ์ดสินค้า
 * ส่งแค่ตัวเลขเพราะเบากว่าการโหลดสินค้าทั้งชิ้น
 */
async function listIds(userId) {
  const { rows } = await query(
    `SELECT w.product_id
       FROM wishlist w
       JOIN product p ON p.product_id = w.product_id
      WHERE w.user_id = $1 AND p.status = 'available'
      ORDER BY w.added_at DESC, w.product_id DESC`,
    [userId]
  );
  return rows.map((row) => Number(row.product_id));
}

/**
 * เพิ่มสินค้าเข้า wishlist
 *   คืน { item, created }
 *     item    = สินค้าแบบเดียวกับในรายการ (มี added_at)
 *     created = true ถ้าเพิ่งเพิ่ม, false ถ้ามีอยู่แล้ว (กดซ้ำไม่ error และ added_at ไม่เปลี่ยน)
 *   คืน null ถ้าไม่มีสินค้านี้ หรือยังไม่ได้วางขาย
 *
 * ใช้ SQL คำสั่งเดียว (INSERT ... SELECT) ตรวจว่าสินค้าวางขายอยู่และเพิ่มไปพร้อมกัน
 * ON CONFLICT DO NOTHING = ถ้ามีแถวนี้อยู่แล้ว (กดสองแท็บพร้อมกัน) ก็ไม่เพิ่มซ้ำและไม่ error
 */
async function add(userId, productId) {
  const { rows: product } = await query(
    `SELECT ${SUMMARY_COLUMNS} ${FROM_JOINS}
      WHERE p.product_id = $1 AND p.status = 'available'`,
    [productId]
  );
  if (!product[0]) return null;

  const inserted = await query(
    `INSERT INTO wishlist (user_id, product_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, product_id) DO NOTHING
     RETURNING added_at`,
    [userId, productId]
  );

  let addedAt;
  if (inserted.rows[0]) {
    addedAt = inserted.rows[0].added_at;
  } else {
    const existing = await query(
      'SELECT added_at FROM wishlist WHERE user_id = $1 AND product_id = $2',
      [userId, productId]
    );
    addedAt = existing.rows[0].added_at;
  }

  return {
    item: { ...toSummary(product[0]), added_at: addedAt },
    created: inserted.rowCount > 0,
  };
}

/**
 * เอาสินค้าออกจาก wishlist — คืน true ถ้ามีแถวถูกลบ, false ถ้าไม่ได้อยู่ใน wishlist อยู่แล้ว
 * (ลบได้แม้สินค้าจะถูกซ่อนไปแล้ว ผู้ใช้จะได้ล้างรายการของตัวเองได้เสมอ)
 */
async function remove(userId, productId) {
  const { rowCount } = await query(
    'DELETE FROM wishlist WHERE user_id = $1 AND product_id = $2',
    [userId, productId]
  );
  return rowCount > 0;
}

module.exports = { listForUser, listIds, add, remove };
