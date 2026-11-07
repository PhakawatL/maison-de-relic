// ทดสอบ POST /api/events (R4) — บันทึกพฤติกรรมผู้ใช้ลง user_event
// สร้างผู้ใช้และสินค้าทดสอบของตัวเอง (มีคำว่า zzr4evt) แล้วลบทิ้งตอนจบ ไม่ยุ่งกับข้อมูล seed
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const { pool, query } = require('../src/db/pool');
const { signToken } = require('../src/middleware/auth');

const TAG = 'zzr4evt';
const ids = {};
let server;
let base;

async function cleanup() {
  // ลบสินค้าก่อน (user_event ถูกลบตาม ON DELETE CASCADE) แล้วค่อยลบผู้ใช้
  await query('DELETE FROM product WHERE title LIKE $1', [`%${TAG}`]);
  await query(`DELETE FROM "user" WHERE username LIKE $1`, [`${TAG}\\_%`]);
}

async function post(body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}/api/events`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

// อ่าน event ที่เพิ่งบันทึกจากฐานข้อมูลตรง ๆ (ดูว่า user_id ถูกใส่ถูกต้องไหม)
async function eventRow(eventId) {
  const { rows } = await query('SELECT user_id, session_id, event_type FROM user_event WHERE event_id = $1', [eventId]);
  return rows[0];
}

before(async () => {
  await cleanup();
  const { rows: u } = await query(
    `INSERT INTO "user" (username, email, password_hash, first_name, last_name, display_name, is_email_verified)
     VALUES ($1, $2, 'x', 'R4', 'Events', $1, TRUE) RETURNING user_id`,
    [`${TAG}_alice`, `${TAG}_alice@example.com`]
  );
  ids.alice = Number(u[0].user_id);
  await query(`INSERT INTO admin (user_id, admin_role) VALUES ($1, 'staff')`, [ids.alice]); // ใช้เป็นผู้ลงสินค้าด้วย
  const { rows: p } = await query(
    `INSERT INTO product (category_id, created_by, title, price, condition, status, stock_quantity)
     VALUES ((SELECT category_id FROM category ORDER BY category_id LIMIT 1), $1, $2, 500, 'good', 'available', 1)
     RETURNING product_id`,
    [ids.alice, `ของทดสอบ ${TAG}`]
  );
  ids.product = Number(p[0].product_id);

  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await cleanup();
  server.close();
  await pool.end();
});

test('ยังไม่ล็อกอิน → 201 บันทึกโดย user_id = null', async () => {
  const res = await post({ product_id: ids.product, event_type: 'click', session_id: 'sess-anon' });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.event_type, 'click');
  assert.equal(res.body.data.product_id, ids.product);
  const row = await eventRow(res.body.data.event_id);
  assert.equal(row.user_id, null);
  assert.equal(row.session_id, 'sess-anon');
});

test('มี token → API ใส่ user_id ให้เอง', async () => {
  const res = await post({ product_id: ids.product, event_type: 'wishlist', session_id: 's1' }, signToken(ids.alice));
  assert.equal(res.status, 201);
  assert.equal(Number((await eventRow(res.body.data.event_id)).user_id), ids.alice);
});

test('ส่ง user_id มาใน body → ไม่สนใจ (อ่านจาก token เท่านั้น)', async () => {
  const res = await post({ product_id: ids.product, event_type: 'click', session_id: 's2', user_id: ids.alice });
  assert.equal(res.status, 201);
  assert.equal((await eventRow(res.body.data.event_id)).user_id, null);
});

test('token ใช้ไม่ได้ → ยังบันทึกได้แบบไม่ระบุผู้ใช้ (ไม่ตอบ 401)', async () => {
  const res = await post({ product_id: ids.product, event_type: 'click', session_id: 's3' }, 'not-a-real-token');
  assert.equal(res.status, 201);
  assert.equal((await eventRow(res.body.data.event_id)).user_id, null);
});

test('event "view" → view_count ของสินค้า +1', async () => {
  const before = await query('SELECT view_count FROM product WHERE product_id = $1', [ids.product]);
  const res = await post({ product_id: ids.product, event_type: 'view', session_id: 's4' });
  assert.equal(res.status, 201);
  const after = await query('SELECT view_count FROM product WHERE product_id = $1', [ids.product]);
  assert.equal(after.rows[0].view_count, before.rows[0].view_count + 1);
});

test('ข้อมูลผิด → 400 VALIDATION_ERROR บอกทุกช่องที่ผิดพร้อมกัน', async () => {
  const res = await post({ product_id: 'abc', event_type: 'like', session_id: '' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  const fields = res.body.error.details.map((d) => d.field).sort();
  assert.deepEqual(fields, ['event_type', 'product_id', 'session_id']);
});

test('session_id ยาวเกิน 100 ตัว → 400', async () => {
  const res = await post({ product_id: ids.product, event_type: 'view', session_id: 'x'.repeat(101) });
  assert.equal(res.status, 400);
});

test('ไม่มีสินค้านี้ → 404 PRODUCT_NOT_FOUND', async () => {
  const res = await post({ product_id: 999999999, event_type: 'view', session_id: 's5' });
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'PRODUCT_NOT_FOUND');
});
