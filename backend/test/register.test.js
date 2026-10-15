// ทดสอบสมัครสมาชิก + ยืนยันอีเมลด้วย OTP (R2 · #17 · BR-01)
// อีเมลไม่ได้ส่งจริง: mailer.captureForTests() เก็บไว้ใน mailer.outbox แล้วอ่านรหัส OTP จากในนั้น
// ผู้ใช้ทดสอบขึ้นต้นด้วย zzr2reg และถูกลบตอนจบ
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const mailer = require('../src/utils/mailer');
mailer.captureForTests();

const app = require('../src/app');
const { pool, query } = require('../src/db/pool');

const TAG = 'zzr2reg';
let server;
let base;

async function cleanup() {
  await query(`DELETE FROM "user" WHERE username LIKE $1 OR email LIKE $1`, [`${TAG}\\_%`]);
}

async function api(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const signup = (key, extra = {}) => ({
  username: `${TAG}_${key}`,
  email: `${TAG}_${key}@Example.com`,
  password: 'Signup@1234',
  first_name: 'สมัคร',
  last_name: 'ใหม่',
  ...extra,
});

/** รหัส OTP ล่าสุดที่ส่งไปที่อีเมลนี้ */
function lastOtp(email) {
  const mail = mailer.outbox.filter((m) => m.to === email.toLowerCase()).at(-1);
  assert.ok(mail, `ไม่มีอีเมลถึง ${email}`);
  return mail.subject.match(/(\d{6})$/)[1];
}

async function register(key, extra) {
  const res = await api('POST', '/auth/register', { body: signup(key, extra) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

/** ย้อนเวลาของ OTP ล่าสุด ให้ขอรหัสใหม่ได้โดยไม่ต้องรอ 60 วินาที */
async function ageLastOtp(userId) {
  await query(
    `UPDATE otp_verification SET created_at = created_at - INTERVAL '2 minutes'
      WHERE otp_id = (SELECT MAX(otp_id) FROM otp_verification WHERE user_id = $1)`,
    [userId]
  );
}

before(async () => {
  await cleanup();
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await cleanup();
  await pool.end();
});

// ---------- สมัคร ----------

test('สมัครสำเร็จ → 201 ได้ token, ยังไม่ยืนยันอีเมล, ส่ง OTP ไปที่อีเมล', async () => {
  const data = await register('alice');
  assert.equal(typeof data.token, 'string');
  assert.equal(data.email_sent, true);
  assert.ok(new Date(data.otp_expires_at) > new Date());
  assert.equal(data.user.username, `${TAG}_alice`);
  assert.equal(data.user.email, `${TAG}_alice@example.com`); // เก็บเป็นตัวพิมพ์เล็ก
  assert.equal(data.user.display_name, 'สมัคร'); // ไม่ใส่ = ใช้ชื่อจริง
  assert.equal(data.user.is_email_verified, false);
  assert.equal(data.user.is_admin, false);

  const mail = mailer.outbox.at(-1);
  assert.equal(mail.to, `${TAG}_alice@example.com`);
  assert.match(mail.text, /\d{6}/);

  // รหัสในฐานข้อมูลเป็น hash ไม่ใช่รหัสจริง
  const { rows } = await query('SELECT code_hash FROM otp_verification WHERE user_id = $1', [data.user.user_id]);
  assert.notEqual(rows[0].code_hash, lastOtp(`${TAG}_alice@example.com`));
});

test('สมัครด้วยข้อมูลผิด → 400 บอกทุกช่อง', async () => {
  const { status, body } = await api('POST', '/auth/register', {
    body: { username: 'x', email: 'bad', password: '123' },
  });
  assert.equal(status, 400);
  assert.deepEqual(
    body.error.details.map((d) => d.field).sort(),
    ['email', 'first_name', 'last_name', 'password', 'username']
  );
});

test('username ซ้ำ → 409 บอกช่อง username', async () => {
  const { status, body } = await api('POST', '/auth/register', {
    body: signup('alice', { email: `${TAG}_other@example.com` }),
  });
  assert.equal(status, 409);
  assert.equal(body.error.details[0].field, 'username');
});

test('ผู้ใช้ที่ยังไม่ยืนยัน: ล็อกอินได้ แต่เพิ่มที่อยู่ไม่ได้ (403)', async () => {
  const login = await api('POST', '/auth/login', { body: { username: `${TAG}_alice`, password: 'Signup@1234' } });
  assert.equal(login.status, 200);
  assert.equal(login.body.data.user.is_email_verified, false);
  const res = await api('POST', '/addresses', {
    token: login.body.data.token,
    body: { recipient_name: 'a', phone: '0812345678', line1: 'a', district: 'a', province: 'a', postcode: '10400' },
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'EMAIL_NOT_VERIFIED');
});

// ---------- ยืนยัน OTP ----------

test('รหัสผิด → 400 INVALID_OTP บอกครั้งที่เหลือ, รหัสถูก → ยืนยันแล้ว, กดซ้ำก็ยังผ่าน', async () => {
  const { token, user } = await register('bob');
  const code = lastOtp(`${TAG}_bob@example.com`);
  const wrong = code === '000000' ? '111111' : '000000';

  const bad = await api('POST', '/auth/verify-email', { token, body: { code: wrong } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'INVALID_OTP');
  assert.equal(bad.body.error.details.remaining_attempts, 4);

  const ok = await api('POST', '/auth/verify-email', { token, body: { code: ` ${code} ` } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.user_id, user.user_id);
  assert.equal(ok.body.data.is_email_verified, true);

  const again = await api('POST', '/auth/verify-email', { token, body: { code } });
  assert.equal(again.status, 200);

  const resend = await api('POST', '/auth/resend-otp', { token });
  assert.equal(resend.status, 409);
  assert.equal(resend.body.error.code, 'ALREADY_VERIFIED');
});

test('ยืนยันแล้วเพิ่มที่อยู่ได้ และสมัครซ้ำด้วยอีเมลที่ยืนยันแล้ว → 409', async () => {
  const login = await api('POST', '/auth/login', { body: { username: `${TAG}_bob`, password: 'Signup@1234' } });
  const res = await api('POST', '/addresses', {
    token: login.body.data.token,
    body: { recipient_name: 'a', phone: '0812345678', line1: 'a', district: 'a', province: 'a', postcode: '10400' },
  });
  assert.equal(res.status, 201);

  const dup = await api('POST', '/auth/register', { body: signup('bob2', { email: `${TAG}_bob@example.com` }) });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.details[0].field, 'email');
});

test('กรอกผิดครบ 5 ครั้ง → รหัสนั้นใช้ไม่ได้แม้กรอกถูก (OTP_EXPIRED) ต้องขอรหัสใหม่', async () => {
  const { token, user } = await register('carol');
  const code = lastOtp(`${TAG}_carol@example.com`);
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 4; i >= 0; i--) {
    const res = await api('POST', '/auth/verify-email', { token, body: { code: wrong } });
    assert.equal(res.body.error.code, i === 0 ? 'OTP_EXPIRED' : 'INVALID_OTP');
  }
  const blocked = await api('POST', '/auth/verify-email', { token, body: { code } });
  assert.equal(blocked.body.error.code, 'OTP_EXPIRED');

  // ขอรหัสใหม่ทันที → 429 ต้องรอ 60 วินาที
  const tooSoon = await api('POST', '/auth/resend-otp', { token });
  assert.equal(tooSoon.status, 429);
  assert.ok(tooSoon.body.error.details.retry_after > 0);

  await ageLastOtp(user.user_id);
  const resend = await api('POST', '/auth/resend-otp', { token });
  assert.equal(resend.status, 200);
  assert.equal(resend.body.data.email_sent, true);
  const newCode = lastOtp(`${TAG}_carol@example.com`);

  if (newCode !== code) {
    // รหัสเก่าใช้ไม่ได้แล้ว (ใช้ได้เฉพาะรหัสล่าสุด)
    const old = await api('POST', '/auth/verify-email', { token, body: { code } });
    assert.equal(old.body.error.code, 'INVALID_OTP');
  }
  const ok = await api('POST', '/auth/verify-email', { token, body: { code: newCode } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.is_email_verified, true);
});

test('รหัสหมดอายุ (เกิน 10 นาที) → OTP_EXPIRED', async () => {
  const { token, user } = await register('dave');
  const code = lastOtp(`${TAG}_dave@example.com`);
  await query(`UPDATE otp_verification SET expires_at = NOW() - INTERVAL '1 second' WHERE user_id = $1`, [user.user_id]);
  const res = await api('POST', '/auth/verify-email', { token, body: { code } });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'OTP_EXPIRED');
});

test('ยืนยันโดยไม่ล็อกอิน → 401, รหัสไม่ใช่ตัวเลข 6 หลัก → 400', async () => {
  assert.equal((await api('POST', '/auth/verify-email', { body: { code: '123456' } })).status, 401);
  const { token } = await register('erin');
  for (const code of ['12345', 'abcdef', 1234567, null]) {
    const res = await api('POST', '/auth/verify-email', { token, body: { code } });
    assert.equal(res.status, 400, String(code));
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  }
});

// ---------- สมัครทับบัญชีที่ยังไม่ยืนยัน ----------

test('สมัครซ้ำด้วยอีเมลที่ยังไม่ยืนยัน → เขียนทับแถวเดิม และ token เก่าใช้ไม่ได้', async () => {
  // คนแรกสมัครด้วยอีเมลนี้แต่ไม่เคยยืนยัน
  const first = await register('squat', { email: `${TAG}_owner_of_mail@example.com`, password: 'Squat@1234' });
  // เจ้าของอีเมลตัวจริงมาสมัคร
  const real = await register('realowner', { email: `${TAG}_owner_of_mail@example.com` });

  assert.equal(real.user.user_id, first.user.user_id); // แถวเดิม
  assert.equal(real.user.username, `${TAG}_realowner`);
  assert.equal((await api('GET', '/auth/me', { token: first.token })).status, 401);
  assert.equal((await api('GET', '/auth/me', { token: real.token })).status, 200);

  // รหัสผ่านเดิมของคนแรกใช้ไม่ได้แล้ว
  const oldLogin = await api('POST', '/auth/login', { body: { username: `${TAG}_squat`, password: 'Squat@1234' } });
  assert.equal(oldLogin.status, 401);
});

test('อีเมลของบัญชีที่ถูกปิด สมัครทับไม่ได้ แม้ยังไม่ยืนยัน → 409', async () => {
  const hash = await bcrypt.hash('x', 4);
  const { rows } = await query(
    `INSERT INTO "user" (username, email, password_hash, first_name, last_name, display_name, is_email_verified, is_active)
     VALUES ($1, $2, $3, 'a', 'b', 'c', FALSE, FALSE) RETURNING user_id`,
    [`${TAG}_closed`, `${TAG}_closed@example.com`, hash]
  );
  assert.ok(rows[0].user_id);
  const res = await api('POST', '/auth/register', { body: signup('closed2', { email: `${TAG}_closed@example.com` }) });
  assert.equal(res.status, 409);
});
