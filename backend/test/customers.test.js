// ทดสอบจัดการบัญชีลูกค้า (R2): /api/customers
// ใส่ผู้ใช้ทดสอบของตัวเองก่อน แล้วลบทิ้งตอนจบ (username ขึ้นต้นด้วย zzr2cus เพื่อกรองเฉพาะของเทสนี้)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const app = require('../src/app');
const { pool, query } = require('../src/db/pool');

const TAG = 'zzr2cus';
const PASSWORD = 'Test@1234';
const ids = {};
const tokens = {};
let server;
let base;

async function insertUser(key, { adminRole = null, active = true, verified = true } = {}) {
  const hash = await bcrypt.hash(PASSWORD, 4);
  const { rows } = await query(
    `INSERT INTO "user" (username, email, password_hash, first_name, last_name, display_name, role, is_email_verified, is_active)
     VALUES ($1, $2, $3, 'R2', 'Customer', $1, $4, $5, $6) RETURNING user_id`,
    [`${TAG}_${key}`, `${TAG}_${key}@example.com`, hash, adminRole ? 'admin' : 'customer', verified, active]
  );
  ids[key] = Number(rows[0].user_id);
  if (adminRole) {
    await query('INSERT INTO admin (user_id, admin_role) VALUES ($1, $2)', [ids[key], adminRole]);
  }
}

async function cleanup() {
  const like = `${TAG}\\_%`;
  // admin_action_log เป็น append-only ในการใช้งานจริง แต่ข้อมูลเทสต้องลบก่อน FK ถึงจะลบ admin ได้
  await query(
    `DELETE FROM admin_action_log
      WHERE admin_id IN (SELECT user_id FROM "user" WHERE username LIKE $1)
         OR (target_type = 'user' AND target_id IN (SELECT user_id FROM "user" WHERE username LIKE $1))`,
    [like]
  );
  await query(`DELETE FROM "user" WHERE username LIKE $1`, [like]);
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

async function login(key) {
  return api('POST', '/auth/login', { body: { username: `${TAG}_${key}`, password: PASSWORD } });
}

async function logsFor(targetId) {
  const { rows } = await query(
    `SELECT admin_id, action_type, note FROM admin_action_log
      WHERE target_type = 'user' AND target_id = $1 ORDER BY log_id`,
    [targetId]
  );
  return rows.map((r) => ({ ...r, admin_id: Number(r.admin_id) }));
}

before(async () => {
  await cleanup();
  await insertUser('owner', { adminRole: 'owner' });
  await insertUser('staff', { adminRole: 'staff' });
  await insertUser('alice');
  await insertUser('bob', { verified: false });
  await insertUser('gone', { active: false });

  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  for (const key of ['owner', 'staff', 'alice']) {
    tokens[key] = (await login(key)).body.data.token;
  }
});

after(async () => {
  server.close();
  await cleanup();
  await pool.end();
});

// ---------- สิทธิ์ ----------

test('ไม่ล็อกอิน → 401, ลูกค้า → 403', async () => {
  assert.equal((await api('GET', '/customers')).status, 401);
  assert.equal((await api('GET', '/customers', { as: 'alice' })).status, 403);
  assert.equal((await api('DELETE', `/customers/${ids.bob}`, { as: 'alice' })).status, 403);
});

test('staff ดูได้ แต่แก้ข้อมูลลูกค้าไม่ได้ (403)', async () => {
  assert.equal((await api('GET', '/customers', { as: 'staff' })).status, 200);
  assert.equal((await api('GET', `/customers/${ids.alice}`, { as: 'staff' })).status, 200);
  const edit = await api('PATCH', `/customers/${ids.alice}`, { as: 'staff', body: { first_name: 'x' } });
  assert.equal(edit.status, 403);
  // ส่งมาพร้อม is_active ก็ไม่ได้ ถ้ามีช่องอื่นปนมา
  const mixed = await api('PATCH', `/customers/${ids.alice}`, { as: 'staff', body: { is_active: true, phone: '0812345678' } });
  assert.equal(mixed.status, 403);
});

// ---------- ค้นหา ----------

test('รายชื่อ: เห็นเฉพาะลูกค้า ไม่เห็นผู้ดูแล ไม่มี password_hash', async () => {
  const { status, body } = await api('GET', `/customers?q=${TAG}&pageSize=50`, { as: 'owner' });
  assert.equal(status, 200);
  const names = body.data.map((c) => c.username);
  assert.deepEqual(names.slice().sort(), [`${TAG}_alice`, `${TAG}_bob`, `${TAG}_gone`]);
  assert.ok(body.data.every((c) => !('password_hash' in c) && !('admin_role' in c)));
  // ใช้งานอยู่ขึ้นก่อน ปิดบัญชีแล้วอยู่ท้าย
  assert.equal(names.at(-1), `${TAG}_gone`);
  assert.equal(body.data.find((c) => c.username === `${TAG}_bob`).is_email_verified, false);
});

test('กรองสถานะ active / inactive และแบ่งหน้า', async () => {
  const inactive = await api('GET', `/customers?q=${TAG}&status=inactive`, { as: 'staff' });
  assert.deepEqual(inactive.body.data.map((c) => c.username), [`${TAG}_gone`]);
  const active = await api('GET', `/customers?q=${TAG}&status=active`, { as: 'staff' });
  assert.equal(active.body.meta.total, 2);

  const page2 = await api('GET', `/customers?q=${TAG}&pageSize=2&page=2`, { as: 'owner' });
  assert.equal(page2.body.data.length, 1);
  assert.equal(page2.body.meta.total, 3);
});

test('query ผิด → 400 บอกช่องที่ผิด', async () => {
  const { status, body } = await api('GET', '/customers?status=x&page=0', { as: 'owner' });
  assert.equal(status, 400);
  assert.deepEqual(body.error.details.map((d) => d.field).sort(), ['page', 'status']);
});

test('ดูคนเดียว: ผู้ดูแลหรือ id ที่ไม่มี → 404, id ผิดรูปแบบ → 400', async () => {
  const found = await api('GET', `/customers/${ids.alice}`, { as: 'owner' });
  assert.equal(found.body.data.email, `${TAG}_alice@example.com`);
  const admin = await api('GET', `/customers/${ids.staff}`, { as: 'owner' });
  assert.equal(admin.status, 404);
  assert.equal(admin.body.error.code, 'CUSTOMER_NOT_FOUND');
  assert.equal((await api('GET', '/customers/999999999', { as: 'owner' })).status, 404);
  assert.equal((await api('GET', '/customers/abc', { as: 'owner' })).status, 400);
});

// ---------- แก้ไข (owner) ----------

test('owner แก้ข้อมูลลูกค้า → 200, log บอกช่องที่เปลี่ยน', async () => {
  const { status, body } = await api('PATCH', `/customers/${ids.alice}`, {
    as: 'owner',
    body: { display_name: 'อลิซ', phone: '081-234-5678', first_name: 'R2' },
  });
  assert.equal(status, 200);
  assert.equal(body.data.display_name, 'อลิซ');
  assert.equal(body.data.phone, '081-234-5678');
  assert.equal(body.data.is_email_verified, true); // ไม่ได้เปลี่ยนอีเมล → สถานะยืนยันเหมือนเดิม
  // first_name ส่งค่าเดิมมา → ไม่นับว่าแก้
  assert.deepEqual(await logsFor(ids.alice), [
    { admin_id: ids.owner, action_type: 'update_user', note: 'แก้: ชื่อที่แสดง, เบอร์โทร' },
  ]);
});

test('owner เปลี่ยนอีเมลลูกค้า → อีเมลใหม่ต้องยืนยันอีกครั้ง, อีเมลซ้ำ → 409', async () => {
  await insertUser('mover');
  const res = await api('PATCH', `/customers/${ids.mover}`, {
    as: 'owner',
    body: { email: ` ${TAG}_Moved@Example.com` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.email, `${TAG}_moved@example.com`);
  assert.equal(res.body.data.is_email_verified, false);

  const dup = await api('PATCH', `/customers/${ids.mover}`, {
    as: 'owner',
    body: { email: `${TAG}_owner@example.com` },
  });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.details[0].field, 'email');
});

test('แก้ไขด้วยข้อมูลผิด / เปลี่ยน username / ตั้งรหัสผ่าน / ไม่มีอะไรให้แก้ → 400', async () => {
  const blank = await api('PATCH', `/customers/${ids.alice}`, { as: 'owner', body: { last_name: ' ' } });
  assert.equal(blank.status, 400);
  const rename = await api('PATCH', `/customers/${ids.alice}`, { as: 'owner', body: { username: 'newname' } });
  assert.equal(rename.status, 400);
  // password ไม่ใช่ช่องที่ endpoint นี้รับ → ถูกข้าม เหลือไม่มีอะไรให้แก้
  const password = await api('PATCH', `/customers/${ids.alice}`, { as: 'owner', body: { password: 'Hacked@123' } });
  assert.equal(password.status, 400);
  assert.equal((await login('alice')).status, 200);
});

test('แก้ผู้ดูแลผ่าน /customers ไม่ได้ → 404', async () => {
  const res = await api('PATCH', `/customers/${ids.staff}`, { as: 'owner', body: { first_name: 'x' } });
  assert.equal(res.status, 404);
  assert.equal((await api('DELETE', `/customers/${ids.owner}`, { as: 'owner' })).status, 404);
});

// ---------- ปิดบัญชี / เปิดคืน (owner และ staff) ----------

test('staff ปิดบัญชีลูกค้า → 204, ล็อกอินไม่ได้, token เดิมใช้ไม่ได้ทันที, เปิดคืนได้', async () => {
  assert.equal((await api('GET', '/profile', { as: 'alice' })).status, 200);

  assert.equal((await api('DELETE', `/customers/${ids.alice}`, { as: 'staff' })).status, 204);
  assert.equal((await login('alice')).status, 403);
  assert.equal((await api('GET', '/profile', { as: 'alice' })).status, 401);

  // ปิดซ้ำได้ ไม่ error และไม่ลง log ซ้ำ
  assert.equal((await api('DELETE', `/customers/${ids.alice}`, { as: 'owner' })).status, 204);

  const reopen = await api('PATCH', `/customers/${ids.alice}`, { as: 'staff', body: { is_active: true } });
  assert.equal(reopen.status, 200);
  assert.equal(reopen.body.data.is_active, true);
  assert.equal((await login('alice')).status, 200);

  assert.deepEqual(
    (await logsFor(ids.alice)).slice(-2).map((l) => [l.admin_id, l.action_type]),
    [
      [ids.staff, 'deactivate_user'],
      [ids.staff, 'reactivate_user'],
    ]
  );
});
