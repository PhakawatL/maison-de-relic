// ทดสอบ semantic search แบบผสม (R4): GET /api/search/semantic?q=
//
// test แบ่งเป็น 2 กลุ่ม (เหมือน embedding.test.js)
//   1. ไม่ต้องใช้โมเดล → รันทุกที่ รวม CI: dict คำพ้อง · escapeLike · ตรวจข้อมูล 400
//      (controller ตอบ 400 ก่อนเรียก service จึงไม่โหลดโมเดล)
//   2. ต้องโหลดโมเดล (แปลงคำค้นเป็นเวกเตอร์) → ข้ามบน CI และเครื่องที่ยังไม่มีไฟล์โมเดล
// สินค้าทดสอบชื่อมีคำว่า zzr4srch ลบทิ้งตอนจบ
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const app = require('../src/app');
const { pool, query } = require('../src/db/pool');
const { expandQuery } = require('../src/modules/search/synonyms');
const { escapeLike } = require('../src/modules/search/search.service');
const embedding = require('../src/modules/search/embedding');

// แทนฟังก์ชันของ embedding ชั่วคราว (จำลองโมเดลยังไม่พร้อม / พัง) แล้วคืนของเดิมเมื่อจบ
async function withFakeModel(fakes, fn) {
  const saved = {};
  for (const [name, fake] of Object.entries(fakes)) {
    saved[name] = embedding[name];
    embedding[name] = fake;
  }
  try {
    await fn();
  } finally {
    Object.assign(embedding, saved);
  }
}

const MODEL_FILE = path.join(
  __dirname, '..', '.model-cache', 'Xenova', 'paraphrase-multilingual-MiniLM-L12-v2', 'onnx', 'model_quantized.onnx'
);
const SKIP_MODEL =
  process.env.CI === 'true'
    ? 'CI ไม่โหลดโมเดล (เหตุผลอยู่หัวไฟล์ embedding.test.js)'
    : !fs.existsSync(MODEL_FILE)
      ? 'ยังไม่มีไฟล์โมเดลในเครื่อง (รัน scripts/backfill-embeddings.js ก่อน)'
      : false;

const TAG = 'zzr4srch';
const ids = {};
let server;
let base;

async function cleanup() {
  await query('DELETE FROM product WHERE title LIKE $1', [`%${TAG}`]);
  await query('DELETE FROM "user" WHERE username LIKE $1', [`${TAG}\\_%`]);
}

const search = async (qs) => {
  const res = await fetch(`${base}/api/search/semantic${qs}`);
  return { status: res.status, body: await res.json() };
};

before(async () => {
  await cleanup();
  const { rows } = await query(
    `INSERT INTO "user" (username, email, password_hash, first_name, last_name, display_name, is_email_verified)
     VALUES ($1, $2, 'x', 'R4', 'Search', $1, TRUE) RETURNING user_id`,
    [`${TAG}_admin`, `${TAG}_admin@example.com`]
  );
  await query(`INSERT INTO admin (user_id, admin_role) VALUES ($1, 'staff')`, [rows[0].user_id]);
  // สินค้าที่ยังไม่มีเวกเตอร์ (embedProduct ยังไม่เสร็จ) แต่ชื่อมีคำแปลก ๆ ที่ไม่ซ้ำใคร → ค้นด้วยชื่อต้องยังเจอ
  const product = await query(
    `INSERT INTO product (category_id, created_by, title, price, condition, status, stock_quantity)
     VALUES ((SELECT category_id FROM category ORDER BY category_id LIMIT 1), $1, $2, 900, 'good', 'available', 1)
     RETURNING product_id`,
    [rows[0].user_id, `Qwzxv Rare Item ${TAG}`]
  );
  ids.noVector = Number(product.rows[0].product_id);

  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await cleanup();
  server.close();
  await pool.end();
});

// ---------- กลุ่ม 1: ไม่ต้องใช้โมเดล (รันบน CI ด้วย) ----------

test('dict: แปลงคำทับศัพท์ไทยเป็นชื่ออังกฤษ', () => {
  assert.equal(expandQuery('ฟิกเกอร์กันดั้ม'), 'ฟิกเกอร์ Gundam');
  assert.equal(expandQuery('การ์ดโปเกมอน ชาริซาร์ด'), 'การ์ด Pokémon Charizard');
});

test('dict: คำยาวแทนก่อน ("ยูกิโอ" ไม่กลายเป็น "Yu-Gi-Ohโอ")', () => {
  assert.equal(expandQuery('ยูกิโอ'), 'Yu-Gi-Oh');
  assert.equal(expandQuery('ยูกิ'), 'Yu-Gi-Oh');
});

test('dict: คำที่ไม่อยู่ในตาราง / ภาษาอังกฤษ → คงเดิม (ตัดเว้นวรรคเกิน)', () => {
  assert.equal(expandQuery('เหรียญเงิน'), 'เหรียญเงิน');
  assert.equal(expandQuery('  Gundam  '), 'Gundam');
});

test('escapeLike: หนี % _ \\ ไม่ให้เป็น wildcard ของ LIKE', () => {
  assert.equal(escapeLike('100%'), '100\\%');
  assert.equal(escapeLike('a_b'), 'a\\_b');
  assert.equal(escapeLike('c:\\x'), 'c:\\\\x');
  assert.equal(escapeLike('กันดั้ม'), 'กันดั้ม');
});

test('dict: "แสตมป์" → stamp (คำไทยที่โมเดลไม่เข้าใจ ไม่ใช่แค่ชื่อเฉพาะ)', () => {
  assert.equal(expandQuery('แสตมป์เก่า'), 'stamp เก่า');
});

test('ตรวจข้อมูล: ไม่มี q / q ว่าง / ยาวเกิน 100 / limit ผิด → 400 VALIDATION_ERROR', async () => {
  const cases = ['', '?q=', '?q=%20%20', `?q=${'ก'.repeat(101)}`, '?q=a&limit=0', '?q=a&limit=51', '?q=a&limit=abc'];
  for (const qs of cases) {
    const res = await search(qs);
    assert.equal(res.status, 400, qs);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR', qs);
  }
});

test('ตรวจตัวกรอง: สภาพผิด / ราคาติดลบ / ต่ำสุด > สูงสุด / หมวดผิดรูป → 400 บอกทุกช่องพร้อมกัน', async () => {
  const res = await search('?q=a&condition=bad&minPrice=9&maxPrice=1&category=' + encodeURIComponent('ฟิกเกอร์'));
  assert.equal(res.status, 400);
  const fields = res.body.error.details.map((d) => d.field).sort();
  assert.deepEqual(fields, ['category', 'condition', 'minPrice']);
  assert.equal((await search('?q=a&minPrice=-1')).status, 400);
});

// ---------- ทางสำรอง: โมเดลไม่พร้อม/พัง → ค้นจากชื่อ (ไม่โหลดโมเดลจริง รันบน CI ได้) ----------

test('ทางสำรอง: โมเดลยังโหลดไม่เสร็จ → ค้นจากชื่อทันที (200) และสั่งโหลดโมเดลเบื้องหลัง', async () => {
  let warmUps = 0;
  await withFakeModel(
    {
      isModelReady: () => false,
      warmUpModel: () => { warmUps += 1; },
      embedText: async () => assert.fail('ยังไม่พร้อมต้องไม่รอโมเดล'),
    },
    async () => {
      const res = await search('?q=qwzxv'); // ตัวพิมพ์เล็ก: ILIKE ไม่สนตัวพิมพ์
      assert.equal(res.status, 200);
      assert.equal(res.body.meta.mode, 'name');
      assert.deepEqual(res.body.data.map((p) => p.product_id), [ids.noVector]);
      assert.equal(res.body.data[0].match, 'name');
      assert.equal(res.body.data[0].similarity, null);
    }
  );
  assert.equal(warmUps, 1);
});

test('ทางสำรอง: โหลดโมเดลไม่ได้ (เช่นเข้า huggingface.co ไม่ได้) → ไม่ตอบ 500 · ค้นจากชื่อแทน', async () => {
  await withFakeModel(
    {
      isModelReady: () => true,
      embedText: async () => { throw new Error('fetch failed'); },
    },
    async () => {
      const res = await search('?q=Qwzxv');
      assert.equal(res.status, 200);
      assert.equal(res.body.meta.mode, 'name');
      assert.deepEqual(res.body.data.map((p) => p.product_id), [ids.noVector]);
    }
  );
});

test('ทางสำรอง: ตัวกรองยังใช้ได้ · ชื่อไม่ตรงเลย → ไม่พบ', async () => {
  await withFakeModel({ isModelReady: () => false, warmUpModel: () => {} }, async () => {
    assert.deepEqual((await search('?q=Qwzxv&maxPrice=100')).body.data, []); // สินค้าทดสอบราคา 900
    assert.deepEqual((await search('?q=Qwzxv&condition=new')).body.data, []); // สภาพ good
    assert.deepEqual((await search(`?q=${encodeURIComponent('นาฬิกา')}`)).body.data, []);
  });
});

// ---------- กลุ่ม 2: ต้องโหลดโมเดล (ข้ามบน CI) ----------

// โหลดโมเดลให้เสร็จก่อน ไม่งั้นคำค้นแรกจะได้ทางสำรอง (ค้นจากชื่อ) เพราะโมเดลยังไม่พร้อม
before(async () => {
  if (!SKIP_MODEL) await embedding.embedText('warm up');
});

test('โมเดลพร้อมแล้ว → ได้ผลแบบผสม (meta.mode = semantic)', { skip: SKIP_MODEL }, async () => {
  const res = await search(`?q=${encodeURIComponent('เหรียญเงิน')}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.meta.mode, 'semantic');
});

test('ชื่อเฉพาะ: "Charizard" → ชิ้นที่ชื่อตรงขึ้นก่อน (match = name)', { skip: SKIP_MODEL }, async () => {
  const { status, body } = await search('?q=Charizard');
  assert.equal(status, 200);
  const [first, second] = body.data;
  assert.equal(first.match, 'name');
  assert.ok(first.title.includes('Charizard'), first.title);
  assert.equal(second.match, 'name');
});

test('คำทับศัพท์: "กันดั้ม" → ผ่าน dict แล้วเจอ Gundam ก่อน', { skip: SKIP_MODEL }, async () => {
  const { body } = await search('?q=' + encodeURIComponent('กันดั้ม'));
  assert.equal(body.data[0].match, 'name');
  assert.ok(body.data[0].title.includes('Gundam'), body.data[0].title);
});

test('คำบรรยาย: "เหรียญเงิน" → ชิ้นอื่นที่ชื่อไม่มีคำนี้ก็ขึ้นมาด้วยความหมาย', { skip: SKIP_MODEL }, async () => {
  const { body } = await search('?q=' + encodeURIComponent('เหรียญเงิน') + '&limit=5');
  assert.equal(body.data.length, 5);
  const byMeaning = body.data.filter((p) => p.match === 'meaning');
  assert.ok(byMeaning.length > 0);
  assert.ok(byMeaning.some((p) => /Silver|Coin|Rupee|Dollar/i.test(p.title)), JSON.stringify(byMeaning.map((p) => p.title)));
});

test('ไม่มีเวกเตอร์แต่ชื่อตรง → ยังเจอ (similarity = null)', { skip: SKIP_MODEL }, async () => {
  const { body } = await search('?q=Qwzxv');
  assert.equal(body.data[0].product_id, ids.noVector);
  assert.equal(body.data[0].match, 'name');
  assert.equal(body.data[0].similarity, null);
});

test('"100%" ไม่ทำให้ทุกชิ้นตรงชื่อ (escapeLike ทำงานจริงใน SQL)', { skip: SKIP_MODEL }, async () => {
  const { body } = await search('?q=' + encodeURIComponent('100%'));
  assert.ok(body.data.every((p) => p.match === 'meaning'));
});

test('เกณฑ์ตัด: ร้านไม่มีของที่เกี่ยว ("นาฬิกา") → ไม่พบ (ไม่โชว์ของมั่ว ๆ เต็มหน้า)', { skip: SKIP_MODEL }, async () => {
  const { status, body } = await search('?q=' + encodeURIComponent('นาฬิกา'));
  assert.equal(status, 200);
  assert.deepEqual(body.data, []);
});

test('เกณฑ์ตัด: มีของตรงชัด ("ตุ๊กตาน่ารัก") → ไม่เอาของที่ห่างจากอันดับ 1 เกิน 0.20 มาปน', { skip: SKIP_MODEL }, async () => {
  const { body } = await search('?q=' + encodeURIComponent('ตุ๊กตาน่ารัก'));
  assert.ok(body.data.length >= 1);
  const top = body.data[0].similarity;
  for (const p of body.data.filter((x) => x.match === 'meaning')) {
    assert.ok(p.similarity >= Math.max(0.35, top - 0.2), `${p.title} ${p.similarity}`);
  }
});

test('ตัวกรอง: ผลทุกชิ้นตรงหมวดและช่วงราคา (กรองก่อนเรียงตามความหมาย)', { skip: SKIP_MODEL }, async () => {
  const { body } = await search('?q=' + encodeURIComponent('เหรียญเงิน') + '&category=coins-stamps&maxPrice=3000');
  assert.ok(body.data.length > 0);
  for (const p of body.data) {
    assert.equal(p.category.slug, 'coins-stamps', p.title);
    assert.ok(p.price <= 3000, `${p.title} ${p.price}`);
  }
});

test('?limit= เป็นเพดาน · รูปข้อมูลเหมือนการ์ดสินค้า', { skip: SKIP_MODEL }, async () => {
  const { body } = await search('?q=' + encodeURIComponent('ฟิกเกอร์อนิเมะ') + '&limit=3');
  assert.equal(body.data.length, 3);
  assert.equal(body.data[0].in_stock, true);
  assert.ok(body.data[0].category.slug);
});
