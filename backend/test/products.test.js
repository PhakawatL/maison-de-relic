// ทดสอบ API อ่านสินค้า (R3): GET /api/products และ GET /api/products/:id
// ใส่ข้อมูลทดสอบของตัวเองก่อน แล้วลบทิ้งตอนจบ (ชื่อสินค้ามีคำว่า zzr3test เพื่อกรองเฉพาะของเทสนี้)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const { pool, query } = require('../src/db/pool');

const TAG = 'zzr3test';
let server;
let base;
let adminId;
const ids = {};

async function insertProduct({ key, title, price, condition = 'good', status = 'available', stock = 1, categorySlug = 'figures', seriesSlug = null }) {
  const { rows } = await query(
    `INSERT INTO product (category_id, series_id, created_by, title, description, price, condition, status, stock_quantity)
     VALUES ((SELECT category_id FROM category WHERE slug = $1),
             (SELECT series_id FROM series WHERE slug = $2),
             $3, $4, 'ของทดสอบ', $5, $6, $7, $8)
     RETURNING product_id`,
    [categorySlug, seriesSlug, adminId, `${title} ${TAG}`, price, condition, status, stock]
  );
  ids[key] = Number(rows[0].product_id);
}

async function cleanup() {
  await query(`DELETE FROM product_image WHERE product_id IN (SELECT product_id FROM product WHERE title LIKE $1)`, [`%${TAG}%`]);
  await query(`DELETE FROM product WHERE title LIKE $1`, [`%${TAG}%`]);
  await query(`DELETE FROM admin WHERE user_id IN (SELECT user_id FROM "user" WHERE username = $1)`, [`${TAG}_admin`]);
  await query(`DELETE FROM "user" WHERE username = $1`, [`${TAG}_admin`]);
}

const get = async (path) => {
  const res = await fetch(`${base}/api${path}`);
  return { status: res.status, body: await res.json() };
};

before(async () => {
  await cleanup(); // เผื่อรอบก่อนพังกลางทาง
  const u = await query(
    `INSERT INTO "user" (username, email, password_hash, first_name, last_name, display_name)
     VALUES ($1, $2, 'x', 'R3', 'Test', 'R3 Test') RETURNING user_id`,
    [`${TAG}_admin`, `${TAG}@example.com`]
  );
  adminId = u.rows[0].user_id;
  await query('INSERT INTO admin (user_id) VALUES ($1)', [adminId]);

  await insertProduct({ key: 'gundam', title: 'RX-78-2 Gundam', price: 1500, condition: 'like_new', categorySlug: 'model-kits', seriesSlug: 'gundam' });
  await insertProduct({ key: 'luffy', title: 'Luffy Figure', price: 3200, condition: 'new', categorySlug: 'figures', seriesSlug: 'one-piece', stock: 0 });
  await insertProduct({ key: 'pika', title: 'Pikachu Card', price: 250, condition: 'excellent', categorySlug: 'trading-cards', seriesSlug: 'pokemon-tcg' });
  await insertProduct({ key: 'draft', title: 'Draft Item', price: 999, status: 'draft' });
  await insertProduct({ key: 'hidden', title: 'Hidden Item', price: 999, status: 'hidden' });

  await query(
    `INSERT INTO product_image (product_id, seq, url, alt_text, is_cover) VALUES
       ($1, 2, 'https://example.com/back.jpg', 'ด้านหลัง', FALSE),
       ($1, 1, 'https://example.com/front.jpg', 'ด้านหน้า', TRUE)`,
    [ids.gundam]
  );

  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await cleanup();
  await pool.end();
});

test('รายการสินค้า: เห็นเฉพาะ available ไม่เห็น draft/hidden', async () => {
  const { status, body } = await get(`/products?q=${TAG}`);
  assert.equal(status, 200);
  const got = body.data.map((p) => p.product_id).sort();
  assert.deepEqual(got, [ids.gundam, ids.luffy, ids.pika].sort());
  assert.deepEqual(body.meta, { page: 1, pageSize: 20, total: 3 });
});

test('รายการสินค้า: รูปแบบข้อมูลแต่ละชิ้น', async () => {
  const { body } = await get(`/products?q=RX-78-2 Gundam ${TAG}`);
  const p = body.data[0];
  assert.equal(p.product_id, ids.gundam);
  assert.equal(p.price, 1500); // เป็นตัวเลข ไม่ใช่ string
  assert.equal(p.condition, 'like_new');
  assert.equal(p.condition_score, 8);
  assert.equal(p.in_stock, true);
  assert.equal(p.category.slug, 'model-kits');
  assert.equal(p.series.slug, 'gundam');
  assert.equal(p.embedding, undefined);
  assert.equal(p.search_tsv, undefined);
});

test('กรองตามหมวดหมู่ (slug และ id) และซีรีส์', async () => {
  const bySlug = await get(`/products?q=${TAG}&category=trading-cards`);
  assert.deepEqual(bySlug.body.data.map((p) => p.product_id), [ids.pika]);

  const cat = await query(`SELECT category_id FROM category WHERE slug = 'trading-cards'`);
  const byId = await get(`/products?q=${TAG}&category=${cat.rows[0].category_id}`);
  assert.deepEqual(byId.body.data.map((p) => p.product_id), [ids.pika]);

  const bySeries = await get(`/products?q=${TAG}&series=one-piece`);
  assert.deepEqual(bySeries.body.data.map((p) => p.product_id), [ids.luffy]);
});

test('กรองราคา สภาพ และเฉพาะที่มีของ', async () => {
  const price = await get(`/products?q=${TAG}&minPrice=1000&maxPrice=2000`);
  assert.deepEqual(price.body.data.map((p) => p.product_id), [ids.gundam]);

  const cond = await get(`/products?q=${TAG}&condition=new`);
  assert.deepEqual(cond.body.data.map((p) => p.product_id), [ids.luffy]);

  const stock = await get(`/products?q=${TAG}&inStock=true`);
  assert.ok(!stock.body.data.some((p) => p.product_id === ids.luffy));
  assert.equal(stock.body.meta.total, 2);
});

test('เรียงราคาและแบ่งหน้า', async () => {
  const asc = await get(`/products?q=${TAG}&sort=price_asc`);
  assert.deepEqual(asc.body.data.map((p) => p.price), [250, 1500, 3200]);

  const page2 = await get(`/products?q=${TAG}&sort=price_desc&pageSize=2&page=2`);
  assert.deepEqual(page2.body.data.map((p) => p.price), [250]);
  assert.deepEqual(page2.body.meta, { page: 2, pageSize: 2, total: 3 });
});

test('query ผิด → 400 VALIDATION_ERROR บอกช่องที่ผิด', async () => {
  const { status, body } = await get('/products?sort=cheap&pageSize=500&condition=broken&minPrice=-1');
  assert.equal(status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  const fields = body.error.details.map((d) => d.field).sort();
  assert.deepEqual(fields, ['condition', 'minPrice', 'pageSize', 'sort']);
});

test('ดูสินค้า 1 ชิ้น: มีรายละเอียดและรูปเรียงตาม seq', async () => {
  const { status, body } = await get(`/products/${ids.gundam}`);
  assert.equal(status, 200);
  assert.equal(body.data.product_id, ids.gundam);
  assert.equal(body.data.description, 'ของทดสอบ');
  assert.deepEqual(body.data.attributes, {});
  assert.deepEqual(body.data.images.map((i) => i.seq), [1, 2]);
  assert.equal(body.data.images[0].is_cover, true);
});

test('ดูสินค้าที่ไม่ได้ขาย / ไม่มีอยู่ → 404, id ผิดรูปแบบ → 400', async () => {
  for (const id of [ids.draft, ids.hidden, 999999999]) {
    const { status, body } = await get(`/products/${id}`);
    assert.equal(status, 404, `id ${id}`);
    assert.equal(body.error.code, 'PRODUCT_NOT_FOUND');
  }
  const bad = await get('/products/abc');
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'INVALID_ID');
});
