// ทดสอบระบบแจ้งปัญหา (R1 · #10): /api/support-tickets (ลูกค้า) และ /api/admin/support-tickets (ผู้ดูแล)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../src/db/pool');
const { createFixtures } = require('./helpers/r1-fixtures');

const fx = createFixtures('zzr1tk');
const u = {}; // ผู้ใช้ทดสอบ
let gundam;
let draft;
let aliceOrder;
let bobOrder;

const open = (as, body) => fx.api('POST', '/support-tickets', { as, body });
const sample = (extra = {}) => ({
  subject: 'กล่องบุบระหว่างขนส่ง',
  category: 'damaged',
  body: 'ได้รับของแล้วกล่องด้านข้างบุบ อยากทราบว่าเคลมได้ไหม',
  ...extra,
});

before(async () => {
  await fx.cleanup();
  u.boss = await fx.user('boss', { admin: 'owner' });
  u.staff = await fx.user('staff', { admin: 'staff' });
  u.alice = await fx.user('alice');
  u.bob = await fx.user('bob');
  u.newbie = await fx.user('newbie', { verified: false });

  gundam = await fx.product('gundam', { createdBy: u.boss.id });
  draft = await fx.product('draft', { status: 'draft', createdBy: u.boss.id });
  aliceOrder = await fx.order(u.alice, [{ product: gundam, qty: 1 }]);
  bobOrder = await fx.order(u.bob, [{ product: gundam, qty: 1 }]);

  await fx.start();
  for (const key of ['boss', 'staff', 'alice', 'bob', 'newbie']) await fx.login(key);
});

after(async () => {
  await fx.stop();
  await fx.cleanup();
  await pool.end();
});

// ---------- สิทธิ์ ----------

test('ไม่ล็อกอิน → 401 · ลูกค้าเข้าฝั่งผู้ดูแล → 403', async () => {
  assert.equal((await fx.api('GET', '/support-tickets')).status, 401);
  assert.equal((await open(undefined, sample())).status, 401);
  assert.equal((await fx.api('GET', '/admin/support-tickets', { as: 'alice' })).status, 403);
});

test('ยังไม่ยืนยันอีเมล: ดูได้ (ว่าง) แต่เปิดเคสไม่ได้ → 403 EMAIL_NOT_VERIFIED', async () => {
  const list = await fx.api('GET', '/support-tickets', { as: 'newbie' });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.data, []);
  const res = await open('newbie', sample());
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'EMAIL_NOT_VERIFIED');
});

// ---------- ลูกค้าเปิดเคส ----------

test('เปิดเคสทั่วไป → 201 สถานะ open ยังไม่มีคำตอบ', async () => {
  const { status, body } = await open('alice', sample({ order_id: aliceOrder.id }));
  assert.equal(status, 201);
  assert.equal(body.data.status, 'open');
  assert.equal(body.data.category, 'damaged');
  assert.equal(body.data.order_id, aliceOrder.id);
  assert.equal(body.data.admin_reply, null);
  assert.match(body.data.code, /^TK\d{3,}$/);
  assert.equal(body.data.assignee, undefined, 'ลูกค้าไม่เห็นว่าผู้ดูแลคนไหนรับเรื่อง');
});

test('อ้างถึงคำสั่งซื้อของคนอื่น → 404 ORDER_NOT_FOUND', async () => {
  const res = await open('alice', sample({ order_id: bobOrder.id }));
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'ORDER_NOT_FOUND');
});

test('ข้อมูลไม่ครบ / ผิดรูปแบบ → 400 บอกทุกช่อง', async () => {
  const res = await open('alice', { subject: 'a', category: 'hacking', body: '', order_id: 'abc' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  const fields = res.body.error.details.map((d) => d.field).sort();
  assert.deepEqual(fields, ['body', 'category', 'order_id', 'subject']);
});

test('รายงานสินค้า: ระบบตั้งหัวข้อเป็น [รหัสสินค้า] ชื่อสินค้า · รายละเอียดไม่บังคับ', async () => {
  const res = await open('bob', { product_id: gundam.id, category: 'counterfeit' });
  assert.equal(res.status, 201);
  const code = `P${String(gundam.id).padStart(3, '0')}`;
  assert.equal(res.body.data.subject, `[${code}] ${gundam.title}`);
  assert.equal(res.body.data.body, '');

  // รายงานสินค้าใช้หมวดของการรายงานเท่านั้น
  const wrong = await open('bob', { product_id: gundam.id, category: 'damaged' });
  assert.equal(wrong.status, 400);

  // สินค้าที่ยังไม่วางขาย → 404
  const hidden = await open('bob', { product_id: draft.id, category: 'counterfeit' });
  assert.equal(hidden.status, 404);
  assert.equal(hidden.body.error.code, 'PRODUCT_NOT_FOUND');
});

test('ลูกค้าเห็นแค่เคสของตัวเอง · เคสของคนอื่นตอบ 404', async () => {
  const mine = await fx.api('GET', '/support-tickets', { as: 'alice' });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.meta.total, 1);
  const theirs = await fx.api('GET', '/support-tickets', { as: 'bob' });
  const bobTicket = theirs.body.data[0];
  const peek = await fx.api('GET', `/support-tickets/${bobTicket.ticket_id}`, { as: 'alice' });
  assert.equal(peek.status, 404);
  assert.equal(peek.body.error.code, 'TICKET_NOT_FOUND');
  assert.equal((await fx.api('GET', '/support-tickets/abc', { as: 'alice' })).body.error.code, 'INVALID_ID');
});

// ---------- ผู้ดูแล ----------

async function ticketOf(key) {
  return (await fx.api('GET', '/support-tickets', { as: key })).body.data[0];
}

test('ผู้ดูแลเห็นทุกเคส พร้อมผู้แจ้ง และตัวเลขแต่ละสถานะ', async () => {
  const { status, body } = await fx.api('GET', '/admin/support-tickets?q=zzr1tk', { as: 'staff' });
  assert.equal(status, 200);
  assert.equal(body.meta.total, 2);
  assert.deepEqual(body.meta.counts, { open: 2, pending: 0, closed: 0 });
  const usernames = body.data.map((t) => t.reporter.username).sort();
  assert.deepEqual(usernames, ['zzr1tk_alice', 'zzr1tk_bob']);
});

test('ค้นหาด้วยรหัสเคส TK / เลขคำสั่งซื้อ / หมวด', async () => {
  const alices = await ticketOf('alice');
  const byCode = await fx.api('GET', `/admin/support-tickets?q=TK${String(alices.ticket_id).padStart(3, '0')}`, { as: 'staff' });
  assert.deepEqual(byCode.body.data.map((t) => t.ticket_id), [alices.ticket_id]);

  const byOrder = await fx.api('GET', `/admin/support-tickets?q=${aliceOrder.id}`, { as: 'staff' });
  assert.ok(byOrder.body.data.some((t) => t.ticket_id === alices.ticket_id));

  const byCategory = await fx.api('GET', '/admin/support-tickets?q=zzr1tk&category=counterfeit', { as: 'staff' });
  assert.equal(byCategory.body.meta.total, 1);

  const bad = await fx.api('GET', '/admin/support-tickets?status=done&pageSize=500', { as: 'staff' });
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.body.error.details.map((d) => d.field).sort(), ['pageSize', 'status']);
});

test('ตอบกลับเคส open → เป็น pending และคนตอบเป็นผู้รับผิดชอบให้เอง + บันทึก log', async () => {
  const t = await ticketOf('alice');
  const res = await fx.api('PATCH', `/admin/support-tickets/${t.ticket_id}`, {
    as: 'staff',
    body: { admin_reply: 'ขออภัยครับ ส่งรูปกล่องมาที่อีเมลได้เลย' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'pending');
  assert.equal(res.body.data.assignee.user_id, u.staff.id);
  assert.equal(res.body.data.order.order_id, aliceOrder.id);

  const logs = await fx.logsOf(u.staff);
  assert.deepEqual(logs.map((l) => l.action_type).sort(), ['assign_ticket', 'reply_ticket', 'update_ticket_status']);
  assert.ok(logs.every((l) => l.target_type === 'support_ticket' && l.target_id === t.ticket_id));

  // ลูกค้าเห็นคำตอบ
  const seen = await fx.api('GET', `/support-tickets/${t.ticket_id}`, { as: 'alice' });
  assert.equal(seen.body.data.admin_reply, 'ขออภัยครับ ส่งรูปกล่องมาที่อีเมลได้เลย');
  assert.equal(seen.body.data.status, 'pending');
});

test('ปิดเคสลงเวลา closed_at · เปิดกลับล้างเวลา · ส่งค่าเดิมไม่บันทึก log ซ้ำ', async () => {
  const t = await ticketOf('alice');
  const closed = await fx.api('PATCH', `/admin/support-tickets/${t.ticket_id}`, { as: 'boss', body: { status: 'closed' } });
  assert.equal(closed.body.data.status, 'closed');
  assert.ok(closed.body.data.closed_at);
  // มีผู้รับผิดชอบอยู่แล้ว (staff) → ไม่เปลี่ยนเป็นคนที่ปิดเคส
  assert.equal(closed.body.data.assignee.user_id, u.staff.id);

  const before = (await fx.logsOf(u.boss)).length;
  await fx.api('PATCH', `/admin/support-tickets/${t.ticket_id}`, { as: 'boss', body: { status: 'closed' } });
  assert.equal((await fx.logsOf(u.boss)).length, before, 'ไม่มีอะไรเปลี่ยน ไม่ต้องบันทึก');

  const reopened = await fx.api('PATCH', `/admin/support-tickets/${t.ticket_id}`, { as: 'boss', body: { status: 'open' } });
  assert.equal(reopened.body.data.closed_at, null);
});

test('มอบหมายผู้รับผิดชอบ: ต้องเป็นผู้ดูแลที่ใช้งานอยู่ · ส่ง null = ยกเลิก', async () => {
  const t = await ticketOf('bob');
  const toCustomer = await fx.api('PATCH', `/admin/support-tickets/${t.ticket_id}`, {
    as: 'boss',
    body: { assigned_to: u.alice.id },
  });
  assert.equal(toCustomer.status, 400);
  assert.equal(toCustomer.body.error.details[0].field, 'assigned_to');

  const assigned = await fx.api('PATCH', `/admin/support-tickets/${t.ticket_id}`, {
    as: 'boss',
    body: { assigned_to: u.staff.id },
  });
  assert.equal(assigned.body.data.assignee.user_id, u.staff.id);
  assert.equal(assigned.body.data.status, 'open', 'มอบหมายอย่างเดียวไม่เปลี่ยนสถานะ');

  const mine = await fx.api('GET', '/admin/support-tickets?q=zzr1tk&assigned=me', { as: 'staff' });
  assert.equal(mine.body.meta.total, 2);

  const cleared = await fx.api('PATCH', `/admin/support-tickets/${t.ticket_id}`, { as: 'boss', body: { assigned_to: null } });
  assert.equal(cleared.body.data.assignee, null);
  const unassigned = await fx.api('GET', '/admin/support-tickets?q=zzr1tk&assigned=unassigned', { as: 'staff' });
  assert.deepEqual(unassigned.body.data.map((x) => x.ticket_id), [t.ticket_id]);
});

test('PATCH ข้อมูลผิด → 400 · ไม่มีเคสนี้ → 404', async () => {
  const t = await ticketOf('bob');
  const empty = await fx.api('PATCH', `/admin/support-tickets/${t.ticket_id}`, { as: 'staff', body: {} });
  assert.equal(empty.status, 400);
  const badStatus = await fx.api('PATCH', `/admin/support-tickets/${t.ticket_id}`, { as: 'staff', body: { status: 'done' } });
  assert.equal(badStatus.status, 400);
  const missing = await fx.api('PATCH', '/admin/support-tickets/999999999', { as: 'staff', body: { status: 'closed' } });
  assert.equal(missing.status, 404);
});

test('รายชื่อผู้รับผิดชอบที่เลือกได้ = ผู้ดูแลที่ใช้งานอยู่', async () => {
  const res = await fx.api('GET', '/admin/support-tickets/assignees', { as: 'staff' });
  assert.equal(res.status, 200);
  const ids = res.body.data.map((a) => a.user_id);
  assert.ok(ids.includes(u.boss.id) && ids.includes(u.staff.id));
  assert.ok(!ids.includes(u.alice.id));
});

test('ลบเคส: staff ไม่ได้ (403) · owner ได้ (204) และ log ยังเก็บหัวข้อไว้', async () => {
  const t = await ticketOf('bob');
  const denied = await fx.api('DELETE', `/admin/support-tickets/${t.ticket_id}`, { as: 'staff' });
  assert.equal(denied.status, 403);

  const ok = await fx.api('DELETE', `/admin/support-tickets/${t.ticket_id}`, { as: 'boss' });
  assert.equal(ok.status, 204);
  assert.equal((await fx.api('GET', `/admin/support-tickets/${t.ticket_id}`, { as: 'boss' })).status, 404);

  const log = (await fx.logsOf(u.boss)).find((l) => l.action_type === 'delete_ticket');
  assert.equal(log.target_id, t.ticket_id);
  assert.match(log.note, /gundam zzr1tk/);

  assert.equal((await fx.api('DELETE', `/admin/support-tickets/${t.ticket_id}`, { as: 'boss' })).status, 404);
});
