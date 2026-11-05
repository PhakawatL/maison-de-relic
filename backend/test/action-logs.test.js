// ทดสอบประวัติการทำงานของผู้ดูแล (R1 · BR-31 · #10): GET /api/admin/action-logs (owner)
// และ history ในหน้ารายละเอียดคำขอคืนเงิน / เคสแจ้งปัญหา (แอดมินทุกคน)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../src/db/pool');
const { createFixtures } = require('./helpers/r1-fixtures');

const fx = createFixtures('zzr1log');
const u = {};
let refundId;
let ticketId;

before(async () => {
  await fx.cleanup();
  u.boss = await fx.user('boss', { admin: 'owner' });
  u.staff = await fx.user('staff', { admin: 'staff' });
  u.alice = await fx.user('alice');
  const vase = await fx.product('vase', { price: 900, stock: 1, createdBy: u.boss.id });
  const order = await fx.order(u.alice, [{ product: vase, qty: 1 }], { deliveredDaysAgo: 1 });

  await fx.start();
  for (const key of ['boss', 'staff', 'alice']) await fx.login(key);

  // staff อนุมัติคำขอคืนเงิน + ตอบเคส (ระบบรับเคสให้ + เปลี่ยนเป็นกำลังดำเนินการให้เอง) · boss ปิดเคส
  const refund = await fx.api('POST', '/refund-requests', {
    as: 'alice',
    body: { order_item_id: order.items[0].id, refund_qty: 1, reason: 'แจกันร้าวที่ฐาน' },
  });
  refundId = refund.body.data.refund_id;
  await fx.api('PATCH', `/admin/refund-requests/${refundId}`, {
    as: 'staff',
    body: { action: 'approve', restock_decision: 'write_off', note: 'ร้าวจริงตามรูป' },
  });
  const ticket = await fx.api('POST', '/support-tickets', {
    as: 'alice',
    body: { subject: 'สอบถามการคืนเงิน zzr1log', category: 'payment', body: 'เงินจะเข้าบัญชีเมื่อไร' },
  });
  ticketId = ticket.body.data.ticket_id;
  await fx.api('PATCH', `/admin/support-tickets/${ticketId}`, { as: 'staff', body: { admin_reply: 'ภายใน 3 วันทำการครับ' } });
  await fx.api('PATCH', `/admin/support-tickets/${ticketId}`, { as: 'boss', body: { status: 'closed' } });
});

after(async () => {
  await fx.stop();
  await fx.cleanup();
  await pool.end();
});

const logs = (as, qs = '') => fx.api('GET', `/admin/action-logs${qs}`, { as });

test('ดูได้เฉพาะ owner: ไม่ล็อกอิน 401 · staff / ลูกค้า 403', async () => {
  assert.equal((await logs()).status, 401);
  assert.equal((await logs('staff')).status, 403);
  assert.equal((await logs('alice')).status, 403);
  assert.equal((await logs('boss')).status, 200);
});

test('กรองตามผู้ดูแล → log ของคนนั้น ล่าสุดก่อน พร้อมชื่อและรหัสของสิ่งที่ถูกเปลี่ยน', async () => {
  const res = await logs('boss', `?admin=${u.staff.id}`);
  assert.equal(res.status, 200);
  // ตอบเคสครั้งเดียวได้ 3 แถว (ตอบ · เปลี่ยนสถานะ · รับเคส) เวลาเดียวกัน → เรียงตาม log_id ใหม่สุดก่อน
  assert.deepEqual(res.body.data.map((l) => l.action_type), ['assign_ticket', 'update_ticket_status', 'reply_ticket', 'approve_refund']);
  const [, status, reply, approve] = res.body.data;
  assert.equal(reply.admin.username, 'zzr1log_staff');
  assert.equal(reply.target_type, 'support_ticket');
  assert.equal(reply.target_code, `TK${String(ticketId).padStart(3, '0')}`);
  assert.equal(reply.target_name, 'สอบถามการคืนเงิน zzr1log');
  assert.equal(status.target_id, ticketId, 'ตอบเคสที่ยังเปิดอยู่ → สถานะเป็นกำลังดำเนินการให้เอง');
  assert.equal(approve.target_code, `RF${String(refundId).padStart(3, '0')}`);
  assert.equal(approve.target_name, 'vase zzr1log', 'ชื่อสินค้าของคำขอคืนเงิน');
  assert.match(approve.note, /ตัดจำหน่าย/);
  assert.equal(res.body.meta.total, 4);
  assert.ok(res.body.meta.admins.some((a) => a.user_id === u.boss.id), 'ตัวเลือกผู้ดูแลในตัวกรอง');
  assert.ok(res.body.meta.actions.includes('approve_refund'));
  assert.ok(res.body.meta.target_types.includes('refund_request'));
});

test('ค้นหาด้วยรหัส RF / TK · ข้อความ · กรองประเภทการกระทำ / สิ่งที่ถูกเปลี่ยน', async () => {
  const byRefund = await logs('boss', `?q=RF${String(refundId).padStart(3, '0')}`);
  assert.deepEqual(byRefund.body.data.map((l) => l.action_type), ['approve_refund']);

  const byTicket = await logs('boss', `?q=tk${ticketId}`);
  assert.equal(byTicket.body.meta.total, 4, 'ตอบ + เปลี่ยนสถานะ + รับเคสอัตโนมัติ + owner ปิดเคส');

  const byText = await logs('boss', `?q=${encodeURIComponent('สอบถามการคืนเงิน zzr1log')}&admin=${u.boss.id}`);
  assert.deepEqual(byText.body.data.map((l) => [l.action_type, l.admin.user_id]), [['update_ticket_status', u.boss.id]]);

  const byAction = await logs('boss', `?action=approve_refund&admin=${u.staff.id}`);
  assert.equal(byAction.body.meta.total, 1);
  const byTarget = await logs('boss', `?target=support_ticket&admin=${u.staff.id}`);
  assert.equal(byTarget.body.meta.total, 3);
});

test('ตัวกรองผิดรูปแบบ → 400 บอกทุกช่อง · ไม่มี API แก้ / ลบ log', async () => {
  const bad = await logs('boss', '?admin=abc&action=DROP%20TABLE&target=1x&pageSize=999');
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.body.error.details.map((d) => d.field).sort(), ['pageSize']);
  const bad2 = await logs('boss', '?admin=abc&action=DROP%20TABLE&target=1x');
  assert.deepEqual(bad2.body.error.details.map((d) => d.field).sort(), ['action', 'admin', 'target']);
  assert.equal((await fx.api('DELETE', '/admin/action-logs/1', { as: 'boss' })).status, 404);
});

test('history ในหน้ารายละเอียด: staff เห็นประวัติของคำขอ / เคสที่เปิดดู (เก่าสุดก่อน)', async () => {
  const refund = await fx.api('GET', `/admin/refund-requests/${refundId}`, { as: 'staff' });
  assert.deepEqual(
    refund.body.data.history.map((h) => [h.action_type, h.admin.display_name]),
    [['approve_refund', 'zzr1log_staff']]
  );
  const ticket = await fx.api('GET', `/admin/support-tickets/${ticketId}`, { as: 'staff' });
  assert.deepEqual(ticket.body.data.history.map((h) => h.action_type), [
    'reply_ticket',
    'update_ticket_status',
    'assign_ticket',
    'update_ticket_status',
  ]);
  // ลูกค้าไม่เห็นประวัติฝั่งผู้ดูแล
  const mine = await fx.api('GET', `/refund-requests/${refundId}`, { as: 'alice' });
  assert.equal(mine.body.data.history, undefined);
});
