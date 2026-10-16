// ทดสอบที่อยู่จัดส่ง (R2 · #16): /api/addresses และ helper ที่ R5 ใช้ตอน checkout
// ใส่ผู้ใช้ทดสอบของตัวเองก่อน แล้วลบทิ้งตอนจบ (username ขึ้นต้นด้วย zzr2addr เพื่อกรองเฉพาะของเทสนี้)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const app = require('../src/app');
const { pool, query } = require('../src/db/pool');
const addresses = require('../src/modules/users/addresses.service');

const TAG = 'zzr2addr';
const PASSWORD = 'Test@1234';
const ids = {};
const tokens = {};
let server;
let base;

async function insertUser(key, { verified = true } = {}) {
  const hash = await bcrypt.hash(PASSWORD, 4);
  const { rows } = await query(
    `INSERT INTO "user" (username, email, password_hash, first_name, last_name, display_name, is_email_verified)
     VALUES ($1, $2, $3, 'R2', 'Address', $1, $4) RETURNING user_id`,
    [`${TAG}_${key}`, `${TAG}_${key}@example.com`, hash, verified]
  );
  ids[key] = Number(rows[0].user_id);
}

async function cleanup() {
  // ลบ user แล้วที่อยู่ถูกลบตาม (ON DELETE CASCADE)
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

const sample = (extra = {}) => ({
  label: 'บ้าน',
  recipient_name: 'สมชาย ใจดี',
  phone: '081-234-5678',
  line1: '99/1 ถนนพุทธมณฑลสาย 4',
  district: 'ศาลายา',
  province: 'นครปฐม',
  postcode: '73170',
  ...extra,
});

async function add(as, extra) {
  const res = await api('POST', '/addresses', { as, body: sample(extra) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

async function defaults(as) {
  const { body } = await api('GET', '/addresses', { as });
  return body.data.filter((a) => a.is_default).map((a) => a.address_id);
}

before(async () => {
  await cleanup();
  await insertUser('alice');
  await insertUser('bob');
  await insertUser('newbie', { verified: false });
  await insertUser('carol');
  await insertUser('dave');

  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  for (const key of ['alice', 'bob', 'newbie', 'carol', 'dave']) {
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

test('ไม่ล็อกอิน → 401', async () => {
  assert.equal((await api('GET', '/addresses')).status, 401);
  assert.equal((await api('POST', '/addresses', { body: sample() })).status, 401);
});

test('ยังไม่ยืนยันอีเมล: ดูได้ (ว่าง) แต่เพิ่มไม่ได้ → 403 EMAIL_NOT_VERIFIED', async () => {
  const list = await api('GET', '/addresses', { as: 'newbie' });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.data, []);
  const res = await api('POST', '/addresses', { as: 'newbie', body: sample() });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'EMAIL_NOT_VERIFIED');
});

test('ที่อยู่ของคนอื่น: ดู / แก้ / ลบ → 404 เหมือนไม่มีอยู่', async () => {
  const bobs = await add('bob');
  for (const [method, body] of [['GET'], ['PATCH', { label: 'ขโมย' }], ['DELETE']]) {
    const res = await api(method, `/addresses/${bobs.address_id}`, { as: 'alice', body });
    assert.equal(res.status, 404, method);
    assert.equal(res.body.error.code, 'ADDRESS_NOT_FOUND');
  }
  // ของ bob ยังอยู่ครบ
  const still = await api('GET', `/addresses/${bobs.address_id}`, { as: 'bob' });
  assert.equal(still.body.data.label, 'บ้าน');
});

// ---------- เพิ่ม / ดู ----------

test('ที่อยู่แรกเป็นที่อยู่หลักอัตโนมัติ ที่อยู่ถัดไปไม่ใช่', async () => {
  const first = await add('alice', { is_default: false }); // ส่ง false มาก็ยังเป็นหลัก เพราะเป็นที่อยู่แรก
  assert.equal(first.is_default, true);
  const second = await add('alice', { label: 'ที่ทำงาน' });
  assert.equal(second.is_default, false);
  assert.deepEqual(await defaults('alice'), [first.address_id]);
});

test('รายการ: ที่อยู่หลักขึ้นก่อน และไม่เห็นของคนอื่น', async () => {
  const { status, body } = await api('GET', '/addresses', { as: 'alice' });
  assert.equal(status, 200);
  assert.equal(body.data.length, 2);
  assert.equal(body.data[0].is_default, true);
  assert.deepEqual(Object.keys(body.data[0]).sort(), [
    'address_id', 'district', 'is_default', 'label', 'line1', 'phone', 'postcode', 'province', 'recipient_name',
  ]);
});

test('เพิ่มโดยข้อมูลไม่ครบหรือผิดรูปแบบ → 400 บอกทุกช่อง', async () => {
  const { status, body } = await api('POST', '/addresses', {
    as: 'alice',
    body: { recipient_name: '  ', phone: 'abc', postcode: '7317', label: 'x'.repeat(51) },
  });
  assert.equal(status, 400);
  assert.deepEqual(
    body.error.details.map((d) => d.field).sort(),
    ['district', 'label', 'line1', 'phone', 'postcode', 'province', 'recipient_name']
  );
});

test('เพิ่มพร้อม is_default = true → ที่อยู่หลักย้ายมาที่ใหม่ เหลือหลักที่เดียว', async () => {
  await add('carol');
  const newer = await add('carol', { is_default: true, label: 'คอนโด' });
  assert.deepEqual(await defaults('carol'), [newer.address_id]);
});

// ---------- แก้ไข ----------

test('แก้บางช่อง → 200 ช่องอื่นคงเดิม, label ส่งค่าว่าง = ลบ', async () => {
  const a = await add('dave');
  const { status, body } = await api('PATCH', `/addresses/${a.address_id}`, {
    as: 'dave',
    body: { line1: '1 ถนนใหม่', label: '' },
  });
  assert.equal(status, 200);
  assert.equal(body.data.line1, '1 ถนนใหม่');
  assert.equal(body.data.label, null);
  assert.equal(body.data.postcode, '73170');
});

test('ตั้งที่อยู่อื่นเป็นหลัก → อันเดิมถูกยกเลิกให้เอง', async () => {
  const { body } = await api('GET', '/addresses', { as: 'alice' });
  const other = body.data.find((a) => !a.is_default);
  const res = await api('PATCH', `/addresses/${other.address_id}`, { as: 'alice', body: { is_default: true } });
  assert.equal(res.status, 200);
  assert.deepEqual(await defaults('alice'), [other.address_id]);
});

test('แก้ is_default เป็น false / ส่งช่องบังคับว่าง / ไม่มีอะไรให้แก้ → 400', async () => {
  const [def] = await defaults('alice');
  for (const body of [{ is_default: false }, { recipient_name: '' }, {}]) {
    const res = await api('PATCH', `/addresses/${def}`, { as: 'alice', body });
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  assert.equal((await api('PATCH', '/addresses/abc', { as: 'alice', body: { label: 'x' } })).status, 400);
});

// ---------- ลบ ----------

test('ลบที่อยู่หลัก → ที่อยู่ที่เพิ่มล่าสุดที่เหลือกลายเป็นหลัก, ลบจนหมดได้', async () => {
  const a = await add('bob', { label: 'A' }); // bob มีที่อยู่แรกจากเทสก่อนแล้ว
  const b = await add('bob', { label: 'B', is_default: true });
  assert.equal((await api('DELETE', `/addresses/${b.address_id}`, { as: 'bob' })).status, 204);
  assert.deepEqual(await defaults('bob'), [a.address_id]);

  const { body } = await api('GET', '/addresses', { as: 'bob' });
  for (const addr of body.data) {
    assert.equal((await api('DELETE', `/addresses/${addr.address_id}`, { as: 'bob' })).status, 204);
  }
  assert.deepEqual((await api('GET', '/addresses', { as: 'bob' })).body.data, []);
  // ลบซ้ำ → 404
  assert.equal((await api('DELETE', `/addresses/${a.address_id}`, { as: 'bob' })).status, 404);
});

test('เพิ่มพร้อมกันหลายคำขอ → ยังมีที่อยู่หลักแค่ที่เดียว', async () => {
  await insertUser('rush');
  tokens.rush = (await api('POST', '/auth/login', { body: { username: `${TAG}_rush`, password: PASSWORD } })).body.data.token;
  const results = await Promise.all(
    Array.from({ length: 5 }, (_, i) => api('POST', '/addresses', { as: 'rush', body: sample({ label: `#${i}`, is_default: true }) }))
  );
  assert.ok(results.every((r) => r.status === 201));
  assert.equal((await defaults('rush')).length, 1);
});

// ---------- helper สำหรับ R5 ----------

test('getForUser + toShippingSnapshot: ใช้ได้เฉพาะที่อยู่ของผู้ซื้อ และแปลงเป็นคอลัมน์ ship_*', async () => {
  const [carolDefault] = await defaults('carol');
  assert.equal(await addresses.getForUser(ids.alice, carolDefault), null);

  const address = await addresses.getForUser(ids.carol, carolDefault);
  assert.deepEqual(addresses.toShippingSnapshot(address), {
    ship_name: 'สมชาย ใจดี',
    ship_phone: '081-234-5678',
    ship_line1: '99/1 ถนนพุทธมณฑลสาย 4',
    ship_district: 'ศาลายา',
    ship_province: 'นครปฐม',
    ship_postcode: '73170',
  });
});
