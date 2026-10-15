// ทดสอบลืมรหัสผ่าน / รีเซ็ตรหัสผ่าน (R2 · #17 · BR-02)
// อีเมลไม่ได้ส่งจริง: อ่านลิงก์รีเซ็ตจาก mailer.outbox · ผู้ใช้ทดสอบขึ้นต้นด้วย zzr2pw และถูกลบตอนจบ
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const mailer = require('../src/utils/mailer');
mailer.captureForTests();

const app = require('../src/app');
const env = require('../src/config/env');
const { pool, query } = require('../src/db/pool');

const TAG = 'zzr2pw';
const OLD_PASSWORD = 'Old@12345';
const ids = {};
let server;
let base;

async function insertUser(key, { verified = true, active = true } = {}) {
  const hash = await bcrypt.hash(OLD_PASSWORD, 4);
  const { rows } = await query(
    `INSERT INTO "user" (username, email, password_hash, first_name, last_name, display_name, is_email_verified, is_active)
     VALUES ($1, $2, $3, 'R2', 'Reset', $1, $4, $5) RETURNING user_id`,
    [`${TAG}_${key}`, `${TAG}_${key}@example.com`, hash, verified, active]
  );
  ids[key] = Number(rows[0].user_id);
}

async function cleanup() {
  await query(`DELETE FROM "user" WHERE username LIKE $1`, [`${TAG}\\_%`]);
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

const login = (key, password) =>
  api('POST', '/auth/login', { body: { username: `${TAG}_${key}`, password } });

const mailsTo = (key) => mailer.outbox.filter((m) => m.to === `${TAG}_${key}@example.com`);

/** token ในลิงก์ของอีเมลล่าสุด */
function lastResetToken(key) {
  const mail = mailsTo(key).at(-1);
  assert.ok(mail, `ไม่มีอีเมลถึง ${key}`);
  const match = mail.text.match(/\/reset-password\?token=([A-Za-z0-9_-]+)/);
  assert.ok(match, mail.text);
  return match[1];
}

before(async () => {
  await cleanup();
  await insertUser('alice');
  await insertUser('newbie', { verified: false });
  await insertUser('banned', { active: false });
  await insertUser('slow');

  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await cleanup();
  await pool.end();
});

const SAME_MESSAGE = 'ถ้ามีบัญชีที่ใช้อีเมลนี้ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปแล้ว กรุณาตรวจสอบกล่องจดหมาย';

test('ขอลิงก์: ตอบข้อความเดียวกันไม่ว่าจะมีอีเมลนี้หรือไม่ และไม่ส่งอีเมลถ้าไม่มีบัญชี', async () => {
  const before = mailer.outbox.length;
  const missing = await api('POST', '/auth/forgot-password', { body: { email: `${TAG}_nobody@example.com` } });
  const banned = await api('POST', '/auth/forgot-password', { body: { email: `${TAG}_banned@example.com` } });
  for (const res of [missing, banned]) {
    assert.equal(res.status, 200);
    assert.equal(res.body.data.message, SAME_MESSAGE);
  }
  assert.equal(mailer.outbox.length, before); // ไม่มีอีเมลออกไปเลย
});

test('ขอลิงก์ → ได้อีเมลที่มีลิงก์หน้าเว็บ, ตั้งรหัสใหม่แล้วล็อกอินด้วยรหัสใหม่ได้', async () => {
  const oldToken = (await login('alice', OLD_PASSWORD)).body.data.token;

  const res = await api('POST', '/auth/forgot-password', { body: { email: ` ${TAG}_ALICE@example.com ` } });
  assert.equal(res.body.data.message, SAME_MESSAGE);
  const mail = mailsTo('alice').at(-1);
  assert.ok(mail.text.includes(`${env.appUrl}/reset-password?token=`));
  const token = lastResetToken('alice');

  // ฐานข้อมูลเก็บแค่ hash
  const { rows } = await query('SELECT token_hash FROM password_reset_request WHERE user_id = $1', [ids.alice]);
  assert.notEqual(rows[0].token_hash, token);

  const reset = await api('POST', '/auth/reset-password', { body: { token, password: 'Brand@New1' } });
  assert.equal(reset.status, 200);

  assert.equal((await login('alice', 'Brand@New1')).status, 200);
  assert.equal((await login('alice', OLD_PASSWORD)).status, 401);
  // token ที่ล็อกอินไว้ก่อนรีเซ็ต ใช้ไม่ได้แล้ว (ออกจากระบบทุกเครื่อง)
  assert.equal((await api('GET', '/auth/me', { token: oldToken })).status, 401);

  // ใช้ลิงก์เดิมซ้ำ → 400
  const again = await api('POST', '/auth/reset-password', { body: { token, password: 'Another@12' } });
  assert.equal(again.status, 400);
  assert.equal(again.body.error.code, 'INVALID_RESET_TOKEN');
});

test('ขอลิงก์ถี่เกิน (ภายใน 60 วินาที) → ไม่ส่งอีเมลซ้ำ แต่ตอบเหมือนเดิม', async () => {
  await api('POST', '/auth/forgot-password', { body: { email: `${TAG}_slow@example.com` } });
  const res = await api('POST', '/auth/forgot-password', { body: { email: `${TAG}_slow@example.com` } });
  assert.equal(res.status, 200);
  assert.equal(mailsTo('slow').length, 1);
});

test('มีหลายลิงก์ ใช้อันหนึ่งไปแล้ว อันอื่นใช้ไม่ได้ด้วย', async () => {
  await api('POST', '/auth/forgot-password', { body: { email: `${TAG}_slow@example.com` } });
  const first = lastResetToken('slow');
  await query(`UPDATE password_reset_request SET created_at = created_at - INTERVAL '2 minutes' WHERE user_id = $1`, [ids.slow]);
  await api('POST', '/auth/forgot-password', { body: { email: `${TAG}_slow@example.com` } });
  const second = lastResetToken('slow');
  assert.notEqual(first, second);

  assert.equal((await api('POST', '/auth/reset-password', { body: { token: second, password: 'Second@123' } })).status, 200);
  assert.equal((await api('POST', '/auth/reset-password', { body: { token: first, password: 'First@1234' } })).status, 400);
});

test('ลิงก์หมดอายุ (เกิน 30 นาที) → 400', async () => {
  await query(`UPDATE password_reset_request SET created_at = created_at - INTERVAL '2 minutes' WHERE user_id = $1`, [ids.alice]);
  await api('POST', '/auth/forgot-password', { body: { email: `${TAG}_alice@example.com` } });
  const token = lastResetToken('alice');
  await query(
    `UPDATE password_reset_request SET expires_at = NOW() - INTERVAL '1 second' WHERE user_id = $1 AND used_at IS NULL`,
    [ids.alice]
  );
  const res = await api('POST', '/auth/reset-password', { body: { token, password: 'Late@12345' } });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_RESET_TOKEN');
});

test('ผู้ใช้ที่ยังไม่ยืนยันอีเมล รีเซ็ตรหัสผ่านสำเร็จ → ถือว่ายืนยันอีเมลแล้ว', async () => {
  await api('POST', '/auth/forgot-password', { body: { email: `${TAG}_newbie@example.com` } });
  await api('POST', '/auth/reset-password', { body: { token: lastResetToken('newbie'), password: 'Verified@1' } });
  const res = await login('newbie', 'Verified@1');
  assert.equal(res.body.data.user.is_email_verified, true);
});

test('ข้อมูลผิด: อีเมลผิดรูปแบบ / ไม่มี token / รหัสสั้นเกิน / token มั่ว → 400', async () => {
  assert.equal((await api('POST', '/auth/forgot-password', { body: { email: 'not-email' } })).status, 400);
  const missing = await api('POST', '/auth/reset-password', { body: { password: 'short' } });
  assert.equal(missing.status, 400);
  assert.deepEqual(missing.body.error.details.map((d) => d.field), ['token', 'password']);
  const garbage = await api('POST', '/auth/reset-password', { body: { token: 'garbage', password: 'Long@enough1' } });
  assert.equal(garbage.body.error.code, 'INVALID_RESET_TOKEN');
});
