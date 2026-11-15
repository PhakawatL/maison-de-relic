// ทดสอบ API จัดการสินค้าของแอดมิน (R3): /api/admin/products และ POST / PUT / DELETE /api/products
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { pool, query } = require('../src/db/pool');
const { createFixtures } = require('./helpers/r1-fixtures');

const TAG = 'zzr3adm';
const fx = createFixtures(TAG);
const u = {};
const p = {};
let categoryId;
let seriesId;

/** body ที่ถูกต้องครบทุกช่อง (ชื่อลงท้ายด้วย TAG ให้ cleanup ลบเจอ) */
const validBody = (overrides = {}) => ({
  title: `Gundam RX-78 ${TAG}`,
  description: 'กล่องครบ',
  category_id: categoryId,
  series_id: seriesId,
  status: 'draft',
  condition: 'like_new',
  price: 1500,
  stock_quantity: 2,
  attributes: { year: '2020', original_box: 'yes' },
  ...overrides,
});

const movementsOf = async (id) =>
  (
    await query(
      'SELECT movement_type, qty_change, balance_after FROM stock_movement WHERE product_id = $1 ORDER BY movement_id',
      [id]
    )
  ).rows;

before(async () => {
  await fx.cleanup();
  categoryId = Number((await query('SELECT category_id FROM category ORDER BY category_id LIMIT 1')).rows[0].category_id);
  seriesId = Number((await query('SELECT series_id FROM series ORDER BY series_id LIMIT 1')).rows[0].series_id);

  u.boss = await fx.user('boss', { admin: 'owner' });
  u.staff = await fx.user('staff', { admin: 'staff' });
  u.alice = await fx.user('alice');

  p.live = await fx.product('live', { status: 'available', createdBy: u.boss.id });
  p.hidden = await fx.product('hidden', { status: 'hidden', createdBy: u.boss.id });
  p.draft = await fx.product('draft', { status: 'draft', createdBy: u.boss.id });
  p.sold = await fx.product('sold', { status: 'available', stock: 1, createdBy: u.boss.id });
  await fx.order(u.alice, [{ product: p.sold, qty: 1 }]);

  await fx.start();
  for (const key of ['boss', 'staff', 'alice']) await fx.login(key);
});

after(async () => {
  await fx.stop();
  await fx.cleanup();
  await pool.end();
});

// ---------- สิทธิ์ ----------

test('ไม่ล็อกอิน → 401 · ลูกค้า → 403 ทุก endpoint ของแอดมิน', async () => {
  const calls = [
    ['GET', '/admin/products'],
    ['GET', `/admin/products/${p.draft.id}`],
    ['POST', '/products', validBody()],
    ['PUT', `/products/${p.live.id}`, validBody()],
    ['DELETE', `/products/${p.live.id}`],
  ];
  for (const [method, path, body] of calls) {
    assert.equal((await fx.api(method, path, { body })).status, 401, `${method} ${path} ไม่ล็อกอิน`);
    assert.equal((await fx.api(method, path, { as: 'alice', body })).status, 403, `${method} ${path} ลูกค้า`);
  }
});

// ---------- อ่าน ----------

test('GET /admin/products เห็นทุกสถานะ และกรอง status ได้', async () => {
  const all = await fx.api('GET', '/admin/products', { as: 'staff' });
  assert.equal(all.status, 200);

  const mine = await fx.api('GET', `/admin/products?q=${TAG}&pageSize=50`, { as: 'staff' });
  const statuses = mine.body.data.map((x) => x.status).sort();
  assert.deepEqual(statuses, ['available', 'available', 'draft', 'hidden']);
  assert.equal(mine.body.meta.total, 4);

  const drafts = await fx.api('GET', `/admin/products?q=${TAG}&status=draft`, { as: 'staff' });
  assert.deepEqual(drafts.body.data.map((x) => x.product_id), [p.draft.id]);

  const bad = await fx.api('GET', '/admin/products?status=sold', { as: 'staff' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.details[0].field, 'status');
});

test('หน้าร้านยังเห็นแค่ available (ไม่รับ ?status)', async () => {
  const res = await fx.api('GET', `/products?q=${TAG}&status=draft&pageSize=50`);
  assert.equal(res.status, 200);
  assert.ok(res.body.data.every((x) => x.status === 'available'));
  assert.equal((await fx.api('GET', `/products/${p.draft.id}`)).status, 404);
});

test('GET /admin/products/:id เปิดสินค้าซ่อนได้ และบอก has_orders', async () => {
  const hidden = await fx.api('GET', `/admin/products/${p.hidden.id}`, { as: 'staff' });
  assert.equal(hidden.status, 200);
  assert.equal(hidden.body.data.status, 'hidden');
  assert.equal(hidden.body.data.has_orders, false);
  assert.ok(Array.isArray(hidden.body.data.images));

  const sold = await fx.api('GET', `/admin/products/${p.sold.id}`, { as: 'staff' });
  assert.equal(sold.body.data.has_orders, true);

  assert.equal((await fx.api('GET', '/admin/products/999999999', { as: 'staff' })).status, 404);
  assert.equal((await fx.api('GET', '/admin/products/abc', { as: 'staff' })).status, 400);
});

// ---------- เพิ่ม ----------

test('POST /products เพิ่มสินค้า + บันทึกสต็อกตั้งต้น + log', async () => {
  const res = await fx.api('POST', '/products', { as: 'staff', body: validBody() });
  assert.equal(res.status, 201);
  const d = res.body.data;
  assert.equal(d.title, `Gundam RX-78 ${TAG}`);
  assert.equal(d.status, 'draft');
  assert.equal(d.price, 1500);
  assert.equal(d.stock_quantity, 2);
  assert.equal(d.category.category_id, categoryId);
  assert.equal(d.series.series_id, seriesId);
  assert.deepEqual(d.attributes, { year: '2020', original_box: 'yes' });
  assert.equal(d.has_orders, false);

  const row = (await query('SELECT created_by FROM product WHERE product_id = $1', [d.product_id])).rows[0];
  assert.equal(Number(row.created_by), u.staff.id);

  assert.deepEqual(await movementsOf(d.product_id), [{ movement_type: 'restock', qty_change: 2, balance_after: 2 }]);
  const [log] = await fx.logsOf(u.staff);
  assert.equal(log.action_type, 'create_product');
  assert.equal(log.target_id, d.product_id);
});

test('POST สต็อก 0 → ไม่มี stock_movement · ไม่มีซีรีส์ได้', async () => {
  const res = await fx.api('POST', '/products', {
    as: 'boss',
    body: validBody({ title: `Card ${TAG}`, series_id: null, stock_quantity: 0, attributes: {} }),
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.series, null);
  assert.deepEqual(await movementsOf(res.body.data.product_id), []);
});

test('POST ข้อมูลผิด → 400 พร้อมบอกช่องที่ผิด', async () => {
  const res = await fx.api('POST', '/products', {
    as: 'staff',
    body: {
      title: '  ',
      category_id: 'x',
      status: 'sold',
      condition: 'broken',
      price: -1,
      stock_quantity: 1.5,
      attributes: { original_box: 'maybe', colour: 'red' },
    },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  const fields = res.body.error.details.map((d) => d.field).sort();
  assert.deepEqual(fields, ['category_id', 'colour', 'condition', 'original_box', 'price', 'status', 'stock_quantity', 'title']);
});

test('POST ราคาทศนิยมเกิน 2 ตำแหน่ง / หมวดที่ไม่มีจริง → 400', async () => {
  const price = await fx.api('POST', '/products', { as: 'staff', body: validBody({ price: 10.005 }) });
  assert.equal(price.status, 400);
  assert.equal(price.body.error.details[0].field, 'price');

  const ref = await fx.api('POST', '/products', {
    as: 'staff',
    body: validBody({ category_id: 999999999, series_id: 999999999 }),
  });
  assert.equal(ref.status, 400);
  assert.deepEqual(ref.body.error.details.map((d) => d.field).sort(), ['category_id', 'series_id']);
});

// ---------- แก้ไข ----------

test('PUT /products/:id แก้ทั้งก้อน + log · ไม่แตะสต็อก (stock_quantity ที่ส่งมาไม่สนใจ)', async () => {
  const created = (await fx.api('POST', '/products', { as: 'staff', body: validBody() })).body.data;
  const res = await fx.api('PUT', `/products/${created.product_id}`, {
    as: 'boss',
    body: validBody({
      title: `Gundam RX-78 Ver.Ka ${TAG}`,
      status: 'available',
      price: 1899.5,
      stock_quantity: 5,
      series_id: null,
      attributes: { grading_company: 'PSA', grade: '10' },
    }),
  });
  assert.equal(res.status, 200);
  const d = res.body.data;
  assert.equal(d.title, `Gundam RX-78 Ver.Ka ${TAG}`);
  assert.equal(d.status, 'available');
  assert.equal(d.price, 1899.5);
  assert.equal(d.series, null);
  assert.deepEqual(d.attributes, { grading_company: 'PSA', grade: '10' });
  assert.equal(d.stock_quantity, 2); // ยังเป็นยอดตั้งต้น ไม่ใช่ 5 ที่ส่งมา

  assert.deepEqual(await movementsOf(created.product_id), [{ movement_type: 'restock', qty_change: 2, balance_after: 2 }]);
  const [log] = await fx.logsOf(u.boss);
  assert.equal(log.action_type, 'update_product');

  // ไม่ส่ง stock_quantity เลยก็ได้ (หน้าแอดมินไม่ส่งแล้ว) · ส่งค่าแปลก ๆ ก็ไม่ error เพราะไม่ได้ใช้
  const { stock_quantity: _omit, ...noStock } = validBody({ title: `Gundam no stock ${TAG}` });
  assert.equal((await fx.api('PUT', `/products/${created.product_id}`, { as: 'boss', body: noStock })).status, 200);
  assert.equal((await fx.api('PUT', `/products/${created.product_id}`, { as: 'boss', body: validBody({ stock_quantity: -9 }) })).status, 200);
  assert.equal((await movementsOf(created.product_id)).length, 1);
});

test('bug #65: เปิดฟอร์มค้างไว้ ระหว่างนั้นคนอื่นเติมสต็อก → กดบันทึกแล้วสต็อกไม่ถูกทับ', async () => {
  const created = (await fx.api('POST', '/products', { as: 'staff', body: validBody({ stock_quantity: 4 }) })).body.data;
  // แอดมิน A เปิดหน้าแก้ไข (ได้สต็อก 4)
  const opened = (await fx.api('GET', `/admin/products/${created.product_id}`, { as: 'staff' })).body.data;
  assert.equal(opened.stock_quantity, 4);
  // แอดมิน B เติม +5 → 9
  const restock = await fx.api('POST', `/products/${created.product_id}/stock`, {
    as: 'boss', body: { type: 'restock', quantity: 5, note: 'ของล็อตใหม่' },
  });
  assert.equal(restock.body.data.after, 9);
  // A แก้แค่ราคา แล้วส่งค่าที่โหลดไว้ตอนเปิด (รวมสต็อก 4 แบบหน้าเว็บเวอร์ชันเก่า) กลับไป
  const saved = await fx.api('PUT', `/products/${created.product_id}`, {
    as: 'staff',
    body: validBody({ price: 1999, stock_quantity: opened.stock_quantity }),
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.data.price, 1999);
  assert.equal(saved.body.data.stock_quantity, 9);
  assert.deepEqual(
    (await movementsOf(created.product_id)).map((m) => m.movement_type),
    ['restock', 'restock'] // ไม่มีแถว adjust −5
  );
});

test('PUT ชื่อเปลี่ยน → ล้าง embedding (ให้ R4 คำนวณใหม่) · ราคาเปลี่ยนอย่างเดียวไม่ล้าง', async () => {
  const id = p.live.id;
  const vector = `[${Array(384).fill(0.01).join(',')}]`;
  const embeddingOf = async () =>
    (await query('SELECT embedding IS NOT NULL AS has FROM product WHERE product_id = $1', [id])).rows[0].has;
  const current = (await fx.api('GET', `/admin/products/${id}`, { as: 'staff' })).body.data;
  const same = {
    title: current.title,
    description: current.description,
    category_id: current.category.category_id,
    series_id: current.series?.series_id ?? null,
    status: current.status,
    condition: current.condition,
    stock_quantity: current.stock_quantity,
    attributes: current.attributes,
  };

  await query('UPDATE product SET embedding = $1::vector WHERE product_id = $2', [vector, id]);
  await fx.api('PUT', `/products/${id}`, { as: 'staff', body: { ...same, price: 777 } });
  assert.equal(await embeddingOf(), true);

  await fx.api('PUT', `/products/${id}`, { as: 'staff', body: { ...same, price: 777, title: `live renamed ${TAG}` } });
  assert.equal(await embeddingOf(), false);
});

test('PUT สินค้าที่ไม่มี → 404 · body ผิด → 400', async () => {
  assert.equal((await fx.api('PUT', '/products/999999999', { as: 'staff', body: validBody() })).status, 404);
  assert.equal((await fx.api('PUT', `/products/${p.draft.id}`, { as: 'staff', body: {} })).status, 400);
});

// ---------- ลบ ----------

test('DELETE สินค้าที่ไม่เคยขาย → ลบจริง (รวมประวัติสต็อก) + log', async () => {
  const created = (await fx.api('POST', '/products', { as: 'staff', body: validBody() })).body.data;
  const res = await fx.api('DELETE', `/products/${created.product_id}`, { as: 'staff' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, { product_id: created.product_id, result: 'deleted' });

  const left = await query('SELECT 1 FROM product WHERE product_id = $1', [created.product_id]);
  assert.equal(left.rows.length, 0);
  assert.deepEqual(await movementsOf(created.product_id), []);
  const [log] = await fx.logsOf(u.staff);
  assert.equal(log.action_type, 'delete_product');
  assert.equal(log.target_id, created.product_id);

  assert.equal((await fx.api('DELETE', `/products/${created.product_id}`, { as: 'staff' })).status, 404);
});

test('DELETE สินค้าที่เคยขายแล้ว → ซ่อนแทน คำสั่งซื้อยังอยู่ครบ', async () => {
  const res = await fx.api('DELETE', `/products/${p.sold.id}`, { as: 'boss' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, { product_id: p.sold.id, result: 'hidden' });

  const row = (await query('SELECT status FROM product WHERE product_id = $1', [p.sold.id])).rows[0];
  assert.equal(row.status, 'hidden');
  assert.equal((await fx.api('GET', `/products/${p.sold.id}`)).status, 404); // หน้าร้านไม่เห็นแล้ว
  const [log] = await fx.logsOf(u.boss);
  assert.equal(log.action_type, 'hide_product');
});
