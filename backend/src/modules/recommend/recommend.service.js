// service ของระบบแนะนำสินค้า (R4)
// ตอนนี้มี "ยอดนิยม" ที่คิดจากตัวเลขในฐานข้อมูลล้วน ๆ (ยังไม่ใช้เวกเตอร์ / embedding)
// ภายหลังจะเพิ่ม: สินค้าที่เกี่ยวข้อง (related) และแนะนำสำหรับคุณ (for-you) ที่ใช้ product.embedding
const { query } = require('../../db/pool');
// ใช้คอลัมน์และรูปข้อมูลชุดเดียวกับรายการสินค้าของ R3 → หน้าเว็บวาดการ์ดสินค้าด้วยโค้ดเดิมได้เลย
const { SUMMARY_COLUMNS, FROM_JOINS, toSummary } = require('../products/products.service');

/**
 * สินค้ายอดนิยม — คะแนน = จำนวนชิ้นที่ขายได้ + จำนวนคนที่กดถูกใจ + คะแนนรีวิวเฉลี่ย (0–5)
 *
 *   sold      = SUM(order_item.quantity) เฉพาะออเดอร์ที่ไม่ถูกยกเลิก/คืนเงิน
 *   wishlist  = COUNT(wishlist) จำนวนคนที่เก็บสินค้านี้ไว้
 *   avg_rating= AVG(review.rating) ยังไม่มีรีวิวนับเป็น 0 (rv มาจาก FROM_JOINS ของ R3)
 *
 * แสดงเฉพาะสินค้าที่ "ขายได้" = status 'available' และ stock > 0
 * คะแนนเท่ากัน → ดูยอดเข้าชม (view_count) → ของใหม่ก่อน
 */
async function popular({ limit }) {
  const { rows } = await query(
    `SELECT ${SUMMARY_COLUMNS},
            COALESCE(sold.qty, 0)::int AS sold,
            COALESCE(wl.cnt, 0)::int   AS wishlist_count,
            COALESCE(sold.qty, 0) + COALESCE(wl.cnt, 0) + COALESCE(rv.avg_rating, 0) AS score
       ${FROM_JOINS}
       -- LATERAL = คำนวณแยกทีละสินค้า ได้ผลแถวเดียวเสมอ (เหมือน rv ของ R3) จำนวนแถวสินค้าไม่เพิ่ม
       LEFT JOIN LATERAL (
         SELECT SUM(oi.quantity) AS qty
           FROM order_item oi
           JOIN "order" o ON o.order_id = oi.order_id
          WHERE oi.product_id = p.product_id
            AND o.current_status NOT IN ('cancelled', 'refunded')
       ) sold ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS cnt FROM wishlist w WHERE w.product_id = p.product_id
       ) wl ON TRUE
      WHERE p.status = 'available' AND p.stock_quantity > 0
      ORDER BY score DESC, p.view_count DESC, p.created_at DESC, p.product_id DESC
      LIMIT $1`,
    [limit]
  );
  // ส่งตัวเลขที่ใช้คิดคะแนนไปด้วย ไว้อธิบาย/ตรวจได้ว่าทำไมชิ้นนี้ติดอันดับ
  return rows.map((row) => ({
    ...toSummary(row),
    popularity: {
      score: Number(row.score),
      sold: row.sold,
      wishlist: row.wishlist_count,
    },
  }));
}

module.exports = { popular };
