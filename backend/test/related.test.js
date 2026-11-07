// ทดสอบ GET /api/recommend/related/:productId (R4) — สินค้าที่เกี่ยวข้อง
//
// ใช้ "เวกเตอร์ปลอม" ที่เขียนเอง ไม่ต้องโหลดโมเดล → รันบน CI ได้ทุก PR
// เวกเตอร์ 384 มิติ ใส่ค่าแค่ 1–2 ช่อง ที่เหลือเป็น 0 จึงรู้ล่วงหน้าว่าชิ้นไหนใกล้ชิ้นไหนเท่าไหร่
//   source      = [1, 0, 0, ...]                สินค้าตั้งต้น
//   near        = [0.95, 0.05, 0, ...]          ทิศเกือบเหมือน source  → similarity ≈ 0.999
//   mid         = [0.6, 0.8, 0, ...]            เอียงไปครึ่ง ๆ          → similarity = 0.6
//   far         = [0, 1, 0, ...]                ตั้งฉาก ไม่เกี่ยวกันเลย → similarity = 0
// (cosine ไม่สนความยาวเวกเตอร์ สนแค่ทิศ จึงไม่ต้อง normalize ให้ยาว 1)
// ชื่อสินค้ามีคำว่า zzr4rel ลบทิ้งตอนจบ
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const { pool, query } = require('../src/db/pool');
const { related } = require('../src/modules/recommend/recommend.service');

const TAG = 'zzr4rel';
const ids = {};
let server;
let base;

// สร้างเวกเตอร์ 384 มิติ จากค่าที่ให้ เช่น vector({ 0: 1 }) = [1, 0, 0, ...]
function vector(values) {
  const v = new Array(384).fill(0);
  for (const [i, x] of Object.entries(values)) v[i] = x;
  return `[${v.join(',')}]`; // รูปแบบข้อความที่ pgvector รับ
}

async function cleanup() {
  await query('DELETE FROM product WHERE title LIKE $1', [`%${TAG}`]);
  await query('DELETE FROM "user" WHERE username LIKE $1', [`${TAG}\\_%`]);
}

// สร้างสินค้าทดสอบ · values = ค่าเวกเตอร์ (null = ยังไม่มี embedding)
async function insertProduct(key, values, { status = 'available', stock = 1 } = {}) {
  const { rows } = await query(
    `INSERT INTO product (category_id, created_by, title, price, condition, status, stock_quantity, embedding)
     VALUES ((SELECT category_id FROM category ORDER BY category_id LIMIT 1), $1, $2, 900, 'good', $3, $4, $5::vector)
     RETURNING product_id`,
    [ids.admin, `${key} ${TAG}`, status, stock, values ? vector(values) : null]
  );
  ids[key] = Number(rows[0].product_id);
}

const getRelated = async (id, qs = '') => {
  const res = await fetch(`${base}/api/recommend/related/${id}${qs}`);
  return { status: res.status, body: await res.json() };
};

before(async () => {
  await cleanup();
  // สินค้าต้องมีแอดมินเป็นคนลง (product.created_by → admin)
  const { rows } = await query(
    `INSERT INTO "user" (username, email, password_hash, first_name, last_name, display_name, is_email_verified)
     VALUES ($1, $2, 'x', 'R4', 'Related', $1, TRUE) RETURNING user_id`,
    [`${TAG}_admin`, `${TAG}_admin@example.com`]
  );
  ids.admin = Number(rows[0].user_id);
  await query(`INSERT INTO admin (user_id, admin_role) VALUES ($1, 'staff')`, [ids.admin]);

  await insertProduct('source', { 0: 1 });
  await insertProduct('near', { 0: 0.95, 1: 0.05 });
  await insertProduct('mid', { 0: 0.6, 1: 0.8 });
  await insertProduct('far', { 1: 1 });
  // ใกล้ที่สุดแต่ขายไม่ได้ → ต้องไม่โผล่
  await insertProduct('nearHidden', { 0: 0.99, 1: 0.01 }, { status: 'hidden' });
  await insertProduct('nearSoldOut', { 0: 0.99, 1: 0.01 }, { stock: 0 });
  // ยังไม่มีเวกเตอร์ (เช่นเพิ่งลงสินค้า embedProduct ยังไม่เสร็จ)
  await insertProduct('noVector', null);
  // สินค้าตั้งต้นที่ถูกซ่อน → 404 เหมือน GET /products/:id
  await insertProduct('hiddenSource', { 0: 1 }, { status: 'hidden' });

  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await cleanup();
  server.close();
  await pool.end();
});

test('ชิ้นที่ใกล้ที่สุดมาก่อน และ similarity ตรงกับที่คำนวณไว้', async () => {
  const res = await getRelated(ids.source);
  assert.equal(res.status, 200);
  const first = res.body.data[0];
  assert.equal(first.product_id, ids.near); // ใกล้กว่าสินค้าจริงทุกชิ้นใน DB (เวกเตอร์จริงไม่ได้ชี้ทิศนี้)
  assert.ok(first.similarity > 0.99, `similarity ${first.similarity}`);
  // รูปข้อมูลเหมือนการ์ดสินค้าของ R3 (หน้า Detail ใช้วาดการ์ดได้เลย)
  assert.equal(first.in_stock, true);
  assert.ok(first.category.slug);
});

test('เรียงตามความใกล้: near → mid → far', async () => {
  // far ไม่เกี่ยวเลย อาจหลุดอันดับท้าย ๆ หลังสินค้าจริง 50 กว่าชิ้น จึงเรียก service ตรง ๆ ให้เห็นทุกชิ้น
  const all = await related({ productId: ids.source, limit: 10000 });
  const at = (key) => all.findIndex((p) => p.product_id === ids[key]);
  assert.ok(at('near') < at('mid') && at('mid') < at('far'), `near ${at('near')} mid ${at('mid')} far ${at('far')}`);
  assert.equal(all[at('mid')].similarity, 0.6);
  assert.equal(all[at('far')].similarity, 0);
});

test('ตัดตัวเอง ของที่ซ่อน ของหมด และชิ้นที่ยังไม่มีเวกเตอร์', async () => {
  const all = await related({ productId: ids.source, limit: 10000 });
  const got = all.map((p) => p.product_id);
  for (const key of ['source', 'nearHidden', 'nearSoldOut', 'noVector']) {
    assert.ok(!got.includes(ids[key]), `${key} ต้องไม่อยู่ในผล`);
  }
});

test('สินค้าตั้งต้นยังไม่มีเวกเตอร์ → 200 รายการว่าง (ไม่ใช่ error)', async () => {
  const res = await getRelated(ids.noVector);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, []);
});

test('ไม่มีสินค้านี้ / ถูกซ่อน → 404 PRODUCT_NOT_FOUND', async () => {
  for (const id of [999999999, ids.hiddenSource]) {
    const res = await getRelated(id);
    assert.equal(res.status, 404, `id ${id}`);
    assert.equal(res.body.error.code, 'PRODUCT_NOT_FOUND');
  }
});

test('รหัสใน URL ผิดรูปแบบ → 400 INVALID_ID', async () => {
  for (const bad of ['abc', '0', '-1', '1.5']) {
    const res = await getRelated(bad);
    assert.equal(res.status, 400, `id ${bad}`);
    assert.equal(res.body.error.code, 'INVALID_ID');
  }
});

test('ค่าเริ่มต้น 8 ชิ้น · ?limit= ใช้ได้ · limit ผิด → 400', async () => {
  assert.equal((await getRelated(ids.source)).body.data.length, 8);
  assert.equal((await getRelated(ids.source, '?limit=2')).body.data.length, 2);
  for (const bad of ['0', '25', 'abc']) {
    const res = await getRelated(ids.source, `?limit=${bad}`);
    assert.equal(res.status, 400, `limit=${bad}`);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  }
});
