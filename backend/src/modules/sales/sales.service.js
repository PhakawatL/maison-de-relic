// สรุปยอดขาย (R3) — อ่านจากตาราง order / order_item / refund_request อย่างเดียว ไม่เขียนอะไร
//
// นับอะไรเป็น "ขายแล้ว"
//   คำสั่งซื้อทุกสถานะยกเว้น cancelled (paid → packing → shipped → delivered → completed และ refunded)
//   ทุกคำสั่งซื้อจ่ายเงินแล้วตั้งแต่สร้าง (สถานะเริ่มต้นคือ paid · BR-17)
//   คำสั่งซื้อที่ refunded ยังนับเป็นยอดขาย แล้วไปหักในยอดคืนเงินแทน (ยอดขาย − คืนเงิน = ยอดสุทธิ)
// ยอดคืนเงิน = refund_request ที่สถานะ refunded นับตามวันที่โอนคืน (resolved_at)
// วันที่ใช้เวลาไทย (Asia/Bangkok) — ร้านอยู่ไทย "วันนี้" ต้องตรงกับที่แอดมินเห็น
const { query } = require('../../db/pool');

const TZ = 'Asia/Bangkok';
const SOLD = `o.current_status <> 'cancelled'`;
// placed_at อยู่ในช่วง [from, to] (วันที่ไทย รวมวันสุดท้าย)
const IN_RANGE = (col) => `(${col} AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date`;

const num = (v) => (v === null || v === undefined ? 0 : Number(v));

async function totals(from, to) {
  const [orders, items, refunds] = await Promise.all([
    query(
      `SELECT count(*)::int AS orders, COALESCE(sum(o.grand_total), 0) AS gross, count(DISTINCT o.user_id)::int AS customers
         FROM "order" o
        WHERE ${SOLD} AND ${IN_RANGE('o.placed_at')}`,
      [from, to]
    ),
    query(
      `SELECT COALESCE(sum(oi.quantity), 0)::int AS units
         FROM order_item oi JOIN "order" o ON o.order_id = oi.order_id
        WHERE ${SOLD} AND ${IN_RANGE('o.placed_at')}`,
      [from, to]
    ),
    query(
      `SELECT count(*)::int AS count, COALESCE(sum(r.amount), 0) AS amount
         FROM refund_request r
        WHERE r.status = 'refunded' AND r.resolved_at IS NOT NULL AND ${IN_RANGE('r.resolved_at')}`,
      [from, to]
    ),
  ]);
  const gross = num(orders.rows[0].gross);
  const refunded = num(refunds.rows[0].amount);
  const count = orders.rows[0].orders;
  return {
    gross,
    refunds: refunded,
    net: Math.round((gross - refunded) * 100) / 100,
    orders: count,
    units: items.rows[0].units,
    customers: orders.rows[0].customers,
    avg_order: count ? Math.round((gross / count) * 100) / 100 : 0,
    refund_count: refunds.rows[0].count,
  };
}

/**
 * สรุปยอดขายช่วง from..to (YYYY-MM-DD รวมทั้งสองวัน · controller ตรวจแล้ว)
 * previous = ช่วงก่อนหน้าที่ยาวเท่ากัน (ไว้เทียบขึ้น/ลง)
 */
async function summary({ from, to, prevFrom, prevTo, top }) {
  const [current, previous, daily, topProducts, categories, statuses] = await Promise.all([
    totals(from, to),
    totals(prevFrom, prevTo),
    // ทุกวันในช่วง (วันที่ไม่มียอดได้ 0 กราฟจะไม่ขาด)
    query(
      `WITH days AS (SELECT generate_series($1::date, $2::date, interval '1 day')::date AS day),
            o AS (
              SELECT (o.placed_at AT TIME ZONE '${TZ}')::date AS day, o.grand_total
                FROM "order" o WHERE ${SOLD} AND ${IN_RANGE('o.placed_at')}
            )
       SELECT to_char(d.day, 'YYYY-MM-DD') AS date, count(o.day)::int AS orders, COALESCE(sum(o.grand_total), 0) AS gross
         FROM days d LEFT JOIN o ON o.day = d.day
        GROUP BY d.day ORDER BY d.day`,
      [from, to]
    ),
    query(
      `SELECT oi.product_id, p.title, p.cover_image_url, p.status,
              sum(oi.quantity)::int AS units, sum(oi.quantity * oi.unit_price_at_purchase) AS revenue,
              count(DISTINCT oi.order_id)::int AS orders
         FROM order_item oi
         JOIN "order" o ON o.order_id = oi.order_id
         JOIN product p ON p.product_id = oi.product_id
        WHERE ${SOLD} AND ${IN_RANGE('o.placed_at')}
        GROUP BY oi.product_id, p.title, p.cover_image_url, p.status
        ORDER BY revenue DESC, units DESC, oi.product_id
        LIMIT $3`,
      [from, to, top]
    ),
    query(
      `SELECT c.category_id, c.name, c.slug,
              sum(oi.quantity)::int AS units, sum(oi.quantity * oi.unit_price_at_purchase) AS revenue
         FROM order_item oi
         JOIN "order" o ON o.order_id = oi.order_id
         JOIN product p ON p.product_id = oi.product_id
         JOIN category c ON c.category_id = p.category_id
        WHERE ${SOLD} AND ${IN_RANGE('o.placed_at')}
        GROUP BY c.category_id, c.name, c.slug
        ORDER BY revenue DESC, c.category_id`,
      [from, to]
    ),
    // คำสั่งซื้อในช่วงแยกตามสถานะ (รวม cancelled ให้เห็นว่ายกเลิกไปเท่าไร)
    query(
      `SELECT o.current_status AS status, count(*)::int AS orders, COALESCE(sum(o.grand_total), 0) AS amount
         FROM "order" o WHERE ${IN_RANGE('o.placed_at')}
        GROUP BY o.current_status ORDER BY orders DESC`,
      [from, to]
    ),
  ]);

  const itemsRevenue = categories.rows.reduce((s, r) => s + num(r.revenue), 0);
  return {
    range: { from, to, days: daily.rows.length },
    previous_range: { from: prevFrom, to: prevTo },
    totals: current,
    previous: previous,
    daily: daily.rows.map((r) => ({ date: r.date, orders: r.orders, gross: num(r.gross) })),
    top_products: topProducts.rows.map((r) => ({
      product_id: Number(r.product_id),
      title: r.title,
      cover_image_url: r.cover_image_url,
      status: r.status,
      units: r.units,
      orders: r.orders,
      revenue: num(r.revenue),
    })),
    categories: categories.rows.map((r) => ({
      category_id: Number(r.category_id),
      name: r.name,
      slug: r.slug,
      units: r.units,
      revenue: num(r.revenue),
      share: itemsRevenue ? Math.round((num(r.revenue) / itemsRevenue) * 1000) / 10 : 0,
    })),
    by_status: statuses.rows.map((r) => ({ status: r.status, orders: r.orders, amount: num(r.amount) })),
  };
}

module.exports = { summary, TZ };
