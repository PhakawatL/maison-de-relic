// ทดสอบพื้นฐาน: server ขึ้น, ต่อฐานข้อมูลได้, รูปแบบ error ถูกต้อง, CORS ทำงาน
// รัน: npm test (ต้องเปิดฐานข้อมูลไว้ก่อน)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.ALLOWED_ORIGINS = 'http://localhost:5500';
process.env.ALLOWED_ORIGIN_REGEX = '^https://maison-de-relic(-[a-z0-9-]+)?\\.vercel\\.app$';

const app = require('../src/app');
const { pool } = require('../src/db/pool');

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await pool.end();
});

test('GET /api/health → 200 และต่อฐานข้อมูลได้', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.db, 'ok');
});

test('route ที่ไม่มี → 404 ในรูปแบบ error กลาง', async () => {
  const res = await fetch(`${base}/api/does-not-exist`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error.code, 'ROUTE_NOT_FOUND');
  assert.equal(typeof body.error.message, 'string');
});

test('JSON พัง → 400 INVALID_JSON', async () => {
  const res = await fetch(`${base}/api/does-not-exist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{bad json',
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'INVALID_JSON');
});

test('CORS: อนุญาต origin ใน list และ preview ของ Vercel', async () => {
  for (const origin of [
    'http://localhost:5500',
    'https://maison-de-relic.vercel.app',
    'https://maison-de-relic-git-feat-r1-wishlist-peem.vercel.app',
  ]) {
    const res = await fetch(`${base}/api/health`, { headers: { Origin: origin } });
    assert.equal(res.headers.get('access-control-allow-origin'), origin, origin);
  }
});

test('CORS: ปฏิเสธเว็บอื่น', async () => {
  const res = await fetch(`${base}/api/health`, { headers: { Origin: 'https://evil.example.com' } });
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});
