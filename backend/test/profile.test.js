// ทดสอบโปรไฟล์และเปลี่ยนรหัสผ่าน (R2 · #17 · S2): /api/profile
// ผู้ใช้ทดสอบขึ้นต้นด้วย zzr2pro และถูกลบตอนจบ
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const app = require('../src/app');
const { pool, query } = require('../src/db/pool');

const TAG = 'zzr2pro';
const PASSWORD = 'Test@1234';
const tokens = {};
let server;
let base;

async function insertUser(key, { verified = true } = {}) {
  const hash = await bcrypt.hash(PASSWORD, 4);
  await query(
    `INSERT INTO "user" (username, email, password_hash, first_name, last_name, display_name, is_email_verified)
     VALUES ($1, $2, $3, 'R2', 'Profile', $1, $4)`,
    [`${TAG}_${key}`, `${TAG}_${key}@example.com`, hash, verified]
  );
}

async function cleanup() {
  await query(`DELETE FROM "user" WHERE username LIKE $1`, [`${TAG}\\_%`]);
}

async function api(method, path, { as, token, body } = {}) {
  const headers = {};
  const t = token ?? tokens[as];
  if (t) headers.Authorization = `Bearer ${t}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const login = (key, password = PASSWORD) =>
  api('POST', '/auth/login', { body: { username: `${TAG}_${key}`, password } });

before(async () => {
  await cleanup();
  await insertUser('alice');
  await insertUser('newbie', { verified: false });
  await insertUser('pw');

  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  for (const key of ['alice', 'newbie', 'pw']) tokens[key] = (await login(key)).body.data.token;
});

after(async () => {
  server.close();
  await cleanup();
  await pool.end();
});

test('ไม่ล็อกอิน → 401', async () => {
  assert.equal((await api('GET', '/profile')).status, 401);
});

test('ดูโปรไฟล์ตัวเอง → ข้อมูลครบ ไม่มี password_hash', async () => {
  const { status, body } = await api('GET', '/profile', { as: 'alice' });
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(body.data).sort(), [
    'avatar_url', 'created_at', 'display_name', 'email', 'first_name', 'is_email_verified',
    'last_name', 'phone', 'user_id', 'username',
  ]);
  assert.equal(body.data.username, `${TAG}_alice`);
});

test('แก้โปรไฟล์ → 200 แก้เฉพาะช่องที่ส่ง, ส่งค่าว่าง = ลบค่าในช่องที่ไม่บังคับ', async () => {
  const res = await api('PATCH', '/profile', {
    as: 'alice',
    body: { display_name: 'อลิซ', phone: '089-999-9999', avatar_url: 'https://example.com/a.png' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.display_name, 'อลิซ');
  assert.equal(res.body.data.first_name, 'R2');
  assert.equal(res.body.data.avatar_url, 'https://example.com/a.png');

  const cleared = await api('PATCH', '/profile', { as: 'alice', body: { phone: '', avatar_url: '' } });
  assert.equal(cleared.body.data.phone, null);
  assert.equal(cleared.body.data.avatar_url, null);
});

test('แก้โปรไฟล์ด้วยข้อมูลผิด / เปลี่ยน username / ส่งแค่อีเมล → 400', async () => {
  const bad = await api('PATCH', '/profile', {
    as: 'alice',
    body: { first_name: '', avatar_url: 'javascript:alert(1)', phone: 'x' },
  });
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.body.error.details.map((d) => d.field).sort(), ['avatar_url', 'first_name', 'phone']);

  assert.equal((await api('PATCH', '/profile', { as: 'alice', body: { username: 'new' } })).status, 400);
  // อีเมลแก้ที่หน้านี้ไม่ได้ ช่องนี้ถูกข้าม เลยไม่มีอะไรให้แก้
  const emailOnly = await api('PATCH', '/profile', { as: 'alice', body: { email: 'new@example.com' } });
  assert.equal(emailOnly.status, 400);
  assert.equal((await api('GET', '/profile', { as: 'alice' })).body.data.email, `${TAG}_alice@example.com`);
});

test('ยังไม่ยืนยันอีเมล: ดูโปรไฟล์ได้ แต่แก้ไม่ได้ (403)', async () => {
  assert.equal((await api('GET', '/profile', { as: 'newbie' })).status, 200);
  const res = await api('PATCH', '/profile', { as: 'newbie', body: { display_name: 'x' } });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'EMAIL_NOT_VERIFIED');
});

test('เปลี่ยนรหัสผ่าน: รหัสเดิมผิด → 400, ถูก → ได้ token ใหม่ และ token เก่าใช้ไม่ได้', async () => {
  const wrong = await api('PUT', '/profile/password', {
    as: 'pw',
    body: { current_password: 'nope', new_password: 'Changed@123' },
  });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.error.code, 'WRONG_PASSWORD');

  const short = await api('PUT', '/profile/password', { as: 'pw', body: { current_password: PASSWORD, new_password: '123' } });
  assert.equal(short.status, 400);
  assert.equal(short.body.error.details[0].field, 'new_password');

  const ok = await api('PUT', '/profile/password', {
    as: 'pw',
    body: { current_password: PASSWORD, new_password: 'Changed@123' },
  });
  assert.equal(ok.status, 200);
  const newToken = ok.body.data.token;

  assert.equal((await api('GET', '/profile', { as: 'pw' })).status, 401); // token เก่า
  assert.equal((await api('GET', '/profile', { token: newToken })).status, 200);
  assert.equal((await login('pw')).status, 401);
  assert.equal((await login('pw', 'Changed@123')).status, 200);
});
