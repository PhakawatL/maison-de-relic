// ทดสอบสรุปยอดขาย (R3): GET /api/admin/sales-summary
// คำสั่งซื้อทดสอบย้ายไปอยู่ปี 2001 ให้หมด จะได้ไม่ปนกับคำสั่งซื้ออื่นในฐานข้อมูล (สรุปยอดนับทุกคำสั่งซื้อในช่วง)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { pool, query } = require('../src/db/pool');
const { createFixtures } = require('./helpers/r1-fixtures');
const { todayInBangkok } = require('../src/modules/sales/sales.controller');

const TAG = 'zzr3sale';
const fx = createFixtures(TAG);
const u = {};
const p = {};

// ย้ายคำสั่งซื้อไปเวลาที่กำหนด (UTC) — ทดสอบการนับวันตามเวลาไทยด้วย
const placeAt = (orderId, iso) => query('UPDATE "order" SET placed_at = $2 WHERE order_id = $1', [orderId, iso]);
const summary = (qs, as = 'staff') => fx.api('GET', `/admin/sales-summary${qs}`, { as });

before(async () => {
  await fx.cleanup();
  u.staff = await fx.user('staff', { admin: 'staff' });
  u.alice = await fx.user('alice');
  u.bob = await fx.user('bob');
  p.card = await fx.product('card', { price: 1000 });
  p.figure = await fx.product('figure', { price: 300 });
  // หมวดต่างกัน จะได้เห็นยอดตามหมวด
  const cats = (await query('SELECT category_id FROM category ORDER BY category_id LIMIT 2')).rows.map((r) => r.category_id);
  await query('UPDATE product SET category_id = $2 WHERE product_id = $1', [p.card.id, cats[0]]);
  await query('UPDATE product SET category_id = $2 WHERE product_id = $1', [p.figure.id, cats[1]]);
  p.cats = cats.map(Number);

  // ช่วงหลัก 2001-01-10 ถึง 2001-01-12
  const o1 = await fx.order(u.alice, [{ product: p.card, qty: 1 }, { product: p.figure, qty: 2 }]); // 1600
  await placeAt(o1.id, '2001-01-10T03:00:00Z'); // 10:00 ไทย วันที่ 10
  const o2 = await fx.order(u.bob, [{ product: p.card, qty: 2 }], { status: 'shipped' }); // 2000
  await placeAt(o2.id, '2001-01-11T18:30:00Z'); // 01:30 ไทย ของวันที่ 12 (ไม่ใช่ 11)
  const o3 = await fx.order(u.alice, [{ product: p.figure, qty: 1 }], { status: 'refunded' }); // 300 ยังนับยอดขาย
  await placeAt(o3.id, '2001-01-12T05:00:00Z');
  const cancelled = await fx.order(u.bob, [{ product: p.card, qty: 5 }], { status: 'cancelled' }); // 5000 ไม่นับ
  await placeAt(cancelled.id, '2001-01-11T05:00:00Z');
  // คืนเงิน 300 โอนคืนวันที่ 12 → หักออกจากยอดสุทธิ
  await query(
    `INSERT INTO refund_request (order_item_id, reason, refund_qty, amount, status, restock_decision, requested_at, resolved_at)
     VALUES ($1, 'ทดสอบ', 1, 300, 'refunded', 'return', '2001-01-12T06:00:00Z', '2001-01-12T07:00:00Z')`,
    [o3.items[0].id]
  );
  // ช่วงก่อนหน้า (2001-01-07 ถึง 09) มี 1 คำสั่งซื้อ 1000
  const prev = await fx.order(u.bob, [{ product: p.card, qty: 1 }]);
  await placeAt(prev.id, '2001-01-08T05:00:00Z');

  await fx.start();
  for (const key of ['staff', 'alice']) await fx.login(key);
});

after(async () => {
  await fx.stop();
  await query(
    `DELETE FROM refund_request WHERE order_item_id IN
       (SELECT oi.order_item_id FROM order_item oi JOIN product p ON p.product_id = oi.product_id WHERE p.title LIKE $1)`,
    [`%${TAG}`]
  );
  await fx.cleanup();
  await pool.end();
});

test('ไม่ล็อกอิน → 401 · ลูกค้า → 403', async () => {
  assert.equal((await fx.api('GET', '/admin/sales-summary')).status, 401);
  assert.equal((await summary('', 'alice')).status, 403);
});

test('ไม่ส่งช่วง → 30 วันล่าสุดถึงวันนี้ (เวลาไทย)', async () => {
  const res = await summary('');
  assert.equal(res.status, 200);
  const { range, daily } = res.body.data;
  assert.equal(range.to, todayInBangkok());
  assert.equal(range.days, 30);
  assert.equal(daily.length, 30);
  assert.equal(daily.at(-1).date, range.to);
});

test('ยอดรวม: ไม่นับ cancelled · refunded ยังนับยอดขายแล้วหักในคืนเงิน · เทียบช่วงก่อนหน้า', async () => {
  const res = await summary('?from=2001-01-10&to=2001-01-12');
  assert.equal(res.status, 200);
  const d = res.body.data;
  assert.deepEqual(d.range, { from: '2001-01-10', to: '2001-01-12', days: 3 });
  assert.deepEqual(d.previous_range, { from: '2001-01-07', to: '2001-01-09' });
  assert.deepEqual(d.totals, {
    gross: 3900, refunds: 300, net: 3600, orders: 3, units: 6, customers: 2, avg_order: 1300, refund_count: 1,
  });
  assert.equal(d.previous.gross, 1000);
  assert.equal(d.previous.orders, 1);
});

test('รายวันนับตามเวลาไทย และเติม 0 วันที่ไม่มียอด', async () => {
  const d = (await summary('?from=2001-01-09&to=2001-01-13')).body.data;
  assert.deepEqual(
    d.daily.map((x) => [x.date, x.orders, x.gross]),
    [
      ['2001-01-09', 0, 0],
      ['2001-01-10', 1, 1600],
      ['2001-01-11', 0, 0], // คำสั่งซื้อ 18:30 UTC วันที่ 11 = 01:30 วันที่ 12 ในไทย · cancelled ไม่นับ
      ['2001-01-12', 2, 2300],
      ['2001-01-13', 0, 0],
    ]
  );
});

test('สินค้าขายดีเรียงตามยอดเงิน · ยอดตามหมวดพร้อมสัดส่วน · แยกตามสถานะรวม cancelled', async () => {
  const d = (await summary('?from=2001-01-10&to=2001-01-12')).body.data;
  assert.deepEqual(
    d.top_products.map((x) => [x.product_id, x.units, x.revenue, x.orders]),
    [
      [p.card.id, 3, 3000, 2],
      [p.figure.id, 3, 900, 2],
    ]
  );
  assert.deepEqual(
    d.categories.map((c) => [c.category_id, c.revenue, c.share]),
    [
      [p.cats[0], 3000, 76.9],
      [p.cats[1], 900, 23.1],
    ]
  );
  const status = Object.fromEntries(d.by_status.map((s) => [s.status, s.orders]));
  assert.deepEqual(status, { delivered: 1, shipped: 1, refunded: 1, cancelled: 1 });

  const top1 = (await summary('?from=2001-01-10&to=2001-01-12&top=1')).body.data;
  assert.equal(top1.top_products.length, 1);
});

test('ช่วงที่ไม่มีคำสั่งซื้อ → ตัวเลขเป็น 0 ไม่ error', async () => {
  const d = (await summary('?from=1999-03-01&to=1999-03-02')).body.data;
  assert.equal(d.totals.gross, 0);
  assert.equal(d.totals.avg_order, 0);
  assert.deepEqual(d.top_products, []);
  assert.deepEqual(d.categories, []);
});

test('ช่วงวันที่ผิด → 400 พร้อมบอกช่อง', async () => {
  const cases = [
    ['?from=2001-13-01&to=2001-12-31', 'from'],
    ['?from=2001-02-30&to=2001-03-01', 'from'],
    ['?from=2001/01/01&to=2001-01-02', 'from'],
    ['?from=2001-01-10&to=2001-01-01', 'from'],
    ['?from=2000-01-01&to=2001-01-31', 'to'],
    ['?from=2001-01-01&to=2001-01-02&top=0', 'top'],
    ['?from=2001-01-01&to=2001-01-02&top=99', 'top'],
  ];
  for (const [qs, field] of cases) {
    const res = await summary(qs);
    assert.equal(res.status, 400, qs);
    assert.equal(res.body.error.details[0].field, field, qs);
  }
});
