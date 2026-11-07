// service ของระบบแนะนำสินค้า (R4)
// ตอนนี้มี "ยอดนิยม" ที่คิดจากตัวเลขในฐานข้อมูลล้วน ๆ (ยังไม่ใช้เวกเตอร์ / embedding)
// ภายหลังจะเพิ่ม: สินค้าที่เกี่ยวข้อง (related) และแนะนำสำหรับคุณ (for-you) ที่ใช้ product.embedding
const { query } = require('../../db/pool');
// ใช้คอลัมน์และรูปข้อมูลชุดเดียวกับรายการสินค้าของ R3 → หน้าเว็บวาดการ์ดสินค้าด้วยโค้ดเดิมได้เลย
const { SUMMARY_COLUMNS, FROM_JOINS, toSummary } = require('../products/products.service');

// ---------- น้ำหนักของสูตรยอดนิยม (รวมกันได้ 1 → คะแนนเต็ม 100) ----------
// ยอดขาย : ถูกใจ = 2 : 1 ตรงกับน้ำหนัก event ที่ "แนะนำสำหรับคุณ" ใช้ (purchase 6 · wishlist 3)
// เพราะการจ่ายเงินจริงเป็นสัญญาณที่หนักแน่นกว่าการกดเก็บไว้เฉย ๆ
// รีวิว 25% = สัญญาณ "คุณภาพ" ไม่ใช่ "ปริมาณ" กันไม่ให้ของขายดีแต่คนบ่นติดอันดับต้นง่าย ๆ
const WEIGHTS = { sales: 0.5, wishlist: 0.25, rating: 0.25 };

// จำนวนรีวิวสมมติที่ "ค่าเฉลี่ยทั้งร้าน" ใส่ให้ทุกสินค้า (Bayesian average)
// สินค้ารีวิวน้อย → คะแนนถูกดึงเข้าหาค่าเฉลี่ยร้าน · รีวิวเยอะ → ใช้คะแนนของตัวเองเป็นหลัก
// ตั้ง 3 เพราะร้านเล็ก สินค้าที่มีรีวิวส่วนใหญ่มี 1–4 รีวิว
const PRIOR_REVIEWS = 3;

/**
 * สินค้ายอดนิยม — คะแนน 0–100
 *
 *   คะแนน = 100 × ( 0.50 × ยอดขาย' + 0.25 × ถูกใจ' + 0.25 × รีวิว' )   (' = ทำให้อยู่ในช่วง 0–1 แล้ว)
 *
 * 1) ยอดขาย' และ ถูกใจ'  (log normalization)
 *      x' = ln(1 + x) / ln(1 + ค่าสูงสุดของสินค้าที่ขายได้ทั้งหมด)
 *    - หารด้วยค่าสูงสุด → ได้ 0–1 ทุกตัว เอามาบวกกันได้ (เดิมยอดขายเป็นหลักร้อย แต่ดาวมีแค่ 0–5 หน่วยไม่เท่ากัน)
 *    - ln = ผลตอบแทนลดลง: ขายชิ้นที่ 1→2 มีความหมายมากกว่า 50→51 ชิ้นขายดีชิ้นเดียวจึงไม่กดชิ้นอื่นจนเหลือ 0
 *    - 1 + x กัน ln(0) และทำให้ยอด 0 ได้ 0 พอดี
 *
 * 2) รีวิว'  (Bayesian average แล้วแปลง 1–5 ดาว เป็น 0–1)
 *      ดาวที่ปรับแล้ว = (C × m + ผลรวมดาว) / (C + จำนวนรีวิว)     C = PRIOR_REVIEWS, m = ดาวเฉลี่ยทั้งร้าน
 *      รีวิว' = (ดาวที่ปรับแล้ว − 1) / 4
 *    - แก้ปัญหาเดิม: รีวิวเดียว 5 ดาว ไม่ชนะของที่ได้ 4.8 จาก 4 รีวิวอีกต่อไป
 *    - ยังไม่มีรีวิว = ได้ดาวเท่าค่าเฉลี่ยร้าน (เป็นกลาง ไม่ได้เปรียบ ไม่เสียเปรียบ)
 *
 * sold นับเฉพาะออเดอร์ที่ไม่ถูกยกเลิก / คืนเงิน · แสดงเฉพาะสินค้าที่ขายได้ (available และ stock > 0)
 * คะแนนเท่ากัน → ยอดเข้าชม (view_count) → ของใหม่ก่อน
 */
async function popular({ limit }) {
  const { rows } = await query(
    `WITH shop AS (
       -- ดาวเฉลี่ยทั้งร้าน (m) · ร้านยังไม่มีรีวิวเลย ใช้ 3 ดาว (กลาง ๆ)
       SELECT COALESCE(AVG(rating), 3)::float8 AS m FROM review
     ),
     stats AS (
       SELECT ${SUMMARY_COLUMNS}, p.view_count,
              COALESCE(sold.qty, 0)::int       AS sold,
              COALESCE(wl.cnt, 0)::int         AS wishlist_count,
              COALESCE(rs.total, 0)::float8    AS rating_sum
         ${FROM_JOINS}
         -- LATERAL = คำนวณแยกทีละสินค้า ได้ผลแถวเดียวเสมอ (ถ้า JOIN ตรง ๆ แถวจะคูณกันแล้ว SUM ผิด)
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
         -- ผลรวมดาวแบบไม่ปัด (avg_rating ของ R3 ปัดเป็นทศนิยม 1 ตำแหน่ง ใช้คำนวณต่อไม่แม่น)
         LEFT JOIN LATERAL (
           SELECT SUM(r.rating) AS total FROM review r WHERE r.product_id = p.product_id
         ) rs ON TRUE
        WHERE p.status = 'available' AND p.stock_quantity > 0
     ),
     parts AS (
       SELECT stats.*,
              -- MAX(...) OVER () = ค่าสูงสุดของทุกแถว (window function) · NULLIF กันหารด้วย 0 ตอนยังไม่มีใครซื้อ
              COALESCE(LN(1 + sold) / NULLIF(MAX(LN(1 + sold)) OVER (), 0), 0) AS sales_part,
              COALESCE(LN(1 + wishlist_count) / NULLIF(MAX(LN(1 + wishlist_count)) OVER (), 0), 0) AS wishlist_part,
              -- ::float8 บอกชนิดของพารามิเตอร์ให้ชัด (ตัวเลขทศนิยม) ไม่ให้ Postgres เดาเป็นจำนวนเต็ม
              (shop.m * $2::float8 + rating_sum) / ($2::float8 + review_count) AS adjusted_rating
         FROM stats CROSS JOIN shop
     )
     SELECT parts.*,
            (adjusted_rating - 1) / 4 AS rating_part,
            100 * ($3::float8 * sales_part + $4::float8 * wishlist_part + $5::float8 * (adjusted_rating - 1) / 4) AS score
       FROM parts
      ORDER BY score DESC, view_count DESC, created_at DESC, product_id DESC
      LIMIT $1`,
    [limit, PRIOR_REVIEWS, WEIGHTS.sales, WEIGHTS.wishlist, WEIGHTS.rating]
  );

  const round = (n, digits) => Number(Number(n).toFixed(digits));
  // ส่งตัวเลขที่ใช้คิดคะแนนไปด้วย ไว้อธิบาย/ตรวจได้ว่าทำไมชิ้นนี้ติดอันดับ
  return rows.map((row) => ({
    ...toSummary(row),
    popularity: {
      score: round(row.score, 1),                    // 0–100
      sold: row.sold,
      wishlist: row.wishlist_count,
      adjusted_rating: round(row.adjusted_rating, 2), // ดาวหลังปรับแบบ Bayesian (1–5)
      parts: {                                       // แต่ละส่วนหลัง normalize (0–1) ก่อนคูณน้ำหนัก
        sales: round(row.sales_part, 3),
        wishlist: round(row.wishlist_part, 3),
        rating: round(row.rating_part, 3),
      },
    },
  }));
}

module.exports = { popular, WEIGHTS, PRIOR_REVIEWS };
