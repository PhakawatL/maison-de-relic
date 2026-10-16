// ทดสอบ GET /api/categories และ GET /api/series (R3)
// ใส่สินค้าทดสอบเอง แล้วลบทิ้งตอนจบ (ชื่อมีคำว่า zzr3cat)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const { pool, query } = require('../src/db/pool');

const TAG = 'zzr3cat';
let server;
let base;
let baseline = {};

async function cleanup() {
  await query(`DELETE FROM product WHERE title LIKE $1`, [`%${TAG}%`]);
  await query(`DELETE FROM admin WHERE user_id IN (SELECT user_id FROM "user" WHERE username = $1)`, [`${TAG}_admin`]);
  await query(`DELETE FROM "user" WHERE username = $1`, [`${TAG}_admin`]);
}

const countsBySlug = (rows) => Object.fromEntries(rows.map((r) => [r.slug, r.product_count]));

before(async () => {
  await cleanup();
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  // จำจำนวนเดิมไว้ก่อน (ฐานข้อมูลอาจมีสินค้าจาก seed หรือ test อื่นอยู่แล้ว)
  baseline.categories = countsBySlug((await (await fetch(`${base}/api/categories`)).json()).data);
  baseline.series = countsBySlug((await (await fetch(`${base}/api/series`)).json()).data);

  const u = await query(
    `INSERT INTO "user" (username, email, password_hash, first_name, last_name, display_name)
     VALUES ($1, $2, 'x', 'R3', 'Cat', 'R3 Cat') RETURNING user_id`,
    [`${TAG}_admin`, `${TAG}@example.com`]
  );
  await query('INSERT INTO admin (user_id) VALUES ($1)', [u.rows[0].user_id]);

  // art-toys/pop-mart: available 2 ชิ้น + draft 1 ชิ้น (draft ต้องไม่ถูกนับ)
  for (const status of ['available', 'available', 'draft']) {
    await query(
      `INSERT INTO product (category_id, series_id, created_by, title, price, condition, status)
       VALUES ((SELECT category_id FROM category WHERE slug = 'art-toys'),
               (SELECT series_id FROM series WHERE slug = 'pop-mart'),
               $1, $2, 100, 'good', $3)`,
      [u.rows[0].user_id, `Item ${TAG}`, status]
    );
  }
});

after(async () => {
  server.close();
  await cleanup();
  await pool.end();
});

test('GET /api/categories → หมวดหมู่ทั้งหมดจาก seed พร้อมจำนวนสินค้าที่ขายอยู่', async () => {
  const res = await fetch(`${base}/api/categories`);
  assert.equal(res.status, 200);
  const { data } = await res.json();

  const slugs = data.map((c) => c.slug);
  for (const s of ['trading-cards', 'figures', 'model-kits', 'art-toys', 'comics-books', 'coins-stamps']) {
    assert.ok(slugs.includes(s), s);
  }
  const artToys = data.find((c) => c.slug === 'art-toys');
  assert.equal(typeof artToys.category_id, 'number');
  assert.equal(artToys.name, 'อาร์ตทอย');
  assert.equal(artToys.product_count, baseline.categories['art-toys'] + 2); // ไม่นับ draft
});

test('GET /api/series → ซีรีส์ทั้งหมดจาก seed พร้อมจำนวนสินค้าที่ขายอยู่', async () => {
  const res = await fetch(`${base}/api/series`);
  assert.equal(res.status, 200);
  const { data } = await res.json();

  const slugs = data.map((s) => s.slug);
  for (const s of ['pokemon-tcg', 'one-piece', 'gundam', 'dragon-ball', 'pop-mart']) {
    assert.ok(slugs.includes(s), s);
  }
  const popMart = data.find((s) => s.slug === 'pop-mart');
  assert.equal(typeof popMart.series_id, 'number');
  assert.equal(popMart.product_count, baseline.series['pop-mart'] + 2);
});
