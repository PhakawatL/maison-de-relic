// service ของ event พฤติกรรมผู้ใช้ (R4) — บันทึกลงตาราง user_event ไว้ทำระบบแนะนำสินค้า
// ไม่รู้จัก req/res เลย รับค่าที่ตรวจแล้วจาก controller มาเขียนลงฐานข้อมูลอย่างเดียว
const { withTransaction } = require('../../db/pool');
const AppError = require('../../utils/AppError');

// ต้องตรงกับ CHECK ของ user_event.event_type ใน db/migrations/001_init.sql
// และ EVENT_TYPES ใน frontend/js/events.js (R1)
const EVENT_TYPES = ['view', 'click', 'wishlist', 'add_to_cart', 'purchase'];

/**
 * บันทึก event หนึ่งครั้ง
 * userId = null ได้ (ผู้ใช้ยังไม่ล็อกอิน) → ระบบแนะนำยังรู้พฤติกรรมผ่าน sessionId
 * ไม่พบสินค้า → 404 PRODUCT_NOT_FOUND
 */
async function record({ productId, eventType, sessionId, userId = null }) {
  // ใช้ transaction เพราะ event "view" แก้ 2 ตาราง (user_event + product.view_count) ต้องสำเร็จพร้อมกัน
  return withTransaction(async (client) => {
    // เช็กก่อนว่ามีสินค้านี้ไหม (ถ้าไม่เช็ก INSERT จะพังที่ foreign key แล้วได้ 500 แทน 404)
    // ไม่ดู status: สินค้าที่เพิ่งถูกซ่อนก็ยังบันทึกได้ (เช่นกดหัวใจไว้ก่อนแอดมินซ่อน)
    const found = await client.query('SELECT 1 FROM product WHERE product_id = $1', [productId]);
    if (found.rowCount === 0) throw AppError.notFound('PRODUCT_NOT_FOUND', 'ไม่พบสินค้านี้');

    const { rows } = await client.query(
      `INSERT INTO user_event (user_id, product_id, session_id, event_type)
       VALUES ($1, $2, $3, $4)
       RETURNING event_id, product_id, event_type, created_at`,
      [userId, productId, sessionId, eventType]
    );

    // เปิดหน้า Detail = ยอดเข้าชมของสินค้า +1 (คอลัมน์ view_count ของตาราง product มีอยู่แล้วแต่ยังไม่มีใครนับ)
    if (eventType === 'view') {
      await client.query('UPDATE product SET view_count = view_count + 1 WHERE product_id = $1', [productId]);
    }

    const row = rows[0];
    return {
      event_id: Number(row.event_id), // BIGSERIAL ได้มาเป็น string → แปลงเป็นตัวเลข
      product_id: Number(row.product_id),
      event_type: row.event_type,
      created_at: row.created_at,
    };
  });
}

module.exports = { record, EVENT_TYPES };
