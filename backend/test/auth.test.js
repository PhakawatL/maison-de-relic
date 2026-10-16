// ทดสอบระบบล็อกอิน (R2): POST /api/auth/login, GET /api/auth/me และ middleware/auth.js
// ใส่ผู้ใช้ทดสอบของตัวเองก่อน แล้วลบทิ้งตอนจบ (username ขึ้นต้นด้วย zzr2test เพื่อกรองเฉพาะของเทสนี้)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = require('../src/app');
const env = require('../src/config/env');
const { pool, query } = require('../src/db/pool');
const { requireAuth, requireRole, requireAdmin, requireVerified } = require('../src/middleware/auth');
const { errorHandler } = require('../src/middleware/errorHandler');

const TAG = 'zzr2test';
const PASSWORD = 'Test@1234';
const ids = {};
let server;
let base;
let guardServer;
let guardBase;

async function insertUser(key, { verified = true, active = true, adminRole = null } = {}) {
  const hash = await bcrypt.hash(PASSWORD, 4); // cost ต่ำพอสำหรับเทส
  const { rows } = await query(
    `INSERT INTO "user" (username, email, password_hash, first_name, last_name, display_name, role, is_email_verified, is_active)
     VALUES ($1, $2, $3, 'R2', 'Test', $1, $4, $5, $6) RETURNING user_id`,
    [`${TAG}_${key}`, `${TAG}_${key}@example.com`, hash, adminRole ? 'admin' : 'customer', verified, active]
  );
  ids[key] = Number(rows[0].user_id);
  if (adminRole) {
    await query('INSERT INTO admin (user_id, admin_role) VALUES ($1, $2)', [ids[key], adminRole]);
  }
}

async function cleanup() {
  // ลบ user แล้วแถวใน admin ถูกลบตาม (ON DELETE CASCADE)
  await query(`DELETE FROM "user" WHERE username LIKE $1`, [`${TAG}\\_%`]);
}

async function call(baseUrl, method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const api = (method, path, opts) => call(`${base}/api`, method, path, opts);
const guard = (path, opts) => call(guardBase, 'GET', path, opts);

async function loginAs(key) {
  const { status, body } = await api('POST', '/auth/login', {
    body: { username: `${TAG}_${key}`, password: PASSWORD },
  });
  assert.equal(status, 200, JSON.stringify(body));
  return body.data.token;
}

before(async () => {
  await cleanup(); // เผื่อรอบก่อนพังกลางทาง
  await insertUser('owner', { adminRole: 'owner' });
  await insertUser('staff', { adminRole: 'staff' });
  await insertUser('customer');
  await insertUser('newbie', { verified: false });
  await insertUser('banned', { active: false });

  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  // app เล็ก ๆ สำหรับทดสอบ middleware แต่ละตัวโดยตรง
  const guardApp = express();
  const ok = (req, res) => res.json({ data: { user_id: req.user.user_id } });
  guardApp.get('/any', requireAuth, ok);
  guardApp.get('/admin', requireAuth, requireRole('admin'), ok);
  guardApp.get('/admin-short', requireAdmin, ok);
  guardApp.get('/owner', requireAuth, requireRole('owner'), ok);
  guardApp.get('/verified', requireAuth, requireVerified, ok);
  guardApp.use(errorHandler);
  guardServer = guardApp.listen(0);
  await new Promise((r) => guardServer.once('listening', r));
  guardBase = `http://127.0.0.1:${guardServer.address().port}`;
});

after(async () => {
  server.close();
  guardServer.close();
  await cleanup();
  await pool.end();
});

// ---------- POST /api/auth/login ----------

test('ล็อกอินแอดมินสำเร็จ → ได้ token และข้อมูลผู้ใช้ (ไม่มี password_hash)', async () => {
  const { status, body } = await api('POST', '/auth/login', {
    body: { username: `${TAG}_owner`, password: PASSWORD },
  });
  assert.equal(status, 200);
  assert.equal(typeof body.data.token, 'string');
  assert.deepEqual(body.data.user, {
    user_id: ids.owner,
    username: `${TAG}_owner`,
    email: `${TAG}_owner@example.com`,
    display_name: `${TAG}_owner`,
    is_email_verified: true,
    is_admin: true,
    admin_role: 'owner',
  });
});

test('ล็อกอินลูกค้าสำเร็จ → is_admin = false', async () => {
  const { status, body } = await api('POST', '/auth/login', {
    body: { username: `  ${TAG}_customer  `, password: PASSWORD }, // เว้นวรรคหัวท้าย username ได้
  });
  assert.equal(status, 200);
  assert.equal(body.data.user.is_admin, false);
  assert.equal(body.data.user.admin_role, null);
});

test('รหัสผิด กับ username ที่ไม่มี → 401 ข้อความเดียวกัน', async () => {
  const wrong = await api('POST', '/auth/login', {
    body: { username: `${TAG}_owner`, password: 'wrong-password' },
  });
  const missing = await api('POST', '/auth/login', {
    body: { username: `${TAG}_nobody`, password: PASSWORD },
  });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error.code, 'INVALID_CREDENTIALS');
  assert.deepEqual(missing, wrong);
});

test('ไม่กรอก username/password → 400 บอกช่องที่ขาด', async () => {
  const { status, body } = await api('POST', '/auth/login', { body: { username: ' ' } });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.deepEqual(
    body.error.details.map((d) => d.field),
    ['username', 'password']
  );
});

test('ส่งค่าที่ไม่ใช่ข้อความ หรือยาวเกิน → 400', async () => {
  const notString = await api('POST', '/auth/login', { body: { username: 123, password: ['x'] } });
  assert.equal(notString.status, 400);
  const tooLong = await api('POST', '/auth/login', {
    body: { username: `${TAG}_owner`, password: 'x'.repeat(101) },
  });
  assert.equal(tooLong.status, 400);
});

test('บัญชีที่ปิดแล้ว (is_active = false) ล็อกอินไม่ได้ → 403', async () => {
  const { status, body } = await api('POST', '/auth/login', {
    body: { username: `${TAG}_banned`, password: PASSWORD },
  });
  assert.equal(status, 403);
  assert.equal(body.error.code, 'ACCOUNT_DISABLED');
});

test('บัญชีที่ปิดแล้วแต่ใส่รหัสผิด → 401 ไม่บอกว่าบัญชีถูกปิด', async () => {
  const { status, body } = await api('POST', '/auth/login', {
    body: { username: `${TAG}_banned`, password: 'wrong-password' },
  });
  assert.equal(status, 401);
  assert.equal(body.error.code, 'INVALID_CREDENTIALS');
});

// ---------- GET /api/auth/me + requireAuth ----------

test('GET /auth/me ไม่มี token → 401', async () => {
  const { status, body } = await api('GET', '/auth/me');
  assert.equal(status, 401);
  assert.equal(body.error.code, 'UNAUTHORIZED');
});

test('GET /auth/me token มั่ว / เซ็นด้วย secret อื่น / หมดอายุ → 401', async () => {
  const forged = jwt.sign({ sub: String(ids.owner) }, 'not-our-secret');
  const expired = jwt.sign(
    { sub: String(ids.owner), exp: Math.floor(Date.now() / 1000) - 60 },
    env.jwtSecret
  );
  for (const token of ['garbage', forged, expired]) {
    const { status } = await api('GET', '/auth/me', { token });
    assert.equal(status, 401, token);
  }
});

test('GET /auth/me token ถูก → ได้ข้อมูลผู้ใช้ที่ล็อกอินอยู่', async () => {
  const token = await loginAs('staff');
  const { status, body } = await api('GET', '/auth/me', { token });
  assert.equal(status, 200);
  assert.equal(body.data.user_id, ids.staff);
  assert.equal(body.data.admin_role, 'staff');
});

test('ปิดบัญชีหลังล็อกอินแล้ว → token เดิมใช้ต่อไม่ได้ทันที (401)', async () => {
  await insertUser('later');
  const token = await loginAs('later');
  assert.equal((await api('GET', '/auth/me', { token })).status, 200);

  await query('UPDATE "user" SET is_active = FALSE WHERE user_id = $1', [ids.later]);
  assert.equal((await api('GET', '/auth/me', { token })).status, 401);
});

// ---------- requireRole / requireAdmin / requireVerified ----------

test('route แอดมิน: ไม่ล็อกอิน → 401, ลูกค้า → 403, แอดมิน → 200', async () => {
  const customer = await loginAs('customer');
  const staff = await loginAs('staff');
  for (const path of ['/admin', '/admin-short']) {
    assert.equal((await guard(path)).status, 401, path);
    const denied = await guard(path, { token: customer });
    assert.equal(denied.status, 403, path);
    assert.equal(denied.body.error.code, 'FORBIDDEN');
    assert.equal((await guard(path, { token: staff })).status, 200, path);
  }
});

test('route เจ้าของร้าน: staff → 403, owner → 200', async () => {
  assert.equal((await guard('/owner', { token: await loginAs('staff') })).status, 403);
  assert.equal((await guard('/owner', { token: await loginAs('owner') })).status, 200);
});

test('ถอดสิทธิ์แอดมินแล้ว → token เดิมเข้า route แอดมินไม่ได้ทันที (403)', async () => {
  await insertUser('demoted', { adminRole: 'staff' });
  const token = await loginAs('demoted');
  assert.equal((await guard('/admin', { token })).status, 200);

  await query('DELETE FROM admin WHERE user_id = $1', [ids.demoted]);
  assert.equal((await guard('/admin', { token })).status, 403);
  assert.equal((await guard('/any', { token })).status, 200); // ยังล็อกอินอยู่ แค่ไม่ใช่แอดมินแล้ว
});

test('requireVerified: ยังไม่ยืนยันอีเมล → 403 EMAIL_NOT_VERIFIED, ยืนยันแล้ว → 200', async () => {
  const denied = await guard('/verified', { token: await loginAs('newbie') });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, 'EMAIL_NOT_VERIFIED');
  assert.equal((await guard('/verified', { token: await loginAs('customer') })).status, 200);
});

test('requireRole ใส่ชื่อ role ผิด → error ตั้งแต่ตอนเปิด server', () => {
  assert.throws(() => requireRole('superadmin'), /ไม่รู้จัก role/);
});
