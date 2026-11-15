// ทดสอบ API รูปสินค้า (R3): POST / DELETE /api/products/:id/images และตั้งรูปปก
// ไม่ต่อ Supabase จริง — เปิด server ปลอมที่ทำตัวเหมือน Storage REST API แล้วชี้ env.supabase มาที่นี่
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const env = require('../src/config/env');
const { pool, query } = require('../src/db/pool');
const { createFixtures } = require('./helpers/r1-fixtures');

const TAG = 'zzr3img';
const fx = createFixtures(TAG);
const u = {};
const p = {};

// ---------- Supabase ปลอม ----------
const fake = { uploads: [], deletes: [], failUpload: false, server: null, url: null };

function startFakeSupabase() {
  fake.server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const authOk = req.headers.apikey === 'test-key' && req.headers.authorization === 'Bearer test-key';
      if (!authOk) {
        res.writeHead(401).end('bad key');
        return;
      }
      const prefix = '/storage/v1/object/Product_image';
      if (req.method === 'POST' && req.url.startsWith(`${prefix}/`)) {
        if (fake.failUpload) {
          res.writeHead(500).end('boom');
          return;
        }
        fake.uploads.push({ path: decodeURIComponent(req.url.slice(prefix.length + 1)), type: req.headers['content-type'], size: body.length });
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"Key":"ok"}');
        return;
      }
      if (req.method === 'DELETE' && req.url === prefix) {
        fake.deletes.push(...JSON.parse(body.toString()).prefixes);
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('[]');
        return;
      }
      res.writeHead(404).end('not found');
    });
  });
  return new Promise((resolve) => {
    fake.server.listen(0, '127.0.0.1', () => {
      fake.url = `http://127.0.0.1:${fake.server.address().port}`;
      resolve();
    });
  });
}

// ไฟล์รูปจิ๋วของจริง (แค่ byte ต้นไฟล์ถูกก็พอ API ไม่ได้ถอดรหัสรูป)
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(32, 3)]);

const upload = (productId, file, { as = 'staff', qs = '', contentType = 'image/png' } = {}) =>
  fx.api('POST', `/products/${productId}/images${qs}`, { as, raw: file, contentType });

const imagesOf = async (id) =>
  (await query('SELECT seq, url, is_cover FROM product_image WHERE product_id = $1 ORDER BY seq', [id])).rows;
const coverUrlOf = async (id) =>
  (await query('SELECT cover_image_url FROM product WHERE product_id = $1', [id])).rows[0].cover_image_url;
const publicUrl = (path) => `${fake.url}/storage/v1/object/public/Product_image/${path}`;

let savedSupabase;

before(async () => {
  await startFakeSupabase();
  savedSupabase = { ...env.supabase };
  await fx.cleanup();
  u.staff = await fx.user('staff', { admin: 'staff' });
  u.alice = await fx.user('alice');
  p.a = await fx.product('a');
  p.b = await fx.product('b');
  p.full = await fx.product('full');
  p.seed = await fx.product('seed');
  await fx.start();
  for (const key of ['staff', 'alice']) await fx.login(key);
});

beforeEach(() => {
  Object.assign(env.supabase, { url: fake.url, serviceKey: 'test-key', productBucket: 'Product_image' });
  fake.uploads = [];
  fake.deletes = [];
  fake.failUpload = false;
});

after(async () => {
  Object.assign(env.supabase, savedSupabase);
  await fx.stop();
  await fx.cleanup();
  await pool.end();
  await new Promise((resolve) => fake.server.close(resolve));
});

// ---------- สิทธิ์ / ตั้งค่า ----------

test('ไม่ล็อกอิน → 401 · ลูกค้า → 403 · ไม่มีไฟล์ไปถึง Storage', async () => {
  assert.equal((await upload(p.a.id, PNG, { as: null })).status, 401);
  assert.equal((await upload(p.a.id, PNG, { as: 'alice' })).status, 403);
  assert.equal((await fx.api('DELETE', `/products/${p.a.id}/images/1`, { as: 'alice' })).status, 403);
  assert.equal((await fx.api('PUT', `/products/${p.a.id}/images/1/cover`, { as: 'alice' })).status, 403);
  assert.equal(fake.uploads.length, 0);
});

test('ยังไม่ได้ใส่ key ใน .env → 503 STORAGE_NOT_CONFIGURED', async () => {
  env.supabase.serviceKey = '';
  const res = await upload(p.a.id, PNG);
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'STORAGE_NOT_CONFIGURED');
  assert.deepEqual(await imagesOf(p.a.id), []);
});

// ---------- อัปโหลด ----------

test('รูปแรกเป็นปกอัตโนมัติ + cover_image_url + เก็บที่ products/<id>/ + log', async () => {
  const res = await upload(p.a.id, PNG, { qs: '?alt=กล่องด้านหน้า' });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.seq, 1);
  assert.equal(res.body.data.is_cover, true);
  assert.equal(res.body.data.alt_text, 'กล่องด้านหน้า');
  assert.equal(res.body.meta.images.length, 1);

  assert.equal(fake.uploads.length, 1);
  const { path, type, size } = fake.uploads[0];
  assert.match(path, new RegExp(`^products/${p.a.id}/[0-9a-f-]{36}\\.png$`));
  assert.equal(type, 'image/png');
  assert.equal(size, PNG.length);
  assert.equal(res.body.data.url, publicUrl(path));
  assert.equal(await coverUrlOf(p.a.id), publicUrl(path));

  const [log] = await fx.logsOf(u.staff);
  assert.equal(log.action_type, 'add_product_image');
  assert.equal(log.target_id, p.a.id);
});

test('รูปที่ 2 ไม่เป็นปก · ?cover=true แย่งปกได้ · หน้าร้านเห็นรูปครบ', async () => {
  const second = await upload(p.a.id, JPG, { contentType: 'image/jpeg' });
  assert.equal(second.status, 201);
  assert.equal(second.body.data.seq, 2);
  assert.equal(second.body.data.is_cover, false);
  assert.match(fake.uploads[0].path, /\.jpg$/);

  const third = await upload(p.a.id, WEBP, { qs: '?cover=true', contentType: 'image/webp' });
  assert.equal(third.status, 201);
  assert.equal(third.body.data.seq, 3);
  assert.equal(third.body.data.is_cover, true);
  assert.deepEqual((await imagesOf(p.a.id)).map((i) => [i.seq, i.is_cover]), [[1, false], [2, false], [3, true]]);
  assert.equal(await coverUrlOf(p.a.id), third.body.data.url);

  const shop = await fx.api('GET', `/products/${p.a.id}`);
  assert.equal(shop.body.data.images.length, 3);
  assert.equal(shop.body.data.cover_image_url, third.body.data.url);
});

test('ชนิดไฟล์ดูจาก byte จริง ไม่เชื่อ Content-Type', async () => {
  // บอกว่าเป็น png แต่ข้างในเป็น jpg → เก็บเป็น jpg
  const res = await upload(p.b.id, JPG, { contentType: 'image/png' });
  assert.equal(res.status, 201);
  assert.equal(fake.uploads[0].type, 'image/jpeg');

  // บอกว่าเป็น png แต่ข้างในเป็นข้อความ → 415
  const fakePng = await upload(p.b.id, Buffer.from('<script>alert(1)</script> not an image'), { contentType: 'image/png' });
  assert.equal(fakePng.status, 415);
  assert.equal(fakePng.body.error.code, 'UNSUPPORTED_IMAGE');
  assert.equal(fake.uploads.length, 1);
});

test('ไฟล์ว่าง 400 · ใหญ่เกิน 5 MB 413 · alt ยาวเกิน 400 · สินค้าไม่มี 404 · id ผิด 400', async () => {
  assert.equal((await upload(p.b.id, Buffer.alloc(0))).body.error.code, 'NO_FILE');

  const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
  const tooBig = await upload(p.b.id, big);
  assert.equal(tooBig.status, 413);
  assert.equal(tooBig.body.error.code, 'IMAGE_TOO_LARGE');

  assert.equal((await upload(p.b.id, PNG, { qs: `?alt=${'ก'.repeat(201)}` })).status, 400);
  assert.equal((await upload(999999999, PNG)).status, 404);
  assert.equal((await upload('abc', PNG)).status, 400);
  assert.equal(fake.uploads.length, 0);
});

test('ครบ 8 รูปแล้ว → 409 TOO_MANY_IMAGES', async () => {
  for (let i = 0; i < 8; i++) assert.equal((await upload(p.full.id, PNG)).status, 201);
  const res = await upload(p.full.id, PNG);
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'TOO_MANY_IMAGES');
  assert.equal((await imagesOf(p.full.id)).length, 8);
});

test('Supabase พัง → 502 และไม่มีแถวค้างใน DB', async () => {
  fake.failUpload = true;
  const before = (await imagesOf(p.b.id)).length;
  const res = await upload(p.b.id, PNG);
  assert.equal(res.status, 502);
  assert.equal(res.body.error.code, 'STORAGE_ERROR');
  assert.equal((await imagesOf(p.b.id)).length, before);
});

// ---------- ลบ / ตั้งปก ----------

test('ลบรูปปก → seq น้อยสุดที่เหลือเป็นปกแทน + ลบไฟล์ใน Storage + log', async () => {
  // p.a ตอนนี้: 1, 2, 3(ปก)
  const res = await fx.api('DELETE', `/products/${p.a.id}/images/3`, { as: 'staff' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.images.map((i) => [i.seq, i.is_cover]), [[1, true], [2, false]]);
  assert.equal(await coverUrlOf(p.a.id), res.body.data.images[0].url);
  assert.equal(fake.deletes.length, 1);
  assert.match(fake.deletes[0], new RegExp(`^products/${p.a.id}/.+\\.webp$`));
  assert.equal((await fx.logsOf(u.staff))[0].action_type, 'delete_product_image');

  assert.equal((await fx.api('DELETE', `/products/${p.a.id}/images/3`, { as: 'staff' })).status, 404);
});

test('PUT .../cover เปลี่ยนรูปปก', async () => {
  const res = await fx.api('PUT', `/products/${p.a.id}/images/2/cover`, { as: 'staff' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.images.map((i) => [i.seq, i.is_cover]), [[1, false], [2, true]]);
  assert.equal(await coverUrlOf(p.a.id), res.body.data.images[1].url);
  assert.equal((await fx.api('PUT', `/products/${p.a.id}/images/9/cover`, { as: 'staff' })).status, 404);
});

test('ลบรูปสุดท้าย → cover_image_url = NULL', async () => {
  await fx.api('DELETE', `/products/${p.a.id}/images/1`, { as: 'staff' });
  const res = await fx.api('DELETE', `/products/${p.a.id}/images/2`, { as: 'staff' });
  assert.deepEqual(res.body.data.images, []);
  assert.equal(await coverUrlOf(p.a.id), null);
});

test('รูปตัวอย่างใน seed/ ลบออกจากสินค้าได้ แต่ไม่ลบไฟล์ใน Storage (เครื่องเพื่อนใช้ร่วมกัน)', async () => {
  const seedUrl = publicUrl('seed/c01.webp');
  await query(`INSERT INTO product_image (product_id, seq, url, is_cover) VALUES ($1, 1, $2, TRUE)`, [p.seed.id, seedUrl]);
  await query('UPDATE product SET cover_image_url = $2 WHERE product_id = $1', [p.seed.id, seedUrl]);

  const res = await fx.api('DELETE', `/products/${p.seed.id}/images/1`, { as: 'staff' });
  assert.equal(res.status, 200);
  assert.deepEqual(fake.deletes, []);
  assert.equal(await coverUrlOf(p.seed.id), null);
});

test('ลบสินค้าที่ไม่เคยขาย → ไฟล์รูปใน Storage ถูกลบตาม', async () => {
  const created = (
    await fx.api('POST', '/products', {
      as: 'staff',
      body: {
        title: `temp ${TAG}`, category_id: Number((await query('SELECT min(category_id) c FROM category')).rows[0].c),
        series_id: null, status: 'draft', condition: 'good', price: 10, stock_quantity: 0, attributes: {},
      },
    })
  ).body.data;
  await upload(created.product_id, PNG);
  await upload(created.product_id, JPG);
  const paths = fake.uploads.map((x) => x.path).sort();

  const res = await fx.api('DELETE', `/products/${created.product_id}`, { as: 'staff' });
  assert.equal(res.body.data.result, 'deleted');
  assert.deepEqual([...fake.deletes].sort(), paths);
});
