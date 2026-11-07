// service ของรีวิวสินค้า (R1 · S11 · BR-25, BR-26 · ตาราง review)
//
// กติกา:
//   * รีวิว 1 รายการ = สินค้า 1 รายการในคำสั่งซื้อ (order_item) — UNIQUE ในฐานข้อมูล จึงรีวิวซ้ำไม่ได้
//   * รีวิวได้เฉพาะคำสั่งซื้อของตัวเองที่ได้รับสินค้าแล้ว (current_status = delivered หรือ completed)
//     (ข้อ 4 ท้ายไฟล์ 001_init.sql: "รีวิวได้เฉพาะออเดอร์ที่ส่งถึงแล้ว" — DDL บังคับไม่ได้ ต้องเช็กในโค้ด)
//   * review.product_id เป็นทางลัดไปหาสินค้า (ตั้งตาม order_item.product_id เสมอ ไม่รับจากหน้าเว็บ)
//   * หน้าร้านแสดงชื่อผู้รีวิวแบบย่อ เช่น "สมชาย ก." ไม่แสดงชื่อผู้ใช้หรืออีเมล
//
// คะแนนเฉลี่ย / จำนวนรีวิวของสินค้าแต่ละชิ้นอยู่ในการ์ดสินค้าแล้ว (avg_rating, review_count ใน products.service.js)
const { query } = require('../../db/pool');
const AppError = require('../../utils/AppError');

const REVIEWABLE_STATUSES = ['delivered', 'completed'];

/** ชื่อผู้รีวิวแบบย่อ: ชื่อจริง + ตัวอักษรแรกของนามสกุล เช่น "สมชาย ก." (ข้ามสระหน้า เ แ โ ใ ไ) */
function shortName(firstName, lastName) {
  const initial = [...String(lastName || '').trim().replace(/^[เแโใไ]+/, '')][0];
  return initial ? `${firstName} ${initial}.` : firstName;
}

function toReview(row) {
  return {
    review_id: Number(row.review_id),
    product_id: Number(row.product_id),
    rating: Number(row.rating),
    comment: row.comment,
    created_at: row.created_at,
    reviewer: shortName(row.first_name, row.last_name),
  };
}

/**
 * เขียนรีวิว — data: { order_item_id, rating, comment }
 *   404 ORDER_ITEM_NOT_FOUND  ไม่ใช่สินค้าในคำสั่งซื้อของตัวเอง
 *   409 ORDER_NOT_DELIVERED   ยังไม่ได้รับสินค้า (หรือคำสั่งซื้อถูกยกเลิก / คืนเงินแล้ว)
 *   409 ALREADY_REVIEWED      รีวิวสินค้ารายการนี้ไปแล้ว
 */
async function create(userId, { order_item_id: orderItemId, rating, comment }) {
  const { rows } = await query(
    `SELECT oi.product_id, o.user_id, o.current_status
       FROM order_item oi
       JOIN "order" o ON o.order_id = oi.order_id
      WHERE oi.order_item_id = $1`,
    [orderItemId]
  );
  const item = rows[0];
  if (!item || Number(item.user_id) !== userId) {
    throw AppError.notFound('ORDER_ITEM_NOT_FOUND', 'ไม่พบสินค้านี้ในคำสั่งซื้อของคุณ');
  }
  if (!REVIEWABLE_STATUSES.includes(item.current_status)) {
    throw AppError.conflict('ORDER_NOT_DELIVERED', 'รีวิวได้หลังจากได้รับสินค้าแล้วเท่านั้น');
  }

  // ON CONFLICT DO NOTHING = กดส่งซ้ำ / ส่งพร้อมกันสองแท็บ ไม่ error 500 แต่ตอบ 409 ให้หน้าเว็บบอกผู้ใช้
  const inserted = await query(
    `INSERT INTO review (order_item_id, product_id, rating, comment)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (order_item_id) DO NOTHING
     RETURNING review_id`,
    [orderItemId, item.product_id, rating, comment ?? null]
  );
  if (!inserted.rows[0]) {
    throw AppError.conflict('ALREADY_REVIEWED', 'คุณรีวิวสินค้ารายการนี้ไปแล้ว');
  }
  return getById(inserted.rows[0].review_id);
}

async function getById(reviewId) {
  const { rows } = await query(
    `SELECT r.*, u.first_name, u.last_name
       FROM review r
       JOIN order_item oi ON oi.order_item_id = r.order_item_id
       JOIN "order" o     ON o.order_id = oi.order_id
       JOIN "user" u      ON u.user_id = o.user_id
      WHERE r.review_id = $1`,
    [reviewId]
  );
  return rows[0] ? toReview(rows[0]) : null;
}

/**
 * รีวิวของสินค้า 1 ชิ้น (ใหม่สุดก่อน) + สรุปคะแนน
 * filters: { rating (1–5 หรือ undefined = ทุกคะแนน), page, pageSize }
 * คืน null ถ้าไม่มีสินค้านี้ หรือยังไม่ได้วางขาย (ตอบ 404 แบบเดียวกับ GET /products/:id)
 */
async function listForProduct(productId, { rating, page, pageSize }) {
  const product = await query(`SELECT 1 FROM product WHERE product_id = $1 AND status = 'available'`, [productId]);
  if (!product.rows[0]) return null;

  const summaryResult = await query(
    `SELECT COUNT(*)::int AS count,
            ROUND(AVG(rating), 1) AS average,
            COUNT(*) FILTER (WHERE rating = 5)::int AS r5,
            COUNT(*) FILTER (WHERE rating = 4)::int AS r4,
            COUNT(*) FILTER (WHERE rating = 3)::int AS r3,
            COUNT(*) FILTER (WHERE rating = 2)::int AS r2,
            COUNT(*) FILTER (WHERE rating = 1)::int AS r1
       FROM review WHERE product_id = $1`,
    [productId]
  );
  const s = summaryResult.rows[0];
  const summary = {
    average: s.average === null ? null : Number(s.average),
    count: s.count,
    distribution: { 5: s.r5, 4: s.r4, 3: s.r3, 2: s.r2, 1: s.r1 },
  };

  const params = [productId];
  let ratingSql = '';
  if (rating !== undefined) {
    params.push(rating);
    ratingSql = `AND r.rating = $${params.length}`;
  }
  const total = rating === undefined ? summary.count : summary.distribution[rating];
  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await query(
    `SELECT r.*, u.first_name, u.last_name
       FROM review r
       JOIN order_item oi ON oi.order_item_id = r.order_item_id
       JOIN "order" o     ON o.order_id = oi.order_id
       JOIN "user" u      ON u.user_id = o.user_id
      WHERE r.product_id = $1 ${ratingSql}
      ORDER BY r.created_at DESC, r.review_id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { items: rows.map(toReview), total, summary };
}

/**
 * สินค้าที่รอรีวิว: อยู่ในคำสั่งซื้อของตัวเองที่ได้รับแล้ว และยังไม่ได้รีวิว (คำสั่งซื้อล่าสุดก่อน)
 * ใช้ทำรายการ "รอรีวิว" ในหน้า /write-review และปุ่ม "เขียนรีวิว" ในหน้าคำสั่งซื้อของ R5
 */
async function listReviewable(userId) {
  const { rows } = await query(
    `SELECT oi.order_item_id, oi.order_id, oi.product_id, oi.title_snapshot, oi.quantity,
            o.current_status, o.placed_at, p.cover_image_url, p.status AS product_status
       FROM order_item oi
       JOIN "order" o     ON o.order_id = oi.order_id
       LEFT JOIN product p ON p.product_id = oi.product_id
       LEFT JOIN review r  ON r.order_item_id = oi.order_item_id
      WHERE o.user_id = $1
        AND o.current_status = ANY($2)
        AND r.review_id IS NULL
      ORDER BY o.placed_at DESC, oi.order_item_id`,
    [userId, REVIEWABLE_STATUSES]
  );
  return rows.map((row) => ({
    order_item_id: Number(row.order_item_id),
    order_id: Number(row.order_id),
    product_id: Number(row.product_id),
    title: row.title_snapshot, // ชื่อ ณ วันที่ซื้อ (แอดมินเปลี่ยนชื่อสินค้าทีหลังก็ไม่กระทบ)
    quantity: row.quantity,
    cover_image_url: row.cover_image_url,
    order_status: row.current_status,
    placed_at: row.placed_at,
  }));
}

/** รีวิวที่ตัวเองเขียนไว้ (ใหม่สุดก่อน) พร้อมชื่อสินค้า ณ วันที่ซื้อ */
async function listMine(userId) {
  const { rows } = await query(
    `SELECT r.*, u.first_name, u.last_name, oi.title_snapshot, oi.order_id, p.cover_image_url, p.status AS product_status
       FROM review r
       JOIN order_item oi ON oi.order_item_id = r.order_item_id
       JOIN "order" o     ON o.order_id = oi.order_id
       JOIN "user" u      ON u.user_id = o.user_id
       LEFT JOIN product p ON p.product_id = r.product_id
      WHERE o.user_id = $1
      ORDER BY r.created_at DESC, r.review_id DESC`,
    [userId]
  );
  return rows.map((row) => ({
    ...toReview(row),
    order_item_id: Number(row.order_item_id),
    order_id: Number(row.order_id),
    title: row.title_snapshot,
    cover_image_url: row.cover_image_url,
    product_available: row.product_status === 'available',
  }));
}

module.exports = { REVIEWABLE_STATUSES, shortName, create, getById, listForProduct, listReviewable, listMine };
