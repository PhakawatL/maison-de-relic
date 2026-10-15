// ทดสอบจัดการบัญชีผู้ดูแล (R2 · #14): /api/admins
// ใส่ผู้ใช้ทดสอบของตัวเองก่อน แล้วลบทิ้งตอนจบ (username ขึ้นต้นด้วย zzr2adm เพื่อกรองเฉพาะของเทสนี้)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const app = require('../src/app');
const { pool, query } = require('../src/db/pool');

const TAG = 'zzr2adm';
const PASSWORD = 'Test@1234';
const ids = {};
const tokens = {};
let server;
let base;

async function insertUser(key, { adminRole = null, active = true } = {}) {
  const hash = await bcrypt.hash(PASSWORD, 4);
  const { rows } = await query(
    `INSERT INTO "user" (username, email, password_hash, first_name, last_name, display_name, role, is_email_verified, is_active)
     VALUES ($1, $2, $3, 'R2', 'Admin', $1, $4, TRUE, $5) RETURNING user_id`,
    [`${TAG}_${key}`, `${TAG}_${key}@example.com`, hash, adminRole ? 'admin' : 'customer', active]
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

async function login(key, password = PASSWORD) {
  return api('POST', '/auth/login', { body: { username: `${TAG}_${key}`, password } });
}

async function logsFor(targetId) {
  const { rows } = await query(
    `SELECT admin_id, action_type, note FROM admin_action_log
      WHERE target_type = 'user' AND target_id = $1 ORDER BY log_id`,
    [targetId]
  );
  return rows.map((r) => ({ ...r, admin_id: Number(r.admin_id) }));
}

const newAdmin = (key, extra = {}) => ({
  username: `${TAG}_${key}`,
  email: `${TAG}_${key}@Example.com `, // ตัวพิมพ์ใหญ่ + space ต้องถูกจัดให้เรียบร้อย
  password: 'NewPass@1234',
  first_name: 'ใหม่',
  last_name: 'ทดสอบ',
  ...extra,
});

before(async () => {
  await cleanup();
  await insertUser('owner', { adminRole: 'owner' });
  await insertUser('staff', { adminRole: 'staff' });
  await insertUser('customer');
  await insertUser('retired', { adminRole: 'staff', active: false });

  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  for (const key of ['owner', 'staff', 'customer']) {
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
  assert.equal((await api('GET', '/admins')).status, 401);
  assert.equal((await api('GET', '/admins', { as: 'customer' })).status, 403);
});

test('staff ดูได้ แต่เพิ่ม / แก้ / ปิดบัญชีไม่ได้ (403)', async () => {
  assert.equal((await api('GET', '/admins', { as: 'staff' })).status, 200);
  assert.equal((await api('GET', `/admins/${ids.owner}`, { as: 'staff' })).status, 200);
  assert.equal((await api('POST', '/admins', { as: 'staff', body: newAdmin('bystaff') })).status, 403);
  assert.equal((await api('PATCH', `/admins/${ids.owner}`, { as: 'staff', body: { first_name: 'x' } })).status, 403);
  assert.equal((await api('DELETE', `/admins/${ids.owner}`, { as: 'staff' })).status, 403);
});

// ---------- ค้นหา ----------

test('รายชื่อ: เห็นเฉพาะผู้ดูแล ไม่เห็นลูกค้า ไม่มี password_hash', async () => {
  const { status, body } = await api('GET', `/admins?q=${TAG}&pageSize=50`, { as: 'owner' });
  assert.equal(status, 200);
  const names = body.data.map((a) => a.username);
  assert.ok(names.includes(`${TAG}_owner`));
  assert.ok(names.includes(`${TAG}_retired`));
  assert.ok(!names.includes(`${TAG}_customer`));
  assert.ok(body.data.every((a) => !('password_hash' in a)));
  // ใช้งานอยู่ขึ้นก่อน owner ขึ้นก่อน staff
  assert.deepEqual(names.slice(0, 2), [`${TAG}_owner`, `${TAG}_staff`]);
  assert.equal(names.at(-1), `${TAG}_retired`);
});

test('กรองสถานะ active / inactive และแบ่งหน้า', async () => {
  const active = await api('GET', `/admins?q=${TAG}&status=active`, { as: 'owner' });
  assert.ok(active.body.data.every((a) => a.is_active));
  const inactive = await api('GET', `/admins?q=${TAG}&status=inactive`, { as: 'owner' });
  assert.deepEqual(inactive.body.data.map((a) => a.username), [`${TAG}_retired`]);

  const page1 = await api('GET', `/admins?q=${TAG}&pageSize=1&page=1`, { as: 'owner' });
  assert.equal(page1.body.data.length, 1);
  assert.equal(page1.body.meta.pageSize, 1);
  assert.ok(page1.body.meta.total >= 3);
});

test('query ผิด → 400 บอกช่องที่ผิด', async () => {
  const { status, body } = await api('GET', '/admins?status=deleted&pageSize=999', { as: 'owner' });
  assert.equal(status, 400);
  assert.deepEqual(body.error.details.map((d) => d.field).sort(), ['pageSize', 'status']);
});

test('ดูคนเดียว: ลูกค้าหรือ id ที่ไม่มี → 404, id ผิดรูปแบบ → 400', async () => {
  assert.equal((await api('GET', `/admins/${ids.customer}`, { as: 'owner' })).status, 404);
  assert.equal((await api('GET', '/admins/999999999', { as: 'owner' })).status, 404);
  assert.equal((await api('GET', '/admins/abc', { as: 'owner' })).status, 400);
});

// ---------- เพิ่ม ----------

test('owner เพิ่มผู้ดูแล → 201, ล็อกอินได้ทันที, บันทึก log', async () => {
  const { status, body } = await api('POST', '/admins', { as: 'owner', body: newAdmin('created') });
  assert.equal(status, 201);
  ids.created = body.data.user_id;
  assert.equal(body.data.email, `${TAG}_created@example.com`);
  assert.equal(body.data.admin_role, 'staff'); // ไม่ระบุ = staff
  assert.equal(body.data.display_name, 'ใหม่'); // ไม่ระบุ = ชื่อจริง
  assert.equal(body.data.is_active, true);

  const loginRes = await login('created', 'NewPass@1234');
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.body.data.user.is_admin, true);

  assert.deepEqual(await logsFor(ids.created), [
    { admin_id: ids.owner, action_type: 'create_admin', note: `เพิ่มผู้ดูแล ${TAG}_created (staff)` },
  ]);
});

test('เพิ่มโดย username / อีเมลซ้ำ → 409 บอกช่องที่ซ้ำ', async () => {
  const dupUser = await api('POST', '/admins', {
    as: 'owner',
    body: newAdmin('owner', { email: `${TAG}_other@example.com` }),
  });
  assert.equal(dupUser.status, 409);
  assert.equal(dupUser.body.error.details[0].field, 'username');

  const dupEmail = await api('POST', '/admins', {
    as: 'owner',
    body: newAdmin('fresh', { email: `${TAG}_OWNER@example.com` }),
  });
  assert.equal(dupEmail.status, 409);
  assert.equal(dupEmail.body.error.details[0].field, 'email');
});

test('เพิ่มโดยข้อมูลไม่ครบหรือผิดรูปแบบ → 400 บอกทุกช่องที่ผิด', async () => {
  const { status, body } = await api('POST', '/admins', {
    as: 'owner',
    body: { username: 'a b', email: 'not-an-email', password: 'short', admin_role: 'god', phone: 'abc' },
  });
  assert.equal(status, 400);
  assert.deepEqual(
    body.error.details.map((d) => d.field).sort(),
    ['admin_role', 'email', 'first_name', 'last_name', 'password', 'phone', 'username']
  );
});

// ---------- แก้ไข ----------

test('owner แก้ข้อมูลและระดับ → 200, log บอกช่องที่เปลี่ยน', async () => {
  await insertUser('editme', { adminRole: 'staff' });
  const { status, body } = await api('PATCH', `/admins/${ids.editme}`, {
    as: 'owner',
    body: { display_name: 'ชื่อใหม่', phone: '081-234-5678', admin_role: 'owner', first_name: 'R2' },
  });
  assert.equal(status, 200);
  assert.equal(body.data.display_name, 'ชื่อใหม่');
  assert.equal(body.data.phone, '081-234-5678');
  assert.equal(body.data.admin_role, 'owner');
  // first_name ส่งค่าเดิมมา → ไม่นับว่าแก้
  assert.deepEqual(await logsFor(ids.editme), [
    { admin_id: ids.owner, action_type: 'update_admin', note: 'แก้: ชื่อที่แสดง, เบอร์โทร, ระดับ staff → owner' },
  ]);
});

test('ตั้งรหัสผ่านใหม่ให้ผู้ดูแล → ล็อกอินด้วยรหัสใหม่ได้ รหัสเก่าใช้ไม่ได้', async () => {
  await insertUser('resetpw', { adminRole: 'staff' });
  const res = await api('PATCH', `/admins/${ids.resetpw}`, { as: 'owner', body: { password: 'Brand@New99' } });
  assert.equal(res.status, 200);
  assert.equal((await login('resetpw', 'Brand@New99')).status, 200);
  assert.equal((await login('resetpw', PASSWORD)).status, 401);
  assert.equal((await logsFor(ids.resetpw))[0].note, 'แก้: รหัสผ่าน');
});

test('แก้ไขโดยส่งค่าว่างในช่องบังคับ / เปลี่ยน username / ไม่มีอะไรให้แก้ → 400', async () => {
  const blank = await api('PATCH', `/admins/${ids.staff}`, { as: 'owner', body: { first_name: '  ' } });
  assert.equal(blank.status, 400);
  const rename = await api('PATCH', `/admins/${ids.staff}`, { as: 'owner', body: { username: 'newname' } });
  assert.equal(rename.status, 400);
  const empty = await api('PATCH', `/admins/${ids.staff}`, { as: 'owner', body: {} });
  assert.equal(empty.status, 400);
});

test('แก้ลูกค้าผ่าน /admins ไม่ได้ → 404', async () => {
  const { status } = await api('PATCH', `/admins/${ids.customer}`, { as: 'owner', body: { first_name: 'x' } });
  assert.equal(status, 404);
});

test('owner ลดระดับหรือปิดบัญชีตัวเองไม่ได้ → 409 แต่แก้ชื่อตัวเองได้', async () => {
  for (const body of [{ admin_role: 'staff' }, { is_active: false }]) {
    const res = await api('PATCH', `/admins/${ids.owner}`, { as: 'owner', body });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CANNOT_CHANGE_SELF');
  }
  assert.equal((await api('DELETE', `/admins/${ids.owner}`, { as: 'owner' })).status, 409);
  assert.equal(
    (await api('PATCH', `/admins/${ids.owner}`, { as: 'owner', body: { display_name: 'เจ้าของ' } })).status,
    200
  );
});

// ---------- ปิดบัญชี / เปิดคืน ----------

test('ปิดบัญชี → 204, ล็อกอินไม่ได้, token เดิมใช้ไม่ได้, เปิดคืนได้', async () => {
  await insertUser('leaving', { adminRole: 'staff' });
  tokens.leaving = (await login('leaving')).body.data.token;

  assert.equal((await api('DELETE', `/admins/${ids.leaving}`, { as: 'owner' })).status, 204);
  assert.equal((await login('leaving')).status, 403);
  assert.equal((await api('GET', '/admins', { as: 'leaving' })).status, 401);

  // ปิดซ้ำได้ ไม่ error และไม่ลง log ซ้ำ
  assert.equal((await api('DELETE', `/admins/${ids.leaving}`, { as: 'owner' })).status, 204);

  const reopen = await api('PATCH', `/admins/${ids.leaving}`, { as: 'owner', body: { is_active: true } });
  assert.equal(reopen.status, 200);
  assert.equal(reopen.body.data.is_active, true);
  assert.equal((await login('leaving')).status, 200);

  assert.deepEqual(
    (await logsFor(ids.leaving)).map((l) => l.action_type),
    ['deactivate_admin', 'reactivate_admin']
  );
});
