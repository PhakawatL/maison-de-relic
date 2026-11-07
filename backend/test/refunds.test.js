// ทดสอบคำขอคืนเงิน (R1 · #9): /api/refund-requests (ลูกค้า) และ /api/admin/refund-requests (ผู้ดูแล)
// คำสั่งซื้อสร้างตรงในฐานข้อมูลด้วย fixtures (ระบบ checkout ของ R5 ยังไม่มี)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { pool, query } = require('../src/db/pool');
const { createFixtures } = require('./helpers/r1-fixtures');

const fx = createFixtures('zzr1rf');
const u = {};
const p = {};
const o = {};

const request = (as, body) => fx.api('POST', '/refund-requests', { as, body });
const decide = (as, id, body) => fx.api('PATCH', `/admin/refund-requests/${id}`, { as, body });
const stockOf = async (product) =>
  (await query('SELECT stock_quantity FROM product WHERE product_id = $1', [product.id])).rows[0].stock_quantity;
const orderState = async (order) =>
  (
    await query(
      `SELECT o.current_status, pay.status AS payment_status
         FROM "order" o JOIN payment pay ON pay.order_id = o.order_id WHERE o.order_id = $1`,
      [order.id]
    )
  ).rows[0];

before(async () => {
  await fx.cleanup();
  u.boss = await fx.user('boss', { admin: 'owner' });
  u.staff = await fx.user('staff', { admin: 'staff' });
  u.alice = await fx.user('alice');
  u.bob = await fx.user('bob');
  u.newbie = await fx.user('newbie', { verified: false });

  p.gundam = await fx.product('gundam', { price: 1500, stock: 2, createdBy: u.boss.id });
  p.card = await fx.product('card', { price: 250, stock: 0, createdBy: u.boss.id });

  // alice: ได้รับเมื่อวาน (gundam 1 + card 3) · ได้รับ 10 วันก่อน · ยังไม่ส่งถึง
  o.recent = await fx.order(u.alice, [{ product: p.gundam, qty: 1 }, { product: p.card, qty: 3 }], { deliveredDaysAgo: 1 });
  o.old = await fx.order(u.alice, [{ product: p.card, qty: 1 }], { status: 'completed', deliveredDaysAgo: 10, placedDaysAgo: 12 });
  o.shipped = await fx.order(u.alice, [{ product: p.card, qty: 1 }], { status: 'shipped', deliveredDaysAgo: null });
  // bob: ซื้อชิ้นเดียว ได้รับแล้ว (ไว้ทดสอบคืนครบทั้งคำสั่งซื้อ)
  o.bob = await fx.order(u.bob, [{ product: p.gundam, qty: 1 }], { deliveredDaysAgo: 2 });
  o.newbie = await fx.order(u.newbie, [{ product: p.card, qty: 1 }]);

  await fx.start();
  for (const key of ['boss', 'staff', 'alice', 'bob', 'newbie']) await fx.login(key);
});

after(async () => {
  await fx.stop();
  await fx.cleanup();
  await pool.end();
});

const recentGundam = () => o.recent.items[0].id;
const recentCard = () => o.recent.items[1].id;

// ---------- สิทธิ์ ----------

test('ไม่ล็อกอิน → 401 · ยังไม่ยืนยันอีเมล → 403 · ลูกค้าเข้าฝั่งผู้ดูแล → 403', async () => {
  assert.equal((await fx.api('GET', '/refund-requests')).status, 401);
  const res = await request('newbie', { order_item_id: o.newbie.items[0].id, refund_qty: 1, reason: 'ของชำรุด' });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'EMAIL_NOT_VERIFIED');
  assert.equal((await fx.api('GET', '/admin/refund-requests', { as: 'alice' })).status, 403);
});

// ---------- ลูกค้า ----------

test('สินค้าที่ขอคืนได้ = ได้รับแล้วไม่เกิน 7 วัน (ไม่รวมที่เกินกำหนด / ยังไม่ส่งถึง)', async () => {
  const { status, body } = await fx.api('GET', '/refund-requests/refundable', { as: 'alice' });
  assert.equal(status, 200);
  assert.deepEqual(body.data.map((i) => i.order_item_id).sort((a, b) => a - b), [recentGundam(), recentCard()].sort((a, b) => a - b));
  const card = body.data.find((i) => i.order_item_id === recentCard());
  assert.equal(card.refundable_qty, 3);
  assert.equal(card.unit_price, 250);
  assert.ok(new Date(card.deadline) > new Date());
});

test('ขอคืนเงิน → 201 ยอดคืนระบบคำนวณเอง (ราคา ณ วันที่ซื้อ × จำนวน)', async () => {
  const res = await request('alice', {
    order_item_id: recentCard(),
    refund_qty: 2,
    reason: 'การ์ดมีรอยพับที่มุม 2 ใบ',
    evidence_url: 'https://example.com/photo.jpg',
    amount: 1, // ส่งมาก็ไม่ใช้
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.status, 'requested');
  assert.equal(res.body.data.amount, 500);
  assert.equal(res.body.data.refund_qty, 2);
  assert.match(res.body.data.code, /^RF\d{3,}$/);
});

test('ขอเกินจำนวนที่เหลือ → 409 REFUND_QTY_EXCEEDED บอกจำนวนที่ยังขอได้ · ขอส่วนที่เหลือได้', async () => {
  const over = await request('alice', { order_item_id: recentCard(), refund_qty: 2, reason: 'ขอคืนอีกสองใบ' });
  assert.equal(over.status, 409);
  assert.equal(over.body.error.code, 'REFUND_QTY_EXCEEDED');
  assert.equal(over.body.error.details.refundable_qty, 1);

  const rest = await request('alice', { order_item_id: recentCard(), refund_qty: 1, reason: 'ใบสุดท้ายก็มีรอย' });
  assert.equal(rest.status, 201);
  const left = await fx.api('GET', '/refund-requests/refundable', { as: 'alice' });
  assert.ok(!left.body.data.some((i) => i.order_item_id === recentCard()), 'ขอครบแล้วหายจากรายการ');
});

test('เกิน 7 วัน → 409 REFUND_WINDOW_CLOSED · ยังไม่ได้รับ → 409 ORDER_NOT_DELIVERED · ของคนอื่น → 404', async () => {
  const late = await request('alice', { order_item_id: o.old.items[0].id, refund_qty: 1, reason: 'เพิ่งเปิดกล่อง' });
  assert.equal(late.status, 409);
  assert.equal(late.body.error.code, 'REFUND_WINDOW_CLOSED');
  assert.ok(late.body.error.details.deadline);

  const notYet = await request('alice', { order_item_id: o.shipped.items[0].id, refund_qty: 1, reason: 'ยังไม่ได้ของ' });
  assert.equal(notYet.body.error.code, 'ORDER_NOT_DELIVERED');

  const other = await request('bob', { order_item_id: recentGundam(), refund_qty: 1, reason: 'ไม่ใช่ของฉัน' });
  assert.equal(other.status, 404);
  assert.equal(other.body.error.code, 'ORDER_ITEM_NOT_FOUND');
});

test('ข้อมูลผิดรูปแบบ → 400 บอกทุกช่อง', async () => {
  const res = await request('alice', { order_item_id: 'x', refund_qty: 0, reason: 'สั้น', evidence_url: 'ftp://x' });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body.error.details.map((d) => d.field).sort(), ['evidence_url', 'order_item_id', 'reason', 'refund_qty']);
});

test('ลูกค้าเห็นแค่คำขอของตัวเอง', async () => {
  const mine = await fx.api('GET', '/refund-requests', { as: 'alice' });
  assert.equal(mine.body.meta.total, 2);
  const theirs = await fx.api('GET', `/refund-requests/${mine.body.data[0].refund_id}`, { as: 'bob' });
  assert.equal(theirs.status, 404);
  assert.equal(theirs.body.error.code, 'REFUND_NOT_FOUND');
});

// ---------- ผู้ดูแล ----------

async function refundsOf(key) {
  return (await fx.api('GET', '/refund-requests', { as: key })).body.data;
}

test('ผู้ดูแลเห็นทุกคำขอ + จำนวนแต่ละสถานะ + ค้นหาด้วยรหัส RF / เลขคำสั่งซื้อ', async () => {
  const all = await fx.api('GET', '/admin/refund-requests?q=zzr1rf', { as: 'staff' });
  assert.equal(all.status, 200);
  assert.equal(all.body.meta.counts.requested, 2);
  assert.equal(all.body.data[0].customer.username, 'zzr1rf_alice');
  assert.equal(all.body.data[0].item.unit_price, 250);
  assert.deepEqual(all.body.data[0].order.payment, { method: 'mock', status: 'succeeded' }, 'ช่องทางที่ชำระ ไว้โอนคืน');

  const [first] = await refundsOf('alice');
  const byCode = await fx.api('GET', `/admin/refund-requests?q=RF${String(first.refund_id).padStart(3, '0')}`, { as: 'staff' });
  assert.deepEqual(byCode.body.data.map((r) => r.refund_id), [first.refund_id]);
  const byOrder = await fx.api('GET', `/admin/refund-requests?q=${o.recent.id}`, { as: 'staff' });
  assert.equal(byOrder.body.meta.total, 2);
});

test('อนุมัติต้องเลือกการจัดการสินค้า · คืนเข้าสต็อก → สต็อกเพิ่ม + stock_movement + log', async () => {
  const [newest, oldest] = await refundsOf('alice'); // newest = 1 ใบ, oldest = 2 ใบ
  const missing = await decide('staff', oldest.refund_id, { action: 'approve' });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error.details[0].field, 'restock_decision');

  const before = await stockOf(p.card);
  const ok = await decide('staff', oldest.refund_id, { action: 'approve', restock_decision: 'return' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.status, 'approved');
  assert.equal(ok.body.data.restock_decision, 'return');
  assert.equal(ok.body.data.reviewer.user_id, u.staff.id);
  assert.equal(await stockOf(p.card), before + 2);

  const movement = await query(
    `SELECT movement_type, qty_change, balance_after, created_by FROM stock_movement WHERE order_item_id = $1`,
    [recentCard()]
  );
  assert.deepEqual(movement.rows.map((m) => [m.movement_type, m.qty_change, m.balance_after, Number(m.created_by)]), [
    ['return', 2, before + 2, u.staff.id],
  ]);
  assert.equal((await fx.logsOf(u.staff))[0].action_type, 'approve_refund');

  // อนุมัติซ้ำ → 409
  const again = await decide('boss', oldest.refund_id, { action: 'approve', restock_decision: 'return' });
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'INVALID_REFUND_STATUS');

  // ไม่อนุมัติต้องใส่เหตุผล
  const noReason = await decide('boss', newest.refund_id, { action: 'reject', note: '   ' });
  assert.equal(noReason.status, 400);
  assert.deepEqual(noReason.body.error.details.map((d) => d.field), ['note']);

  // ไม่อนุมัติอีกคำขอ → ปิดทันที โอนเงินคืนไม่ได้
  const rejected = await decide('boss', newest.refund_id, { action: 'reject', note: 'รอยพับเกิดจากการใช้งาน' });
  assert.equal(rejected.body.data.status, 'rejected');
  assert.ok(rejected.body.data.resolved_at);
  const log = (await fx.logsOf(u.boss))[0];
  assert.equal(log.action_type, 'reject_refund');
  assert.match(log.note, /รอยพับเกิดจากการใช้งาน/);
  assert.equal((await decide('boss', newest.refund_id, { action: 'refund' })).status, 409);

  // ถูกปฏิเสธแล้ว จำนวนนั้นกลับมาขอใหม่ได้
  const back = await fx.api('GET', '/refund-requests/refundable', { as: 'alice' });
  assert.equal(back.body.data.find((i) => i.order_item_id === recentCard()).refundable_qty, 1);
});

test('โอนเงินคืนบางรายการ → คำสั่งซื้อยังเป็นสถานะเดิม', async () => {
  const approved = (await refundsOf('alice')).find((r) => r.status === 'approved');
  const res = await decide('boss', approved.refund_id, { action: 'refund' });
  assert.equal(res.body.data.status, 'refunded');
  assert.ok(res.body.data.resolved_at);
  assert.deepEqual(await orderState(o.recent), { current_status: 'delivered', payment_status: 'succeeded' });
});

test('คืนครบทุกชิ้นของคำสั่งซื้อ → คำสั่งซื้อและการชำระเงินเป็น refunded + บันทึก order_status_log', async () => {
  const created = await request('bob', { order_item_id: o.bob.items[0].id, refund_qty: 1, reason: 'ได้รับผิดรุ่น' });
  const id = created.body.data.refund_id;
  const stockBefore = await stockOf(p.gundam);
  await decide('staff', id, { action: 'approve', restock_decision: 'write_off' });
  assert.equal(await stockOf(p.gundam), stockBefore, 'ตัดจำหน่าย = สต็อกไม่เปลี่ยน');

  await decide('staff', id, { action: 'refund' });
  assert.deepEqual(await orderState(o.bob), { current_status: 'refunded', payment_status: 'refunded' });
  const log = await query(
    `SELECT from_status, to_status, changed_by FROM order_status_log WHERE order_id = $1 AND to_status = 'refunded'`,
    [o.bob.id]
  );
  assert.deepEqual(log.rows.map((r) => [r.from_status, r.to_status, Number(r.changed_by)]), [['delivered', 'refunded', u.staff.id]]);

  // คำสั่งซื้อที่คืนเงินแล้วขอคืน / รีวิวไม่ได้อีก
  const seen = await fx.api('GET', `/refund-requests/${id}`, { as: 'bob' });
  assert.equal(seen.body.data.status, 'refunded');
  assert.equal((await fx.api('GET', '/refund-requests/refundable', { as: 'bob' })).body.data.length, 0);
});

test('PATCH ข้อมูลผิด → 400 · ไม่มีคำขอนี้ → 404', async () => {
  const [any] = await refundsOf('alice');
  assert.equal((await decide('staff', any.refund_id, { action: 'delete' })).status, 400);
  assert.equal((await decide('staff', 999999999, { action: 'refund' })).status, 404);
  assert.equal((await fx.api('GET', '/admin/refund-requests/abc', { as: 'staff' })).body.error.code, 'INVALID_ID');
});
