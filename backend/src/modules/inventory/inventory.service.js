// สต็อกสินค้า (R3 · Inventory) — ทุกการเปลี่ยน product.stock_quantity ควรผ่าน applyStockChange() ที่นี่
// จะได้บันทึก stock_movement (ledger) ครบทุกครั้ง และยอดคงเหลือไม่ติดลบ
//
//   const { applyStockChange } = require('../inventory/inventory.service');
//   await withTransaction(async (client) => {
//     await applyStockChange(client, { productId, type: 'return', change: +2, orderItemId, note: 'คืนสินค้า RF-0001', actorId });
//   });
//
// ประเภท (movement_type ในตาราง)
//   restock   เติมของเข้า (+)            · แอดมินทำผ่าน API นี้ / ลงสินค้าใหม่
//   write_off ตัดของเสีย / หาย (−)        · แอดมินทำผ่าน API นี้
//   adjust    ปรับยอดให้ตรงของจริง (±)   · แอดมินนับของแล้วใส่ยอดจริง / แก้จำนวนในฟอร์มสินค้า
//   sale      ขายออก (−)                 · ระบบคำสั่งซื้อ (R5) เรียกตอนชำระเงิน
//   return    คืนเข้าคลัง (+)            · ระบบคืนเงิน (R1)
const { query, withTransaction } = require('../../db/pool');
const AppError = require('../../utils/AppError');
const { logAdminAction } = require('../support/action-log.service');

const TYPES = ['restock', 'sale', 'return', 'write_off', 'adjust'];
const MAX_STOCK = 100000;

/**
 * เปลี่ยนสต็อก + บันทึก ledger · ต้องเรียกใน transaction (client จาก withTransaction)
 * change = จำนวนที่เปลี่ยน (+ เพิ่ม / − ลด) ห้ามเป็น 0
 * คืน { before, after } · ไม่มีสินค้า → null · ของไม่พอ → 409 INSUFFICIENT_STOCK
 */
async function applyStockChange(client, { productId, type, change, note = null, actorId = null, orderItemId = null }) {
  if (!TYPES.includes(type)) throw new Error(`movement_type ไม่ถูกต้อง: ${type}`);
  if (!Number.isInteger(change) || change === 0) throw new Error('change ต้องเป็นจำนวนเต็มที่ไม่ใช่ 0');

  // FOR UPDATE = ล็อกแถวนี้จนจบ transaction กันสองคำขอแก้สต็อกพร้อมกันแล้วยอดเพี้ยน
  const { rows } = await client.query('SELECT stock_quantity FROM product WHERE product_id = $1 FOR UPDATE', [productId]);
  if (!rows[0]) return null;
  const before = rows[0].stock_quantity;
  const after = before + change;
  if (after < 0) {
    throw AppError.conflict('INSUFFICIENT_STOCK', `สต็อกไม่พอ (มี ${before} ชิ้น แต่จะลด ${-change} ชิ้น)`, {
      stock_quantity: before,
    });
  }
  if (after > MAX_STOCK) {
    throw AppError.badRequest('VALIDATION_ERROR', 'จำนวนสต็อกมากเกินไป', [{ field: 'quantity', issue: `รวมแล้วต้องไม่เกิน ${MAX_STOCK}` }]);
  }

  await client.query('UPDATE product SET stock_quantity = $2 WHERE product_id = $1', [productId, after]);
  await client.query(
    `INSERT INTO stock_movement (product_id, order_item_id, movement_type, qty_change, balance_after, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [productId, orderItemId, type, change, after, note, actorId]
  );
  return { before, after };
}

const TYPE_TH = { restock: 'เติมสต็อก', write_off: 'ตัดของเสีย', adjust: 'ปรับยอดสต็อก' };

/**
 * แอดมินเปลี่ยนสต็อก (POST /products/:id/stock) · input ผ่านการตรวจจาก controller แล้ว
 *   { type: 'restock' | 'write_off', quantity }  หรือ  { type: 'adjust', new_quantity }
 * คืน null ถ้าไม่มีสินค้า · คืน { product_id, before, after, movement }
 */
async function adminChangeStock(productId, input, adminId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT title, stock_quantity FROM product WHERE product_id = $1 FOR UPDATE', [productId]);
    if (!rows[0]) return null;

    let change;
    if (input.type === 'restock') change = input.quantity;
    else if (input.type === 'write_off') change = -input.quantity;
    else change = input.new_quantity - rows[0].stock_quantity;
    if (change === 0) {
      throw AppError.badRequest('NO_CHANGE', `สต็อกเป็น ${rows[0].stock_quantity} ชิ้นอยู่แล้ว ไม่มีอะไรเปลี่ยน`);
    }

    const result = await applyStockChange(client, {
      productId, type: input.type, change, note: input.note, actorId: adminId,
    });
    await logAdminAction(client, {
      adminId, actionType: 'adjust_stock', targetType: 'product', targetId: productId,
      note: `${rows[0].title} · ${TYPE_TH[input.type]} ${change > 0 ? '+' : ''}${change} (${result.before} → ${result.after})${input.note ? ` · ${input.note}` : ''}`,
    });
    const movement = await client.query(
      `${MOVEMENT_SELECT} WHERE m.product_id = $1 ORDER BY m.movement_id DESC LIMIT 1`,
      [productId]
    );
    return { product_id: productId, before: result.before, after: result.after, movement: toMovement(movement.rows[0]) };
  });
}

const MOVEMENT_SELECT = `
  SELECT m.movement_id, m.movement_type, m.qty_change, m.balance_after, m.note, m.created_at,
         m.order_item_id, oi.order_id,
         u.user_id AS by_id, u.username AS by_username, u.display_name AS by_name
    FROM stock_movement m
    LEFT JOIN order_item oi ON oi.order_item_id = m.order_item_id
    LEFT JOIN "user" u ON u.user_id = m.created_by`;

function toMovement(r) {
  return {
    movement_id: Number(r.movement_id),
    type: r.movement_type,
    qty_change: r.qty_change,
    balance_after: r.balance_after,
    note: r.note,
    created_at: r.created_at,
    order_id: r.order_id === null ? null : Number(r.order_id),
    created_by: r.by_id === null ? null : { user_id: Number(r.by_id), username: r.by_username, display_name: r.by_name },
  };
}

/** ประวัติสต็อก ใหม่สุดก่อน · คืน null ถ้าไม่มีสินค้า */
async function listMovements(productId, { type, page, pageSize }) {
  const product = await query('SELECT stock_quantity FROM product WHERE product_id = $1', [productId]);
  if (!product.rows[0]) return null;

  const params = [productId];
  let where = 'WHERE m.product_id = $1';
  if (type) {
    params.push(type);
    where += ` AND m.movement_type = $${params.length}`;
  }
  const [items, count] = await Promise.all([
    query(
      `${MOVEMENT_SELECT} ${where} ORDER BY m.movement_id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize]
    ),
    query(`SELECT count(*)::int AS total FROM stock_movement m ${where}`, params),
  ]);
  return {
    items: items.rows.map(toMovement),
    total: count.rows[0].total,
    stock_quantity: product.rows[0].stock_quantity,
  };
}

module.exports = { applyStockChange, adminChangeStock, listMovements, TYPES };
