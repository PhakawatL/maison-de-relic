// ทดสอบรีวิวสินค้า (R1 · #7): /api/reviews และ /api/products/:productId/reviews
// คำสั่งซื้อสร้างตรงในฐานข้อมูลด้วย fixtures (ระบบ checkout ของ R5 ยังไม่มี)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../src/db/pool');
const { createFixtures } = require('./helpers/r1-fixtures');
const { shortName } = require('../src/modules/reviews/reviews.service');

const fx = createFixtures('zzr1rv');
const u = {};
const p = {};
const o = {};

const write = (as, body) => fx.api('POST', '/reviews', { as, body });

before(async () => {
  await fx.cleanup();
  u.boss = await fx.user('boss', { admin: 'owner' });
  u.alice = await fx.user('alice', { firstName: 'อลิซ', lastName: 'ใจดี' });
  u.bob = await fx.user('bob', { firstName: 'บ็อบ', lastName: 'Builder' });
  u.newbie = await fx.user('newbie', { verified: false });

  p.gundam = await fx.product('gundam', { price: 1500, createdBy: u.boss.id });
  p.labubu = await fx.product('labubu', { price: 800, createdBy: u.boss.id });
  p.hidden = await fx.product('hidden', { status: 'hidden', createdBy: u.boss.id });

  o.aliceDelivered = await fx.order(u.alice, [{ product: p.gundam, qty: 1 }, { product: p.labubu, qty: 2 }]);
  o.aliceShipped = await fx.order(u.alice, [{ product: p.labubu, qty: 1 }], { status: 'shipped', deliveredDaysAgo: null });
  o.bobCompleted = await fx.order(u.bob, [{ product: p.gundam, qty: 1 }], { status: 'completed' });
  o.bobCancelled = await fx.order(u.bob, [{ product: p.labubu, qty: 1 }], { status: 'cancelled' });
  o.newbieDelivered = await fx.order(u.newbie, [{ product: p.gundam, qty: 1 }]);

  await fx.start();
  for (const key of ['alice', 'bob', 'newbie']) await fx.login(key);
});

after(async () => {
  await fx.stop();
  await fx.cleanup();
  await pool.end();
});

test('ชื่อผู้รีวิวแบบย่อ: ชื่อจริง + ตัวอักษรแรกของนามสกุล (ข้ามสระหน้า)', () => {
  assert.equal(shortName('สมชาย', 'กล้าหาญ'), 'สมชาย ก.');
  assert.equal(shortName('ปริยา', 'เมืองทอง'), 'ปริยา ม.');
  assert.equal(shortName('Bob', 'builder'), 'Bob b.');
  assert.equal(shortName('Solo', ''), 'Solo');
});

test('ไม่ล็อกอิน → 401 · ยังไม่ยืนยันอีเมล → 403', async () => {
  assert.equal((await write(undefined, { order_item_id: 1, rating: 5 })).status, 401);
  const res = await write('newbie', { order_item_id: o.newbieDelivered.items[0].id, rating: 5 });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'EMAIL_NOT_VERIFIED');
});

test('สินค้าที่รอรีวิว = ได้รับแล้วและยังไม่รีวิว (ไม่รวมที่ยังส่งไม่ถึง)', async () => {
  const { status, body } = await fx.api('GET', '/reviews/reviewable', { as: 'alice' });
  assert.equal(status, 200);
  assert.deepEqual(
    body.data.map((i) => i.order_item_id).sort((a, b) => a - b),
    o.aliceDelivered.items.map((i) => i.id).sort((a, b) => a - b)
  );
  assert.equal(body.data.find((i) => i.product_id === p.gundam.id).title, p.gundam.title);
});

test('เขียนรีวิว → 201 ชื่อแบบย่อ · คะแนนเฉลี่ยขึ้นในการ์ดสินค้า', async () => {
  const res = await write('alice', { order_item_id: o.aliceDelivered.items[0].id, rating: 5, comment: '  ตรงปก แพ็กมาดีมาก  ' });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.rating, 5);
  assert.equal(res.body.data.comment, 'ตรงปก แพ็กมาดีมาก');
  assert.equal(res.body.data.reviewer, 'อลิซ จ.');
  assert.equal(res.body.data.product_id, p.gundam.id);

  const bob = await write('bob', { order_item_id: o.bobCompleted.items[0].id, rating: 4 });
  assert.equal(bob.status, 201, 'completed ก็รีวิวได้');
  assert.equal(bob.body.data.comment, null);

  const product = await fx.api('GET', `/products/${p.gundam.id}`);
  assert.equal(product.body.data.avg_rating, 4.5);
  assert.equal(product.body.data.review_count, 2);
  const list = await fx.api('GET', `/products?q=${encodeURIComponent(p.labubu.title)}`);
  assert.equal(list.body.data[0].avg_rating, null, 'ยังไม่มีรีวิว = null');
  assert.equal(list.body.data[0].review_count, 0);
});

test('รีวิวซ้ำรายการเดิม → 409 ALREADY_REVIEWED และหายจากรายการรอรีวิว', async () => {
  const again = await write('alice', { order_item_id: o.aliceDelivered.items[0].id, rating: 1 });
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'ALREADY_REVIEWED');
  const pending = await fx.api('GET', '/reviews/reviewable', { as: 'alice' });
  assert.deepEqual(pending.body.data.map((i) => i.order_item_id), [o.aliceDelivered.items[1].id]);
});

test('ยังไม่ได้รับสินค้า / คำสั่งซื้อถูกยกเลิก → 409 ORDER_NOT_DELIVERED', async () => {
  const shipped = await write('alice', { order_item_id: o.aliceShipped.items[0].id, rating: 5 });
  assert.equal(shipped.status, 409);
  assert.equal(shipped.body.error.code, 'ORDER_NOT_DELIVERED');
  const cancelled = await write('bob', { order_item_id: o.bobCancelled.items[0].id, rating: 5 });
  assert.equal(cancelled.body.error.code, 'ORDER_NOT_DELIVERED');
});

test('สินค้าในคำสั่งซื้อของคนอื่น / ไม่มีอยู่ → 404 ORDER_ITEM_NOT_FOUND', async () => {
  const other = await write('bob', { order_item_id: o.aliceDelivered.items[1].id, rating: 5 });
  assert.equal(other.status, 404);
  assert.equal(other.body.error.code, 'ORDER_ITEM_NOT_FOUND');
  assert.equal((await write('bob', { order_item_id: 999999999, rating: 5 })).status, 404);
});

test('ข้อมูลผิดรูปแบบ → 400 บอกทุกช่อง', async () => {
  const res = await write('alice', { order_item_id: 'x', rating: 6, comment: 'ก'.repeat(1001) });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body.error.details.map((d) => d.field).sort(), ['comment', 'order_item_id', 'rating']);
  const zero = await write('alice', { order_item_id: o.aliceDelivered.items[1].id, rating: 0 });
  assert.equal(zero.status, 400);
});

test('หน้าร้าน: รีวิวของสินค้า ใหม่สุดก่อน + สรุปคะแนน + กรองตามดาว', async () => {
  const { status, body } = await fx.api('GET', `/products/${p.gundam.id}/reviews`);
  assert.equal(status, 200);
  assert.equal(body.meta.total, 2);
  assert.deepEqual(body.meta.summary, {
    average: 4.5,
    count: 2,
    distribution: { 5: 1, 4: 1, 3: 0, 2: 0, 1: 0 },
  });
  assert.deepEqual(body.data.map((r) => r.rating), [4, 5]);
  assert.equal(body.data[0].reviewer, 'บ็อบ B.');
  assert.ok(!('user_id' in body.data[0]) && !('order_item_id' in body.data[0]), 'ไม่เปิดเผยข้อมูลผู้ซื้อ');

  const fives = await fx.api('GET', `/products/${p.gundam.id}/reviews?rating=5`);
  assert.equal(fives.body.meta.total, 1);
  assert.deepEqual(fives.body.data.map((r) => r.rating), [5]);

  const empty = await fx.api('GET', `/products/${p.labubu.id}/reviews`);
  assert.deepEqual(empty.body.meta.summary, { average: null, count: 0, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } });
});

test('หน้าร้าน: สินค้าที่ซ่อน / ไม่มี → 404 · รหัสผิดรูปแบบ → 400', async () => {
  assert.equal((await fx.api('GET', `/products/${p.hidden.id}/reviews`)).status, 404);
  assert.equal((await fx.api('GET', '/products/999999999/reviews')).status, 404);
  assert.equal((await fx.api('GET', '/products/abc/reviews')).body.error.code, 'INVALID_ID');
  assert.equal((await fx.api('GET', `/products/${p.gundam.id}/reviews?rating=9`)).status, 400);
});

test('รีวิวของฉัน: มีชื่อสินค้า ณ วันที่ซื้อ', async () => {
  const { body } = await fx.api('GET', '/reviews/mine', { as: 'alice' });
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].title, p.gundam.title);
  assert.equal(body.data[0].order_id, o.aliceDelivered.id);
  assert.equal(body.data[0].product_available, true);
});
