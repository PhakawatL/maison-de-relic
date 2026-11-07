// ทดสอบ GET /api/recommend/popular (R4)
// สร้างสินค้าทดสอบที่มีคะแนนสูงกว่าสินค้า seed มาก ๆ แล้วดูว่าเรียงลำดับและตัดของที่ขายไม่ได้ถูกต้อง
// (ชื่อมีคำว่า zzr4pop ลบทิ้งตอนจบ)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const { pool, query } = require('../src/db/pool');

const TAG = 'zzr4pop';
const ids = {};
const fans = []; // ผู้ใช้ที่กดถูกใจ
let server;
let base;

async function cleanup() {
  // ลำดับสำคัญ: ออเดอร์ (order_item ถูกลบตาม) → สินค้า (wishlist ถูกลบตาม) → ผู้ใช้
  await query(`DELETE FROM "order" WHERE user_id IN (SELECT user_id FROM "user" WHERE username LIKE $1)`, [`${TAG}\\_%`]);
  await query('DELETE FROM product WHERE title LIKE $1', [`%${TAG}`]);
  await query(`DELETE FROM "user" WHERE username LIKE $1`, [`${TAG}\\_%`]);
}

async function insertUser(name) {
  const { rows } = await query(
    `INSERT INTO "user" (username, email, password_hash, first_name, last_name, display_name, is_email_verified)
     VALUES ($1, $2, 'x', 'R4', 'Popular', $1, TRUE) RETURNING user_id`,
    [`${TAG}_${name}`, `${TAG}_${name}@example.com`]
  );
  return Number(rows[0].user_id);
}

async function insertProduct(key, { status = 'available', stock = 1 } = {}) {
  const { rows } = await query(
    `INSERT INTO product (category_id, created_by, title, price, condition, status, stock_quantity)
     VALUES ((SELECT category_id FROM category ORDER BY category_id LIMIT 1), $1, $2, 900, 'good', $3, $4)
     RETURNING product_id`,
    [ids.seller, `${key} ${TAG}`, status, stock]
  );
  ids[key] = Number(rows[0].product_id);
}

// ขาย productKey ไป qty ชิ้น ในออเดอร์สถานะ status
async function sell(productKey, qty, status = 'paid') {
  const { rows } = await query(
    `INSERT INTO "order" (user_id, grand_total, current_status, ship_name, ship_phone, ship_line1,
                          ship_district, ship_province, ship_postcode)
     VALUES ($1, 900, $2, 'ทดสอบ', '0800000000', '1 ถนนทดสอบ', 'เขต', 'กรุงเทพฯ', '10100') RETURNING order_id`,
    [ids.buyer, status]
  );
  await query(
    `INSERT INTO order_item (order_id, product_id, quantity, unit_price_at_purchase, title_snapshot)
     VALUES ($1, $2, $3, 900, 'ทดสอบ')`,
    [rows[0].order_id, ids[productKey], qty]
  );
}

async function like(productKey, count) {
  for (let i = 0; i < count; i++) {
    await query('INSERT INTO wishlist (user_id, product_id) VALUES ($1, $2)', [fans[i], ids[productKey]]);
  }
}

const getPopular = async (qs = '') => {
  const res = await fetch(`${base}/api/recommend/popular${qs}`);
  return { status: res.status, body: await res.json() };
};

before(async () => {
  await cleanup();
  ids.seller = await insertUser('seller');
  await query(`INSERT INTO admin (user_id, admin_role) VALUES ($1, 'staff')`, [ids.seller]);
  ids.buyer = await insertUser('buyer');
  for (let i = 0; i < 3; i++) fans.push(await insertUser(`fan${i}`));

  await insertProduct('top');                       // ขาย 900 + ถูกใจ 3 → คะแนน 903
  await insertProduct('second');                    // ขาย 500 + ถูกใจ 1 → คะแนน 501
  await insertProduct('hidden', { status: 'hidden' }); // คะแนนสูงสุด แต่ถูกซ่อน → ต้องไม่โผล่
  await insertProduct('soldout', { stock: 0 });     // คะแนนสูงสุด แต่ของหมด → ต้องไม่โผล่
  await insertProduct('cancelled');                 // ขายได้แต่ออเดอร์ถูกยกเลิก → ไม่นับยอดขาย

  await sell('top', 900);
  await like('top', 3);
  await sell('second', 500);
  await like('second', 1);
  await sell('hidden', 5000);
  await sell('soldout', 5000);
  await sell('cancelled', 5000, 'cancelled');

  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await cleanup();
  server.close();
  await pool.end();
});

test('เรียงจากคะแนนมากไปน้อย และบอกตัวเลขที่ใช้คิดคะแนน', async () => {
  const res = await getPopular();
  assert.equal(res.status, 200);
  const list = res.body.data;
  assert.equal(list[0].product_id, ids.top);
  assert.equal(list[1].product_id, ids.second);
  assert.deepEqual(list[0].popularity, { score: 903, sold: 900, wishlist: 3 });
  // รูปข้อมูลเหมือนการ์ดสินค้าของ R3 (หน้าเว็บใช้โค้ดวาดการ์ดเดิมได้)
  assert.equal(list[0].in_stock, true);
  assert.ok(list[0].category.slug);
});

test('ไม่เอาสินค้าที่ซ่อนอยู่ / ของหมด และไม่นับออเดอร์ที่ถูกยกเลิก', async () => {
  const { body } = await getPopular('?limit=24');
  const got = body.data.map((p) => p.product_id);
  assert.ok(!got.includes(ids.hidden));
  assert.ok(!got.includes(ids.soldout));
  const cancelled = body.data.find((p) => p.product_id === ids.cancelled);
  if (cancelled) assert.equal(cancelled.popularity.sold, 0); // โผล่ได้ แต่ยอดขายต้องเป็น 0
});

test('ค่าเริ่มต้น 8 ชิ้น และ ?limit= ใช้ได้', async () => {
  assert.ok((await getPopular()).body.data.length <= 8);
  assert.equal((await getPopular('?limit=2')).body.data.length, 2);
});

test('limit ผิด → 400 VALIDATION_ERROR', async () => {
  for (const bad of ['0', '25', 'abc']) {
    const res = await getPopular(`?limit=${bad}`);
    assert.equal(res.status, 400, `limit=${bad}`);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  }
});
