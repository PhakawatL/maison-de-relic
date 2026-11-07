// service ของระบบแนะนำสินค้า (R4)
// ตอนนี้มี "ยอดนิยม" ที่คิดจากตัวเลขในฐานข้อมูลล้วน ๆ (ยังไม่ใช้เวกเตอร์ / embedding)
// ภายหลังจะเพิ่ม: สินค้าที่เกี่ยวข้อง (related) และแนะนำสำหรับคุณ (for-you) ที่ใช้ product.embedding
const { query } = require('../../db/pool');
const AppError = require('../../utils/AppError');
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

// ครึ่งชีวิต (half-life) ของความนิยม หน่วยเป็นวัน
// การซื้อ / การกดถูกใจ เมื่อ 30 วันก่อน มีน้ำหนักเหลือครึ่งเดียว · 60 วัน เหลือ 1/4 · 90 วัน เหลือ 1/8
// ตั้ง 30 วัน เพราะร้านของสะสมร้านเดียวขายไม่ถี่ ถ้าสั้นกว่านี้ (เช่น 7 วัน) อันดับจะสั่นตามออเดอร์ไม่กี่ใบ
const HALF_LIFE_DAYS = 30;

/**
 * สินค้ายอดนิยม — คะแนน 0–100
 *
 *   คะแนน = 100 × ( 0.50 × ยอดขาย' + 0.25 × ถูกใจ' + 0.25 × รีวิว' )   (' = ทำให้อยู่ในช่วง 0–1 แล้ว)
 *
 * 0) น้ำหนักตามเวลา (time decay แบบครึ่งชีวิต)
 *      น้ำหนักของแต่ละการซื้อ / ถูกใจ = 0.5 ^ (อายุเป็นวัน / HALF_LIFE_DAYS)
 *      ยอดขายถ่วงเวลา = Σ (จำนวนชิ้น × น้ำหนัก)  ·  ถูกใจถ่วงเวลา = Σ น้ำหนัก
 *    - ของที่ขายดีเมื่อปีก่อนแต่ตอนนี้เงียบ ไม่ควรค้างอันดับ 1 ตลอดไป → ของที่คนสนใจ "ช่วงนี้" ได้ขึ้นมา
 *    - ใช้เวลาที่มีอยู่แล้วในตาราง: "order".placed_at และ wishlist.added_at (ไม่ต้องเพิ่มคอลัมน์)
 *    - รีวิว "ไม่" ลดตามเวลา: ดาวบอกคุณภาพของตัวสินค้า ของชิ้นเดิมไม่ได้แย่ลงเพราะรีวิวเก่า
 *
 * 1) ยอดขาย' และ ถูกใจ'  (log normalization ของค่าที่ถ่วงเวลาแล้ว)
 *      x' = ln(1 + x) / ln(1 + ค่าสูงสุดของสินค้าที่ขายได้ทั้งหมด)
 *    - หารด้วยค่าสูงสุด → ได้ 0–1 ทุกตัว เอามาบวกกันได้ (เดิมยอดขายเป็นหลักร้อย แต่ดาวมีแค่ 0–5 หน่วยไม่เท่ากัน)
 *    - ln = ผลตอบแทนลดลง: ขายชิ้นที่ 1→2 มีความหมายมากกว่า 50→51 ชิ้นขายดีชิ้นเดียวจึงไม่กดชิ้นอื่นจนเหลือ 0
 *    - 1 + x กัน ln(0) และทำให้ยอด 0 ได้ 0 พอดี
 *
 * 2) รีวิว'  (Bayesian average แล้วแปลง 1–5 ดาว เป็น 0–1)
 *      ดาวที่ปรับแล้ว = (C × m + ผลรวมดาว) / (C + จำนวนรีวิว)     C = PRIOR_REVIEWS, m = ดาวเฉลี่ยทั้งร้าน
 *      รีวิว' = (ดาวที่ปรับแล้ว − 1) / 4
 *    - รีวิวเดียว 5 ดาว ไม่ชนะของที่ได้ 4.8 จาก 4 รีวิว
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
              COALESCE(sold.qty, 0)::int          AS sold,
              COALESCE(sold.weighted, 0)::float8  AS weighted_sold,
              COALESCE(wl.cnt, 0)::int            AS wishlist_count,
              COALESCE(wl.weighted, 0)::float8    AS weighted_wishlist,
              COALESCE(rs.total, 0)::float8       AS rating_sum
         ${FROM_JOINS}
         -- LATERAL = คำนวณแยกทีละสินค้า ได้ผลแถวเดียวเสมอ (ถ้า JOIN ตรง ๆ แถวจะคูณกันแล้ว SUM ผิด)
         -- อายุเป็นวัน = (NOW() − เวลา) เป็นวินาที ÷ 86400 · GREATEST(…, 0) กันเวลาในอนาคต (นาฬิกาเพี้ยน) ได้น้ำหนักเกิน 1
         LEFT JOIN LATERAL (
           SELECT SUM(oi.quantity) AS qty,
                  SUM(oi.quantity * POWER(0.5,
                        GREATEST(EXTRACT(EPOCH FROM NOW() - o.placed_at), 0) / 86400 / $6::float8)) AS weighted
             FROM order_item oi
             JOIN "order" o ON o.order_id = oi.order_id
            WHERE oi.product_id = p.product_id
              AND o.current_status NOT IN ('cancelled', 'refunded')
         ) sold ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS cnt,
                  SUM(POWER(0.5, GREATEST(EXTRACT(EPOCH FROM NOW() - w.added_at), 0) / 86400 / $6::float8)) AS weighted
             FROM wishlist w
            WHERE w.product_id = p.product_id
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
              COALESCE(LN(1 + weighted_sold) / NULLIF(MAX(LN(1 + weighted_sold)) OVER (), 0), 0) AS sales_part,
              COALESCE(LN(1 + weighted_wishlist) / NULLIF(MAX(LN(1 + weighted_wishlist)) OVER (), 0), 0) AS wishlist_part,
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
    [limit, PRIOR_REVIEWS, WEIGHTS.sales, WEIGHTS.wishlist, WEIGHTS.rating, HALF_LIFE_DAYS]
  );

  const round = (n, digits) => Number(Number(n).toFixed(digits));
  // ส่งตัวเลขที่ใช้คิดคะแนนไปด้วย ไว้อธิบาย/ตรวจได้ว่าทำไมชิ้นนี้ติดอันดับ
  return rows.map((row) => ({
    ...toSummary(row),
    popularity: {
      score: round(row.score, 1),                       // 0–100
      sold: row.sold,                                   // ขายได้ทั้งหมด (ไม่ถ่วงเวลา)
      wishlist: row.wishlist_count,                     // คนกดถูกใจทั้งหมด (ไม่ถ่วงเวลา)
      weighted_sold: round(row.weighted_sold, 2),       // ยอดขายหลังถ่วงเวลา (ของเก่าน้ำหนักลดลง)
      weighted_wishlist: round(row.weighted_wishlist, 2),
      adjusted_rating: round(row.adjusted_rating, 2),   // ดาวหลังปรับแบบ Bayesian (1–5)
      parts: {                                          // แต่ละส่วนหลัง normalize (0–1) ก่อนคูณน้ำหนัก
        sales: round(row.sales_part, 3),
        wishlist: round(row.wishlist_part, 3),
        rating: round(row.rating_part, 3),
      },
    },
  }));
}

/**
 * สินค้าที่เกี่ยวข้อง — 8 ชิ้นที่ "ความหมายใกล้" สินค้านี้ที่สุด (ใช้ product.embedding)
 *   - ระยะห่างใช้ <=> ของ pgvector = cosine distance (ยิ่งน้อยยิ่งใกล้ · similarity = 1 − distance)
 *   - ตัดตัวเอง และตัดของที่ขายไม่ได้ (ไม่ available หรือของหมด) เหมือนทุกที่ในร้าน
 *   - สินค้าตั้งต้นไม่มี / ไม่ได้วางขาย → 404 (เหมือน GET /products/:id)
 *   - สินค้าตั้งต้นยังไม่มีเวกเตอร์ → [] (หน้าเว็บแค่ไม่โชว์แถวนี้ ไม่ใช่ error)
 */
async function related({ productId, limit }) {
  const source = await query(
    `SELECT embedding IS NOT NULL AS has_embedding
       FROM product
      WHERE product_id = $1 AND status = 'available'`,
    [productId]
  );
  if (!source.rows[0]) throw AppError.notFound('PRODUCT_NOT_FOUND', 'ไม่พบสินค้านี้');
  if (!source.rows[0].has_embedding) return [];

  const { rows } = await query(
    `SELECT ${SUMMARY_COLUMNS},
            p.embedding <=> src.embedding AS distance
       ${FROM_JOINS}
       -- src = เวกเตอร์ของสินค้าตั้งต้น (แถวเดียว) เอามาต่อท้ายทุกแถวเพื่อวัดระยะ
       CROSS JOIN (SELECT embedding FROM product WHERE product_id = $1) src
      WHERE p.product_id <> $1
        AND p.status = 'available' AND p.stock_quantity > 0
        AND p.embedding IS NOT NULL
      ORDER BY distance, p.product_id
      LIMIT $2`,
    [productId, limit]
  );
  // similarity ไว้ debug / อธิบายว่าทำไมขึ้นมา (1 = เหมือนกันเป๊ะ)
  return rows.map((row) => ({
    ...toSummary(row),
    similarity: Number((1 - Number(row.distance)).toFixed(3)),
  }));
}

module.exports = { popular, related, WEIGHTS, PRIOR_REVIEWS, HALF_LIFE_DAYS };