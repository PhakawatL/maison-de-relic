// service ของคำขอคืนเงิน (R1 · S9 · BR-22, BR-23 · ตาราง refund_request)
//
// ลำดับสถานะ:   requested ──อนุมัติ──▶ approved ──โอนเงินคืน──▶ refunded
//                  └──────ไม่อนุมัติ──▶ rejected
//
// กติกาฝั่งลูกค้า (ตรวจในโค้ด เพราะ DDL บังคับไม่ได้):
//   * ขอคืนได้เฉพาะสินค้าในคำสั่งซื้อของตัวเองที่ได้รับแล้ว (delivered / completed)
//   * ภายใน 7 วันหลังได้รับสินค้า (เวลาที่ได้รับ = แถว delivered ล่าสุดใน order_status_log
//     ถ้า R5 ไม่ได้บันทึกไว้ ใช้เวลาสั่งซื้อแทน ซึ่งเข้มกว่า)
//   * ขอได้หลายครั้งต่อรายการ แต่รวมกันต้องไม่เกินจำนวนที่ซื้อ (คำขอที่ถูกปฏิเสธไม่นับ)
//   * ยอดคืน = ราคาต่อชิ้น ณ วันที่ซื้อ × จำนวนที่ขอคืน (ระบบคำนวณเอง ไม่รับจากหน้าเว็บ)
//
// ฝั่งผู้ดูแล (ทุกการกระทำบันทึก admin_action_log ใน transaction เดียวกัน · BR-31):
//   * อนุมัติ: ต้องเลือกว่าของที่ลูกค้าส่งคืน "คืนเข้าสต็อก" (return) หรือ "ตัดจำหน่าย" (write_off)
//       return    → เพิ่ม product.stock_quantity + บันทึก stock_movement ประเภท return (ledger ของ R3)
//       write_off → ของเสียหายขายต่อไม่ได้ สต็อกไม่เปลี่ยน (ไม่มีแถว stock_movement)
//   * ไม่อนุมัติ: ปิดคำขอทันที (เหตุผลเก็บใน log)
//   * โอนเงินคืนแล้ว: (จำลอง ไม่มี payment gateway จริง) ถ้าคืนครบทุกชิ้นของคำสั่งซื้อ
//       → "order".current_status = refunded + order_status_log + payment.status = refunded
const { query, withTransaction } = require('../../db/pool');
const AppError = require('../../utils/AppError');
const { logAdminAction } = require('../support/action-log.service');

const REFUND_WINDOW_DAYS = 7;
const ELIGIBLE_ORDER_STATUSES = ['delivered', 'completed'];
const STATUSES = ['requested', 'approved', 'rejected', 'refunded'];
const RESTOCK_DECISIONS = ['return', 'write_off'];

const refundCode = (id) => `RF${String(id).padStart(3, '0')}`;
const baht = (n) => `฿${Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// เวลาที่ได้รับสินค้า: แถว delivered ล่าสุดใน order_status_log (ไม่มี → เวลาสั่งซื้อ)
const DELIVERED_AT = `COALESCE(
  (SELECT MAX(l.changed_at) FROM order_status_log l WHERE l.order_id = o.order_id AND l.to_status = 'delivered'),
  o.placed_at)`;

// จำนวนที่ขอคืนไปแล้วของรายการนี้ (ไม่นับคำขอที่ถูกปฏิเสธ)
const USED_QTY = `COALESCE(
  (SELECT SUM(x.refund_qty) FROM refund_request x WHERE x.order_item_id = oi.order_item_id AND x.status <> 'rejected'),
  0)::int`;

/** คำขอในมุมของลูกค้า */
function toRefund(row) {
  return {
    refund_id: Number(row.refund_id),
    code: refundCode(row.refund_id),
    order_item_id: Number(row.order_item_id),
    order_id: Number(row.order_id),
    product_id: Number(row.product_id),
    title: row.title_snapshot,
    cover_image_url: row.cover_image_url ?? null,
    refund_qty: row.refund_qty,
    amount: Number(row.amount),
    reason: row.reason,
    evidence_url: row.evidence_url,
    status: row.status,
    restock_decision: row.restock_decision,
    requested_at: row.requested_at,
    resolved_at: row.resolved_at,
  };
}

const REFUND_FROM = `
  FROM refund_request rr
  JOIN order_item oi  ON oi.order_item_id = rr.order_item_id
  JOIN "order" o      ON o.order_id = oi.order_id
  JOIN "user" u       ON u.user_id = o.user_id
  LEFT JOIN product p ON p.product_id = oi.product_id
  LEFT JOIN payment pay ON pay.order_id = o.order_id
  LEFT JOIN "user" ru ON ru.user_id = rr.reviewed_by`;

const REFUND_COLUMNS = `
  rr.*, oi.order_id, oi.product_id, oi.title_snapshot, oi.quantity AS purchased_qty, oi.unit_price_at_purchase,
  p.cover_image_url, p.stock_quantity AS product_stock, p.status AS product_status,
  o.current_status AS order_status, o.grand_total, o.placed_at, ${DELIVERED_AT} AS delivered_at,
  pay.method AS payment_method, pay.status AS payment_status,
  u.user_id AS customer_id, u.username AS customer_username, u.display_name AS customer_name, u.email AS customer_email,
  ru.display_name AS reviewer_name`;

/** คำขอในมุมของผู้ดูแล — เพิ่มลูกค้า คำสั่งซื้อ (+ ช่องทางที่ชำระ ไว้โอนคืน) สินค้า และผู้พิจารณา */
function toAdminRefund(row) {
  return {
    ...toRefund(row),
    customer: {
      user_id: Number(row.customer_id),
      username: row.customer_username,
      display_name: row.customer_name,
      email: row.customer_email,
    },
    order: {
      order_id: Number(row.order_id),
      current_status: row.order_status,
      grand_total: Number(row.grand_total),
      placed_at: row.placed_at,
      delivered_at: row.delivered_at,
      payment: row.payment_method === null ? null : { method: row.payment_method, status: row.payment_status },
    },
    item: {
      purchased_qty: row.purchased_qty,
      unit_price: Number(row.unit_price_at_purchase),
    },
    product: { stock_quantity: row.product_stock ?? null, status: row.product_status ?? null },
    reviewer: row.reviewed_by === null ? null : { user_id: Number(row.reviewed_by), display_name: row.reviewer_name },
  };
}

// =====================================================================
// ฝั่งลูกค้า
// =====================================================================

/**
 * สินค้าที่ยังขอคืนเงินได้ (ได้รับแล้ว ยังไม่เกิน 7 วัน และยังเหลือจำนวนที่ขอคืนได้)
 * deadline = วันสุดท้ายที่ขอได้ · refundable_qty = จำนวนที่ยังขอคืนได้
 */
async function listRefundable(userId) {
  const { rows } = await query(
    `WITH items AS (
       SELECT oi.order_item_id, oi.order_id, oi.product_id, oi.title_snapshot, oi.quantity, oi.unit_price_at_purchase,
              o.current_status, o.placed_at, p.cover_image_url,
              ${DELIVERED_AT} AS delivered_at,
              ${USED_QTY} AS used_qty
         FROM order_item oi
         JOIN "order" o      ON o.order_id = oi.order_id
         LEFT JOIN product p ON p.product_id = oi.product_id
        WHERE o.user_id = $1 AND o.current_status = ANY($2)
     )
     SELECT *, delivered_at + make_interval(days => $3) AS deadline
       FROM items
      WHERE used_qty < quantity
        AND delivered_at + make_interval(days => $3) > NOW()
      ORDER BY delivered_at DESC, order_item_id`,
    [userId, ELIGIBLE_ORDER_STATUSES, REFUND_WINDOW_DAYS]
  );
  return rows.map((r) => ({
    order_item_id: Number(r.order_item_id),
    order_id: Number(r.order_id),
    product_id: Number(r.product_id),
    title: r.title_snapshot,
    cover_image_url: r.cover_image_url,
    quantity: r.quantity,
    refundable_qty: r.quantity - r.used_qty,
    unit_price: Number(r.unit_price_at_purchase),
    delivered_at: r.delivered_at,
    deadline: r.deadline,
  }));
}

/**
 * ขอคืนเงิน — data: { order_item_id, refund_qty, reason, evidence_url? }
 *   404 ORDER_ITEM_NOT_FOUND   ไม่ใช่สินค้าในคำสั่งซื้อของตัวเอง
 *   409 ORDER_NOT_DELIVERED    ยังไม่ได้รับสินค้า / คำสั่งซื้อถูกยกเลิกหรือคืนเงินไปแล้ว
 *   409 REFUND_WINDOW_CLOSED   เกิน 7 วันหลังได้รับสินค้า (details.deadline)
 *   409 REFUND_QTY_EXCEEDED    ขอคืนเกินจำนวนที่ยังขอได้ (details.refundable_qty)
 */
async function create(userId, data) {
  return withTransaction(async (client) => {
    // ล็อกแถวสินค้ารายการนี้ไว้ กันกดขอคืนพร้อมกันสองแท็บแล้วรวมกันเกินจำนวนที่ซื้อ
    const { rows } = await client.query(
      `SELECT oi.order_item_id, oi.quantity, oi.unit_price_at_purchase, o.user_id, o.current_status,
              ${DELIVERED_AT} AS delivered_at,
              ${DELIVERED_AT} + make_interval(days => $2) AS deadline,
              ${DELIVERED_AT} + make_interval(days => $2) > NOW() AS within_window
         FROM order_item oi
         JOIN "order" o ON o.order_id = oi.order_id
        WHERE oi.order_item_id = $1
        FOR UPDATE OF oi`,
      [data.order_item_id, REFUND_WINDOW_DAYS]
    );
    const item = rows[0];
    if (!item || Number(item.user_id) !== userId) {
      throw AppError.notFound('ORDER_ITEM_NOT_FOUND', 'ไม่พบสินค้านี้ในคำสั่งซื้อของคุณ');
    }
    if (!ELIGIBLE_ORDER_STATUSES.includes(item.current_status)) {
      throw AppError.conflict('ORDER_NOT_DELIVERED', 'ขอคืนเงินได้หลังจากได้รับสินค้าแล้วเท่านั้น');
    }
    if (!item.within_window) {
      throw AppError.conflict(
        'REFUND_WINDOW_CLOSED',
        `ขอคืนเงินได้ภายใน ${REFUND_WINDOW_DAYS} วันหลังได้รับสินค้า`,
        { deadline: item.deadline }
      );
    }

    const used = await client.query(
      `SELECT COALESCE(SUM(refund_qty), 0)::int AS used
         FROM refund_request WHERE order_item_id = $1 AND status <> 'rejected'`,
      [data.order_item_id]
    );
    const remaining = item.quantity - used.rows[0].used;
    if (data.refund_qty > remaining) {
      throw AppError.conflict('REFUND_QTY_EXCEEDED', `ขอคืนได้อีกไม่เกิน ${remaining} ชิ้น`, {
        refundable_qty: remaining,
      });
    }

    const inserted = await client.query(
      `INSERT INTO refund_request (order_item_id, reason, evidence_url, refund_qty, amount)
       VALUES ($1, $2, $3, $4::int, $5::numeric * $4::int)
       RETURNING refund_id`,
      [data.order_item_id, data.reason, data.evidence_url ?? null, data.refund_qty, item.unit_price_at_purchase]
    );
    return getForUser(userId, inserted.rows[0].refund_id, client);
  });
}

/** คำขอของตัวเองแบบแบ่งหน้า (ล่าสุดก่อน) — filters: { status, page, pageSize } */
async function listForUser(userId, { status, page, pageSize }) {
  const params = [userId];
  let statusSql = '';
  if (status !== 'all') {
    params.push(status);
    statusSql = `AND rr.status = $${params.length}`;
  }
  const count = await query(`SELECT COUNT(*)::int AS total ${REFUND_FROM} WHERE o.user_id = $1 ${statusSql}`, params);
  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await query(
    `SELECT ${REFUND_COLUMNS} ${REFUND_FROM}
      WHERE o.user_id = $1 ${statusSql}
      ORDER BY rr.requested_at DESC, rr.refund_id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { items: rows.map(toRefund), total: count.rows[0].total };
}

/** คำขอของตัวเอง 1 รายการ — ของคนอื่นได้ null */
async function getForUser(userId, refundId, db = { query }) {
  const { rows } = await db.query(
    `SELECT ${REFUND_COLUMNS} ${REFUND_FROM} WHERE rr.refund_id = $1 AND o.user_id = $2`,
    [refundId, userId]
  );
  return rows[0] ? toRefund(rows[0]) : null;
}

// =====================================================================
// ฝั่งผู้ดูแล
// =====================================================================

/**
 * ทุกคำขอแบบแบ่งหน้า (ล่าสุดก่อน) + จำนวนแต่ละสถานะ
 * q = รหัสคำขอ (RF012) · ตัวเลข (รหัสคำขอหรือเลขคำสั่งซื้อ) · ชื่อสินค้า / ชื่อผู้ใช้ / อีเมลของลูกค้า
 */
async function list({ q, status, page, pageSize }) {
  const where = [];
  const params = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (q) {
    const code = /^rf0*(\d{1,15})$/i.exec(q);
    const num = /^#?(\d{1,15})$/.exec(q);
    if (code) {
      where.push(`rr.refund_id = ${add(Number(code[1]))}`);
    } else if (num) {
      const ph = add(Number(num[1]));
      where.push(`(rr.refund_id = ${ph} OR oi.order_id = ${ph})`);
    } else {
      const ph = add(`%${q}%`);
      where.push(`(oi.title_snapshot ILIKE ${ph} OR u.username ILIKE ${ph} OR u.display_name ILIKE ${ph} OR u.email ILIKE ${ph})`);
    }
  }
  const baseWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const counted = await query(
    `SELECT rr.status, COUNT(*)::int AS n ${REFUND_FROM} ${baseWhere} GROUP BY rr.status`,
    params
  );
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const row of counted.rows) counts[row.status] = row.n;

  if (status !== 'all') where.push(`rr.status = ${add(status)}`);
  const total = status === 'all' ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[status];
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = add(pageSize);
  const offset = add((page - 1) * pageSize);
  const { rows } = await query(
    `SELECT ${REFUND_COLUMNS} ${REFUND_FROM} ${whereSql}
      ORDER BY rr.requested_at DESC, rr.refund_id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  return { items: rows.map(toAdminRefund), total, counts };
}

async function getById(refundId, db = { query }) {
  const { rows } = await db.query(`SELECT ${REFUND_COLUMNS} ${REFUND_FROM} WHERE rr.refund_id = $1`, [refundId]);
  return rows[0] ? toAdminRefund(rows[0]) : null;
}

const invalidStatus = (status) =>
  AppError.conflict('INVALID_REFUND_STATUS', 'คำขอนี้อยู่ในสถานะที่ทำรายการนี้ไม่ได้แล้ว', { status });

/**
 * ผู้ดูแลพิจารณาคำขอ — change: { action: 'approve' | 'reject' | 'refund', restock_decision?, note? }
 *   approve  requested → approved   ต้องมี restock_decision (return = คืนเข้าสต็อก, write_off = ตัดจำหน่าย)
 *   reject   requested → rejected   note = เหตุผล (เก็บใน log)
 *   refund   approved  → refunded   โอนเงินคืนแล้ว (จำลอง) · คืนครบทั้งคำสั่งซื้อ → คำสั่งซื้อเป็น refunded
 * คืนคำขอหลังแก้ หรือ null ถ้าไม่พบ · สถานะไม่ถูกต้อง → 409 INVALID_REFUND_STATUS
 */
async function update(actorId, refundId, { action, restock_decision: restock, note }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT rr.*, oi.order_id, oi.product_id
         FROM refund_request rr
         JOIN order_item oi ON oi.order_item_id = rr.order_item_id
        WHERE rr.refund_id = $1
        FOR UPDATE OF rr`,
      [refundId]
    );
    const rr = rows[0];
    if (!rr) return null;
    const code = refundCode(refundId);
    const log = (actionType, text) =>
      logAdminAction(client, { adminId: actorId, actionType, targetType: 'refund_request', targetId: refundId, note: text });

    if (action === 'approve') {
      if (rr.status !== 'requested') throw invalidStatus(rr.status);
      await client.query(
        `UPDATE refund_request SET status = 'approved', reviewed_by = $1, restock_decision = $2 WHERE refund_id = $3`,
        [actorId, restock, refundId]
      );
      if (restock === 'return') {
        // ของกลับเข้าคลัง: เพิ่มสต็อกแล้วบันทึกยอดคงเหลือหลังเปลี่ยนลง ledger (stock_movement ของ R3)
        const stock = await client.query(
          'UPDATE product SET stock_quantity = stock_quantity + $1 WHERE product_id = $2 RETURNING stock_quantity',
          [rr.refund_qty, rr.product_id]
        );
        await client.query(
          `INSERT INTO stock_movement (product_id, order_item_id, movement_type, qty_change, balance_after, note, created_by)
           VALUES ($1, $2, 'return', $3, $4, $5, $6)`,
          [rr.product_id, rr.order_item_id, rr.refund_qty, stock.rows[0].stock_quantity, `คืนสินค้า ${code}`, actorId]
        );
      }
      await log(
        'approve_refund',
        `${code}: อนุมัติ · ${restock === 'return' ? `คืนเข้าสต็อก ${rr.refund_qty} ชิ้น` : 'ตัดจำหน่าย (ไม่คืนเข้าสต็อก)'}${note ? ` · ${note}` : ''}`
      );
    } else if (action === 'reject') {
      if (rr.status !== 'requested') throw invalidStatus(rr.status);
      await client.query(
        `UPDATE refund_request SET status = 'rejected', reviewed_by = $1, resolved_at = NOW() WHERE refund_id = $2`,
        [actorId, refundId]
      );
      await log('reject_refund', `${code}: ไม่อนุมัติ${note ? ` · ${note}` : ''}`);
    } else if (action === 'refund') {
      if (rr.status !== 'approved') throw invalidStatus(rr.status);
      await client.query(`UPDATE refund_request SET status = 'refunded', resolved_at = NOW() WHERE refund_id = $1`, [
        refundId,
      ]);
      await log('complete_refund', `${code}: โอนเงินคืน ${baht(rr.amount)}${note ? ` · ${note}` : ''}`);

      // คืนครบทุกชิ้นของคำสั่งซื้อแล้ว → ปิดคำสั่งซื้อเป็น refunded (ไม่ครบ = สถานะคำสั่งซื้อเหมือนเดิม)
      const full = await client.query(
        `SELECT bool_and(COALESCE(r.refunded, 0) >= oi.quantity) AS all_refunded
           FROM order_item oi
           LEFT JOIN (SELECT order_item_id, SUM(refund_qty) AS refunded
                        FROM refund_request WHERE status = 'refunded' GROUP BY order_item_id) r
                  ON r.order_item_id = oi.order_item_id
          WHERE oi.order_id = $1`,
        [rr.order_id]
      );
      if (full.rows[0].all_refunded) {
        const order = await client.query(
          `SELECT current_status FROM "order" WHERE order_id = $1 FOR UPDATE`,
          [rr.order_id]
        );
        const from = order.rows[0].current_status;
        if (from !== 'refunded') {
          await client.query(`UPDATE "order" SET current_status = 'refunded' WHERE order_id = $1`, [rr.order_id]);
          await client.query(
            `INSERT INTO order_status_log (order_id, from_status, to_status, changed_by, note)
             VALUES ($1, $2, 'refunded', $3, $4)`,
            [rr.order_id, from, actorId, `คืนเงินครบทุกรายการ (${code})`]
          );
          await client.query(`UPDATE payment SET status = 'refunded' WHERE order_id = $1`, [rr.order_id]);
        }
      }
    }
    return getById(refundId, client);
  });
}

module.exports = {
  REFUND_WINDOW_DAYS,
  STATUSES,
  RESTOCK_DECISIONS,
  listRefundable,
  create,
  listForUser,
  getForUser,
  list,
  getById,
  update,
};
