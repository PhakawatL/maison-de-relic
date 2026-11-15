// ทดสอบ GET /api/recommend/for-you (R4) — แนะนำสำหรับคุณแบบ item-to-item
//
// ใช้ "เวกเตอร์ปลอม" ที่เขียนเอง ไม่ต้องโหลดโมเดล → รันบน CI ได้ทุก PR
// เวกเตอร์ 384 มิติ ใส่ค่าแค่ 1–2 ช่อง จึงรู้ล่วงหน้าว่าชิ้นไหนใกล้ชิ้นไหน
//   ความสนใจ A (ช่อง 0) — ผู้ใช้กดถูกใจ + คลิก (คะแนน 3 + 2 = 5)  → ของที่ใกล้: nearA
//   ความสนใจ B (ช่อง 2) — ผู้ใช้แค่เปิดดู (คะแนน 1)               → ของที่ใกล้: nearB
//   คาดหวัง: ชิ้นแรก = nearA (A คะแนนมากกว่า ได้หยิบก่อน) · ชิ้นที่สอง = nearB (ผลัดกันหยิบ ความสนใจรองไม่หาย)
// ชื่อสินค้ามีคำว่า zzr4fy ลบทิ้งตอนจบ
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const { pool, query } = require('../src/db/pool');
const { signToken } = require('../src/middleware/auth');

const TAG = 'zzr4fy';
const ids = {};
let server;
let base;

// สร้างเวกเตอร์ 384 มิติ จากค่าที่ให้ เช่น vector({ 0: 1 }) = [1, 0, 0, ...]
function vector(values) {
  const v = new Array(384).fill(0);
  for (const [i, x] of Object.entries(values)) v[i] = x;
  return `[${v.join(',')}]`;
}

async function cleanup() {
  // ลำดับ: ออเดอร์ (order_item ถูกลบตาม) → สินค้า (user_event ถูกลบตาม) → ผู้ใช้
  await query(`DELETE FROM "order" WHERE user_id IN (SELECT user_id FROM "user" WHERE username LIKE $1)`, [`${TAG}\\_%`]);
  await query('DELETE FROM product WHERE title LIKE $1', [`%${TAG}`]);
  await query('DELETE FROM "user" WHERE username LIKE $1', [`${TAG}\\_%`]);
}

async function insertUser(name) {
  const { rows } = await query(
    `INSERT INTO "user" (username, email, password_hash, first_name, last_name, display_name, is_email_verified)
     VALUES ($1, $2, 'x', 'R4', 'ForYou', $1, TRUE) RETURNING user_id`,
    [`${TAG}_${name}`, `${TAG}_${name}@example.com`]
  );
  return Number(rows[0].user_id);
}

async function insertProduct(key, values, { status = 'available', stock = 1 } = {}) {
  const { rows } = await query(
    `INSERT INTO product (category_id, created_by, title, price, condition, status, stock_quantity, embedding)
     VALUES ((SELECT category_id FROM category ORDER BY category_id LIMIT 1), $1, $2, 900, 'good', $3, $4, $5::vector)
     RETURNING product_id`,
    [ids.admin, `${key} ${TAG}`, status, stock, vector(values)]
  );
  ids[key] = Number(rows[0].product_id);
}

// บันทึก event ของผู้ใช้ · minutesAgo = เกิดขึ้นกี่นาทีก่อน (น้อย = ล่าสุด)
async function event(userKey, productKey, type, minutesAgo) {
  await query(
    `INSERT INTO user_event (user_id, product_id, session_id, event_type, created_at)
     VALUES ($1, $2, 'test', $3, NOW() - $4::int * INTERVAL '1 minute')`,
    [ids[userKey], ids[productKey], type, minutesAgo]
  );
}

// ผู้ใช้ซื้อสินค้า (ออเดอร์สถานะ status)
async function buy(userKey, productKey, status) {
  const { rows } = await query(
    `INSERT INTO "order" (user_id, grand_total, current_status, ship_name, ship_phone, ship_line1,
                          ship_district, ship_province, ship_postcode)
     VALUES ($1, 900, $2, 'ทดสอบ', '0800000000', '1 ถนนทดสอบ', 'เขต', 'กรุงเทพฯ', '10100') RETURNING order_id`,
    [ids[userKey], status]
  );
  await query(
    `INSERT INTO order_item (order_id, product_id, quantity, unit_price_at_purchase, title_snapshot)
     VALUES ($1, $2, 1, 900, 'ทดสอบ')`,
    [rows[0].order_id, ids[productKey]]
  );
}

const getForYou = async (token, qs = '') => {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${base}/api/recommend/for-you${qs}`, { headers });
  return { status: res.status, body: await res.json() };
};

before(async () => {
  await cleanup();
  ids.admin = await insertUser('admin');
  await query(`INSERT INTO admin (user_id, admin_role) VALUES ($1, 'staff')`, [ids.admin]);
  ids.fan = await insertUser('fan'); // มีประวัติ
  ids.newbie = await insertUser('newbie'); // ยังไม่มีประวัติ (cold start)

  await insertProduct('interestA', { 0: 1 });
  await insertProduct('interestB', { 2: 1 });
  await insertProduct('nearA', { 0: 0.95, 1: 0.05 }); // ใกล้ A ที่สุด
  await insertProduct('nearB', { 2: 0.95, 3: 0.05 }); // ใกล้ B ที่สุด
  await insertProduct('boughtNearA', { 0: 0.99, 1: 0.01 }); // ใกล้ A ยิ่งกว่า แต่ผู้ใช้ซื้อไปแล้ว → ต้องไม่โผล่
  await insertProduct('cancelledNearA', { 0: 0.9, 1: 0.1 }); // ซื้อแต่ออเดอร์ถูกยกเลิก → ยังแนะนำได้
  await insertProduct('hiddenNearA', { 0: 0.98, 1: 0.02 }, { status: 'hidden' }); // ใกล้มากแต่ขายไม่ได้

  await event('fan', 'interestA', 'click', 3);
  await event('fan', 'interestA', 'wishlist', 2); // A: 2 + 3 = 5
  await event('fan', 'interestB', 'view', 1); //     B: 1 (ล่าสุด แต่คะแนนน้อยกว่า)
  await buy('fan', 'boughtNearA', 'delivered');
  await buy('fan', 'cancelledNearA', 'cancelled');

  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await cleanup();
  server.close();
  await pool.end();
});

test('ไม่ล็อกอิน / token เสีย → 401', async () => {
  assert.equal((await getForYou(null)).status, 401);
  assert.equal((await getForYou('abc')).status, 401);
});

test('ความสนใจคะแนนมากได้หยิบก่อน แล้วผลัดกัน: nearA (เพราะ A) → nearB (เพราะ B)', async () => {
  const { status, body } = await getForYou(signToken(ids.fan));
  assert.equal(status, 200);
  assert.equal(body.meta.personalized, true);
  const [first, second] = body.data;
  assert.equal(first.product_id, ids.nearA);
  assert.equal(first.because.product_id, ids.interestA);
  assert.equal(second.product_id, ids.nearB); // ความสนใจรอง (B) ไม่ถูกกลืนหาย
  assert.equal(second.because.product_id, ids.interestB);
  // รูปข้อมูลเหมือนการ์ดสินค้าของ R3
  assert.equal(first.in_stock, true);
  assert.ok(first.category.slug);
});

test('ตัดชิ้นที่เคยเห็น ของที่ซื้อแล้ว และของที่ขายไม่ได้ · ออเดอร์ที่ยกเลิกไม่นับว่าซื้อ', async () => {
  const { body } = await getForYou(signToken(ids.fan), '?limit=24');
  const got = body.data.map((p) => p.product_id);
  for (const key of ['interestA', 'interestB', 'boughtNearA', 'hiddenNearA']) {
    assert.ok(!got.includes(ids[key]), `${key} ต้องไม่อยู่ในผล`);
  }
  assert.ok(got.includes(ids.cancelledNearA), 'ออเดอร์ที่ยกเลิก ยังแนะนำได้');
  assert.equal(new Set(got).size, got.length, 'ไม่มีชิ้นซ้ำ');
});

test('ยังไม่มีประวัติ (cold start) → ยอดนิยมแทน personalized = false', async () => {
  const { status, body } = await getForYou(signToken(ids.newbie));
  assert.equal(status, 200);
  assert.equal(body.meta.personalized, false);
  assert.ok(body.data.length > 0);
  assert.ok(body.data[0].popularity, 'เป็นผลจากยอดนิยม'); // ยอดนิยมมีช่อง popularity
});

test('ค่าเริ่มต้น 8 ชิ้น · ?limit= ใช้ได้ · limit ผิด → 400', async () => {
  const token = signToken(ids.fan);
  assert.equal((await getForYou(token)).body.data.length, 8);
  assert.equal((await getForYou(token, '?limit=2')).body.data.length, 2);
  for (const bad of ['0', '25', 'abc']) {
    const res = await getForYou(token, `?limit=${bad}`);
    assert.equal(res.status, 400, `limit=${bad}`);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  }
});
