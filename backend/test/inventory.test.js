// ทดสอบ API สต็อก (R3): POST /api/products/:id/stock และ GET /api/products/:id/stock-movements
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { pool, query, withTransaction } = require('../src/db/pool');
const { applyStockChange } = require('../src/modules/inventory/inventory.service');
const { createFixtures } = require('./helpers/r1-fixtures');

const TAG = 'zzr3stk';
const fx = createFixtures(TAG);
const u = {};
const p = {};

const stockOf = async (id) =>
  (await query('SELECT stock_quantity FROM product WHERE product_id = $1', [id])).rows[0].stock_quantity;
const change = (id, body, as = 'staff') => fx.api('POST', `/products/${id}/stock`, { as, body });

before(async () => {
  await fx.cleanup();
  u.staff = await fx.user('staff', { admin: 'staff' });
  u.alice = await fx.user('alice');
  p.a = await fx.product('a', { stock: 5 });
  p.b = await fx.product('b', { stock: 2 });
  p.c = await fx.product('c', { stock: 0 });
  await fx.start();
  for (const key of ['staff', 'alice']) await fx.login(key);
});

after(async () => {
  await fx.stop();
  await fx.cleanup();
  await pool.end();
});

test('ไม่ล็อกอิน → 401 · ลูกค้า → 403', async () => {
  assert.equal((await fx.api('POST', `/products/${p.a.id}/stock`, { body: { type: 'restock', quantity: 1 } })).status, 401);
  assert.equal((await change(p.a.id, { type: 'restock', quantity: 1 }, 'alice')).status, 403);
  assert.equal((await fx.api('GET', `/products/${p.a.id}/stock-movements`)).status, 401);
  assert.equal((await fx.api('GET', `/products/${p.a.id}/stock-movements`, { as: 'alice' })).status, 403);
  assert.equal(await stockOf(p.a.id), 5);
});

test('restock เพิ่มสต็อก + บันทึก ledger + log แอดมิน', async () => {
  const res = await change(p.a.id, { type: 'restock', quantity: 3, note: 'ของล็อตใหม่' });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.before, 5);
  assert.equal(res.body.data.after, 8);
  const m = res.body.data.movement;
  assert.equal(m.type, 'restock');
  assert.equal(m.qty_change, 3);
  assert.equal(m.balance_after, 8);
  assert.equal(m.note, 'ของล็อตใหม่');
  assert.equal(m.created_by.user_id, u.staff.id);
  assert.equal(await stockOf(p.a.id), 8);

  const [log] = await fx.logsOf(u.staff);
  assert.equal(log.action_type, 'adjust_stock');
  assert.equal(log.target_id, p.a.id);
  assert.match(log.note, /\+3 \(5 → 8\)/);
});

test('write_off ลดสต็อก · ต้องมีเหตุผล · ลดเกินที่มี → 409 ยอดไม่เปลี่ยน', async () => {
  const noReason = await change(p.a.id, { type: 'write_off', quantity: 1 });
  assert.equal(noReason.status, 400);
  assert.equal(noReason.body.error.details[0].field, 'note');

  const ok = await change(p.a.id, { type: 'write_off', quantity: 2, note: 'กล่องบุบ' });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.data.movement.qty_change, -2);
  assert.equal(await stockOf(p.a.id), 6);

  const tooMany = await change(p.b.id, { type: 'write_off', quantity: 3, note: 'หาย' });
  assert.equal(tooMany.status, 409);
  assert.equal(tooMany.body.error.code, 'INSUFFICIENT_STOCK');
  assert.equal(await stockOf(p.b.id), 2);
});

test('adjust ใส่ยอดที่นับได้จริง → บันทึกส่วนต่าง · ยอดเท่าเดิม → 400 NO_CHANGE', async () => {
  const down = await change(p.b.id, { type: 'adjust', new_quantity: 0, note: 'นับสต็อกสิ้นเดือน' });
  assert.equal(down.status, 201);
  assert.equal(down.body.data.movement.qty_change, -2);
  assert.equal(down.body.data.after, 0);

  const up = await change(p.b.id, { type: 'adjust', new_quantity: 4, note: 'เจอของในโกดัง' });
  assert.equal(up.body.data.movement.qty_change, 4);

  const same = await change(p.b.id, { type: 'adjust', new_quantity: 4, note: 'นับซ้ำ' });
  assert.equal(same.status, 400);
  assert.equal(same.body.error.code, 'NO_CHANGE');
});

test('ข้อมูลผิด → 400 พร้อมบอกช่อง · sale/return ทำผ่าน API นี้ไม่ได้ · สินค้าไม่มี → 404', async () => {
  const cases = [
    [{ type: 'sale', quantity: 1 }, 'type'],
    [{ type: 'return', quantity: 1 }, 'type'],
    [{ type: 'restock', quantity: 0 }, 'quantity'],
    [{ type: 'restock', quantity: -2 }, 'quantity'],
    [{ type: 'restock', quantity: 1.5 }, 'quantity'],
    [{ type: 'adjust', new_quantity: -1, note: 'x' }, 'new_quantity'],
    [{ type: 'restock', quantity: 1, note: 'ก'.repeat(301) }, 'note'],
  ];
  for (const [body, field] of cases) {
    const res = await change(p.c.id, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.error.details[0].field, field, JSON.stringify(body));
  }
  assert.equal((await change(999999999, { type: 'restock', quantity: 1 })).status, 404);
  assert.equal((await change('abc', { type: 'restock', quantity: 1 })).status, 400);
  assert.equal(await stockOf(p.c.id), 0);
});

test('เติมจนเกิน 100000 → 400', async () => {
  const res = await change(p.c.id, { type: 'restock', quantity: 100000 });
  assert.equal(res.status, 201);
  const over = await change(p.c.id, { type: 'restock', quantity: 1 });
  assert.equal(over.status, 400);
  await change(p.c.id, { type: 'adjust', new_quantity: 0, note: 'คืนค่าเดิม' });
});

test('GET stock-movements ใหม่สุดก่อน · กรอง type · แบ่งหน้า · ยอดปัจจุบันใน meta', async () => {
  const res = await fx.api('GET', `/products/${p.a.id}/stock-movements`, { as: 'staff' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.map((m) => [m.type, m.qty_change, m.balance_after]), [
    ['write_off', -2, 6],
    ['restock', 3, 8],
  ]);
  assert.equal(res.body.meta.total, 2);
  assert.equal(res.body.meta.stock_quantity, 6);
  assert.equal(res.body.data[0].created_by.username, `${TAG}_staff`);

  const onlyRestock = await fx.api('GET', `/products/${p.a.id}/stock-movements?type=restock`, { as: 'staff' });
  assert.equal(onlyRestock.body.data.length, 1);

  const paged = await fx.api('GET', `/products/${p.a.id}/stock-movements?pageSize=1&page=2`, { as: 'staff' });
  assert.deepEqual(paged.body.data.map((m) => m.type), ['restock']);

  assert.equal((await fx.api('GET', `/products/${p.a.id}/stock-movements?type=gift`, { as: 'staff' })).status, 400);
  assert.equal((await fx.api('GET', `/products/${p.a.id}/stock-movements?pageSize=500`, { as: 'staff' })).status, 400);
  assert.equal((await fx.api('GET', '/products/999999999/stock-movements', { as: 'staff' })).status, 404);
});

test('ประวัติรวมรายการจากระบบอื่นด้วย (คืนสินค้าของ R1 มี order_id)', async () => {
  const order = await fx.order(u.alice, [{ product: p.a, qty: 1 }]);
  await withTransaction((client) =>
    applyStockChange(client, {
      productId: p.a.id, type: 'return', change: 1, orderItemId: order.items[0].id,
      note: 'คืนสินค้า RF-TEST', actorId: u.staff.id,
    })
  );
  const res = await fx.api('GET', `/products/${p.a.id}/stock-movements?type=return`, { as: 'staff' });
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].order_id, order.id);
  assert.equal(res.body.data[0].balance_after, 7);
});

test('applyStockChange: ยิงพร้อมกันหลายคำขอ ยอดไม่เพี้ยนและไม่ติดลบ', async () => {
  // p.b มี 4 ชิ้น · ตัด 1 ชิ้นพร้อมกัน 6 คำขอ → สำเร็จ 4 ไม่พอ 2 · เหลือ 0
  const results = await Promise.all(
    Array.from({ length: 6 }, () => change(p.b.id, { type: 'write_off', quantity: 1, note: 'ทดสอบพร้อมกัน' }))
  );
  assert.equal(results.filter((r) => r.status === 201).length, 4);
  assert.equal(results.filter((r) => r.status === 409).length, 2);
  assert.equal(await stockOf(p.b.id), 0);
  const balances = (await fx.api('GET', `/products/${p.b.id}/stock-movements?type=write_off`, { as: 'staff' })).body.data.map(
    (m) => m.balance_after
  );
  assert.deepEqual(balances, [0, 1, 2, 3]);
});
