// ทดสอบ wishlist (R1 · #6): /api/wishlist
// สร้างผู้ใช้และสินค้าทดสอบของตัวเองก่อน แล้วลบทิ้งตอนจบ
// (username / ชื่อสินค้ามีคำว่า zzr1wish เพื่อกรองเฉพาะของเทสนี้ ไม่ไปยุ่งกับ seed)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const app = require('../src/app');
const { pool, query } = require('../src/db/pool');

const TAG = 'zzr1wish';
const PASSWORD = 'Test@1234';
const users = {};
const tokens = {};
const products = {};
let server;
let base;

async function insertUser(key, { verified = true, admin = false } = {}) {
  const hash = await bcrypt.hash(PASSWORD, 4);
  const { rows } = await query(
    `INSERT INTO "user" (username, email, password_hash, first_name, last_name, display_name, is_email_verified)
     VALUES ($1, $2, $3, 'R1', 'Wishlist', $1, $4) RETURNING user_id`,
    [`${TAG}_${key}`, `${TAG}_${key}@example.com`, hash, verified]
  );
  users[key] = Number(rows[0].user_id);
  if (admin) await query(`INSERT INTO admin (user_id, admin_role) VALUES ($1, 'staff')`, [users[key]]);
}

async function insertProduct(key, { status = 'available', stock = 1, price = 1000 } = {}) {
  const { rows } = await query(
    `INSERT INTO product (category_id, created_by, title, price, condition, status, stock_quantity)
     VALUES ((SELECT category_id FROM category ORDER BY category_id LIMIT 1), $1, $2, $3, 'like_new', $4, $5)
     RETURNING product_id`,
    [users.seller, `${key} ${TAG}`, price, status, stock]
  );
  products[key] = Number(rows[0].product_id);
}

const setStatus = (key, status) =>
  query('UPDATE product SET status = $1 WHERE product_id = $2', [status, products[key]]);

async function cleanup() {
  // ลบสินค้าก่อน (wishlist ถูกลบตาม ON DELETE CASCADE) แล้วค่อยลบผู้ใช้
  await query('DELETE FROM product WHERE title LIKE $1', [`%${TAG}`]);
  await query(`DELETE FROM "user" WHERE username LIKE $1`, [`${TAG}\\_%`]);
}

async function api(method, path, { as, body } = {}) {
  const headers = {};
  if (as) headers.Authorization = `Bearer ${tokens[as]}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

const add = (as, productKey) => api('POST', '/wishlist', { as, body: { product_id: products[productKey] } });
const listIds = async (as) => (await api('GET', '/wishlist/ids', { as })).body.data;

before(async () => {
  await cleanup();
  await insertUser('seller', { admin: true });
  await insertUser('alice');
  await insertUser('bob');
  await insertUser('newbie', { verified: false });

  await insertProduct('gundam');
  await insertProduct('labubu');
  await insertProduct('soldout', { stock: 0 });
  await insertProduct('draft', { status: 'draft' });
  await insertProduct('card');

  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  for (const key of ['alice', 'bob', 'newbie']) {
    const res = await api('POST', '/auth/login', { body: { username: `${TAG}_${key}`, password: PASSWORD } });
    tokens[key] = res.body.data.token;
  }
});

after(async () => {
  server.close();
  await cleanup();
  await pool.end();
});

// ---------- สิทธิ์ ----------

test('ไม่ล็อกอิน → 401 ทุก route', async () => {
  for (const [method, path, body] of [
    ['GET', '/wishlist'],
    ['GET', '/wishlist/ids'],
    ['POST', '/wishlist', { product_id: products.gundam }],
    ['DELETE', `/wishlist/${products.gundam}`],
  ]) {
    const res = await api(method, path, { body });
    assert.equal(res.status, 401, `${method} ${path}`);
  }
});

test('ยังไม่ยืนยันอีเมล: ดูได้ (ว่าง) แต่เพิ่ม / เอาออกไม่ได้ → 403 EMAIL_NOT_VERIFIED', async () => {
  const list = await api('GET', '/wishlist', { as: 'newbie' });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body, { data: [], meta: { total: 0 } });

  const added = await add('newbie', 'gundam');
  assert.equal(added.status, 403);
  assert.equal(added.body.error.code, 'EMAIL_NOT_VERIFIED');

  const removed = await api('DELETE', `/wishlist/${products.gundam}`, { as: 'newbie' });
  assert.equal(removed.status, 403);
});

// ---------- เพิ่ม ----------

test('เพิ่มสินค้า → 201 ได้สินค้าแบบเดียวกับ GET /products พร้อม added_at', async () => {
  const { status, body } = await add('alice', 'gundam');
  assert.equal(status, 201);
  assert.equal(body.data.product_id, products.gundam);
  assert.equal(body.data.title, `gundam ${TAG}`);
  assert.equal(body.data.price, 1000);
  assert.equal(body.data.in_stock, true);
  assert.equal(typeof body.data.category.slug, 'string');
  assert.ok(body.data.added_at);
});

test('กดถูกใจซ้ำ → 200 ไม่ error ไม่เพิ่มซ้ำ และ added_at เดิม', async () => {
  const first = (await api('GET', '/wishlist', { as: 'alice' })).body.data[0];
  const again = await add('alice', 'gundam');
  assert.equal(again.status, 200);
  assert.equal(again.body.data.added_at, first.added_at);
  assert.deepEqual(await listIds('alice'), [products.gundam]);
});

test('รับ product_id เป็นข้อความตัวเลขได้ (เช่นอ่านมาจาก URL)', async () => {
  const res = await api('POST', '/wishlist', { as: 'alice', body: { product_id: String(products.labubu) } });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.product_id, products.labubu);
});

test('product_id ไม่ส่ง / ผิดรูปแบบ → 400 VALIDATION_ERROR', async () => {
  for (const body of [{}, { product_id: 'abc' }, { product_id: 0 }, { product_id: -3 }, { product_id: 1.5 }, { product_id: null }]) {
    const res = await api('POST', '/wishlist', { as: 'alice', body });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.equal(res.body.error.details[0].field, 'product_id');
  }
});

test('สินค้าที่ไม่มีอยู่ หรือยังเป็น draft → 404 PRODUCT_NOT_FOUND', async () => {
  for (const id of [999999999, products.draft]) {
    const res = await api('POST', '/wishlist', { as: 'alice', body: { product_id: id } });
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'PRODUCT_NOT_FOUND');
  }
});

// ---------- ดูรายการ ----------

test('รายการ: ถูกใจล่าสุดขึ้นก่อน สินค้าหมดยังแสดง (in_stock = false)', async () => {
  await add('alice', 'soldout');
  const { status, body } = await api('GET', '/wishlist', { as: 'alice' });
  assert.equal(status, 200);
  assert.deepEqual(
    body.data.map((p) => p.product_id),
    [products.soldout, products.labubu, products.gundam]
  );
  assert.equal(body.meta.total, 3);
  assert.equal(body.data[0].in_stock, false);
  assert.deepEqual(await listIds('alice'), [products.soldout, products.labubu, products.gundam]);
});

test('ไม่เห็น wishlist ของคนอื่น', async () => {
  await add('bob', 'card');
  assert.deepEqual(await listIds('bob'), [products.card]);
  assert.ok(!(await listIds('alice')).includes(products.card));
});

test('สินค้าถูกซ่อน → หายจากรายการ · เปิดขายอีกครั้ง → กลับมาเอง', async () => {
  await setStatus('labubu', 'hidden');
  assert.ok(!(await listIds('alice')).includes(products.labubu));
  const list = await api('GET', '/wishlist', { as: 'alice' });
  assert.equal(list.body.meta.total, 2);

  await setStatus('labubu', 'available');
  assert.ok((await listIds('alice')).includes(products.labubu));
});

// ---------- เอาออก ----------

test('เอาออก → 204 และหายจากรายการ · เอาออกซ้ำก็ยัง 204', async () => {
  const first = await api('DELETE', `/wishlist/${products.gundam}`, { as: 'alice' });
  assert.equal(first.status, 204);
  assert.ok(!(await listIds('alice')).includes(products.gundam));

  const again = await api('DELETE', `/wishlist/${products.gundam}`, { as: 'alice' });
  assert.equal(again.status, 204);
});

test('เอาออกของคนอื่นไม่ได้: ลบได้แค่ของตัวเอง ของ bob ยังอยู่', async () => {
  const res = await api('DELETE', `/wishlist/${products.card}`, { as: 'alice' });
  assert.equal(res.status, 204);
  assert.deepEqual(await listIds('bob'), [products.card]);
});

test('รหัสสินค้าใน URL ผิดรูปแบบ → 400 INVALID_ID', async () => {
  for (const raw of ['abc', '0', '-1', '1.5']) {
    const res = await api('DELETE', `/wishlist/${raw}`, { as: 'alice' });
    assert.equal(res.status, 400, raw);
    assert.equal(res.body.error.code, 'INVALID_ID');
  }
});
