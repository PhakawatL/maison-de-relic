// ทดสอบ rate limit ของระบบสมาชิก (R2): login / register / forgot-password / reset-password
// เทสต์อื่นปิด rate limit ไว้ (test/setup.js) ไฟล์นี้เปิดกลับก่อนโหลด app
process.env.RATE_LIMIT = 'on';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const app = require('../src/app');
const { pool, query } = require('../src/db/pool');
const { resetRateLimits } = require('../src/middleware/rateLimit');

const USERNAME = 'zzr2rl_user';
const PASSWORD = 'Test@1234';
let server;
let base;

async function post(path, body) {
  const res = await fetch(`${base}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, retryAfter: res.headers.get('retry-after'), body: await res.json() };
}

const login = (password) => post('/auth/login', { username: USERNAME, password });

before(async () => {
  await query('DELETE FROM "user" WHERE username = $1', [USERNAME]);
  const hash = await bcrypt.hash(PASSWORD, 4);
  await query(
    `INSERT INTO "user" (username, email, password_hash, first_name, last_name, display_name, is_email_verified)
     VALUES ($1, 'zzr2rl_user@example.com', $2, 'R2', 'Limit', 'R2', TRUE)`,
    [USERNAME, hash]
  );
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await query('DELETE FROM "user" WHERE username = $1', [USERNAME]);
  await pool.end();
});

beforeEach(() => resetRateLimits());

test('ล็อกอินผิด 10 ครั้ง → ครั้งที่ 11 ได้ 429 แม้รหัสถูก พร้อมบอกเวลาที่ต้องรอ', async () => {
  for (let i = 0; i < 10; i += 1) {
    assert.equal((await login('wrong-password')).status, 401);
  }
  const blocked = await login(PASSWORD);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, 'TOO_MANY_REQUESTS');
  const wait = blocked.body.error.details.retry_after;
  assert.ok(wait > 0 && wait <= 15 * 60);
  assert.equal(blocked.retryAfter, String(wait));
  assert.equal(blocked.body.error.message, 'ลองบ่อยเกินไป กรุณารอประมาณ 15 นาทีแล้วลองใหม่');
});

test('ล็อกอินสำเร็จไม่นับ: ล็อกอินถูก 15 ครั้งติดกันได้ทุกครั้ง แล้วยังผิดได้อีก 10 ครั้ง', async () => {
  for (let i = 0; i < 15; i += 1) {
    assert.equal((await login(PASSWORD)).status, 200);
  }
  for (let i = 0; i < 10; i += 1) {
    assert.equal((await login('wrong-password')).status, 401);
  }
  assert.equal((await login('wrong-password')).status, 429);
});

test('ขอลิงก์รีเซ็ตรหัสได้ 5 ครั้ง ครั้งที่ 6 ได้ 429', async () => {
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await post('/auth/forgot-password', { email: 'zzr2rl_nobody@example.com' })).status, 200);
  }
  assert.equal((await post('/auth/forgot-password', { email: 'zzr2rl_nobody@example.com' })).status, 429);
});

test('สมัครได้ 10 ครั้งต่อชั่วโมง (นับทุกครั้ง แม้ข้อมูลผิด) ครั้งที่ 11 ได้ 429', async () => {
  for (let i = 0; i < 10; i += 1) {
    assert.equal((await post('/auth/register', {})).status, 400);
  }
  assert.equal((await post('/auth/register', {})).status, 429);
});

test('ตั้งรหัสใหม่ด้วย token ผิด 10 ครั้ง → ครั้งที่ 11 ได้ 429', async () => {
  const body = { token: 'not-a-real-token', password: 'Brand@New99' };
  for (let i = 0; i < 10; i += 1) {
    assert.equal((await post('/auth/reset-password', body)).status, 400);
  }
  assert.equal((await post('/auth/reset-password', body)).status, 429);
});

test('แต่ละ endpoint นับแยกกัน: ล็อกอินโดนบล็อกแล้วยังขอลิงก์รีเซ็ตรหัสได้', async () => {
  for (let i = 0; i < 10; i += 1) await login('wrong-password');
  assert.equal((await login(PASSWORD)).status, 429);
  assert.equal((await post('/auth/forgot-password', { email: 'zzr2rl_nobody@example.com' })).status, 200);
});
