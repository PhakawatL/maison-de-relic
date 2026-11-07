// ทดสอบ rate limit ของ API ที่สร้างข้อมูลของ R1 (แจ้งปัญหา / คืนเงิน / รีวิว) — นับต่อผู้ใช้ ไม่ใช่ต่อ IP
// เทสต์อื่นปิด rate limit ไว้ (test/setup.js) ไฟล์นี้เปิดกลับก่อนโหลด app
process.env.RATE_LIMIT = 'on';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../src/db/pool');
const { createFixtures } = require('./helpers/r1-fixtures');

const fx = createFixtures('zzr1rl');

before(async () => {
  await fx.cleanup();
  await fx.user('alice');
  await fx.user('bob');
  await fx.start();
  await fx.login('alice');
  await fx.login('bob');
});

after(async () => {
  await fx.stop();
  await fx.cleanup();
  await pool.end();
});

const ticket = (as, n) =>
  fx.api('POST', '/support-tickets', {
    as,
    body: { subject: `ทดสอบสแปม ${n}`, category: 'other', body: 'ข้อความทดสอบ rate limit' },
  });

test('เปิดเคสได้ 15 ครั้งต่อชั่วโมง ครั้งที่ 16 → 429 พร้อมเวลาที่ต้องรอ · ผู้ใช้อื่น (IP เดียวกัน) ยังเปิดได้', async () => {
  for (let i = 1; i <= 15; i += 1) {
    assert.equal((await ticket('alice', i)).status, 201, `ครั้งที่ ${i}`);
  }
  const blocked = await ticket('alice', 16);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, 'TOO_MANY_REQUESTS');
  assert.ok(blocked.body.error.details.retry_after > 3000, 'รอประมาณหนึ่งชั่วโมง');

  // bob ยิงจากเครื่องเดียวกัน (IP เดียวกัน) แต่นับแยกตามผู้ใช้ → ไม่โดนบล็อก
  assert.equal((await ticket('bob', 1)).status, 201);
  // ดูรายการยังได้ปกติ (จำกัดเฉพาะการสร้าง)
  assert.equal((await fx.api('GET', '/support-tickets', { as: 'alice' })).status, 200);
});
