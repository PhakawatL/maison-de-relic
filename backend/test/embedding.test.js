// ทดสอบ embedding (R4): productText / embedText / embedProduct
//
// test แบ่งเป็น 2 กลุ่ม
//   1. ไม่ต้องใช้โมเดล → รันทุกที่ รวม CI
//   2. ต้องโหลดโมเดล → รันเฉพาะเครื่องที่มีไฟล์โมเดลใน backend/.model-cache แล้ว และไม่ใช่ CI
//      เพราะ CI เป็นเครื่องใหม่ทุกครั้ง ต้องดาวน์โหลดโมเดล 118 MB ทุก PR (ช้า และพังได้ถ้าเน็ต/Hugging Face มีปัญหา)
//      และเพื่อนที่ยังไม่เคยรัน backfill จะไม่โดนดาวน์โหลดโมเดลตอน npm test โดยไม่รู้ตัว
//      อยากรันกลุ่มนี้: รัน scripts/backfill-embeddings.js สักครั้ง (โมเดลจะถูกดาวน์โหลดมาเก็บ) แล้วค่อย npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { pool, query } = require('../src/db/pool');
const { embedText, embedProduct, productText } = require('../src/modules/search/embedding');

// ไฟล์โมเดลที่ embedding.js ดาวน์โหลดมาเก็บ (dtype q8)
const MODEL_FILE = path.join(
  __dirname, '..', '.model-cache', 'Xenova', 'paraphrase-multilingual-MiniLM-L12-v2', 'onnx', 'model_quantized.onnx'
);
// GitHub Actions ตั้ง CI=true ให้เองทุกครั้ง
// skip เป็นข้อความ = ข้าม test พร้อมบอกเหตุผล · false = รันตามปกติ
const SKIP_MODEL =
  process.env.CI === 'true'
    ? 'CI ไม่โหลดโมเดล (เหตุผลอยู่หัวไฟล์นี้)'
    : !fs.existsSync(MODEL_FILE)
      ? 'ยังไม่มีไฟล์โมเดลในเครื่อง (รัน scripts/backfill-embeddings.js ก่อน)'
      : false;

const TAG = 'zzr4emb';
const ids = {};

// ความใกล้ของเวกเตอร์ที่ normalize แล้ว = ผลคูณจุด (1 = เหมือนกัน · 0 = ไม่เกี่ยวกัน)
function similarity(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

async function cleanup() {
  await query('DELETE FROM product WHERE title LIKE $1', [`%${TAG}`]);
  await query('DELETE FROM "user" WHERE username LIKE $1', [`${TAG}\\_%`]);
}

before(async () => {
  await cleanup();
  // สินค้าต้องมีแอดมินเป็นคนลง (product.created_by → admin)
  const { rows } = await query(
    `INSERT INTO "user" (username, email, password_hash, first_name, last_name, display_name, is_email_verified)
     VALUES ($1, $2, 'x', 'R4', 'Embedding', $1, TRUE) RETURNING user_id`,
    [`${TAG}_admin`, `${TAG}_admin@example.com`]
  );
  ids.admin = Number(rows[0].user_id);
  await query(`INSERT INTO admin (user_id, admin_role) VALUES ($1, 'staff')`, [ids.admin]);
  const product = await query(
    `INSERT INTO product (category_id, series_id, created_by, title, description, price, condition, status, stock_quantity)
     VALUES ((SELECT category_id FROM category WHERE slug = 'figures'),
             (SELECT series_id FROM series WHERE slug = 'gundam'),
             $1, $2, 'ฟิกเกอร์หุ่นยนต์ประกอบเสร็จแล้ว สภาพดี', 1500, 'good', 'available', 1)
     RETURNING product_id`,
    [ids.admin, `Gundam Test ${TAG}`]
  );
  ids.product = Number(product.rows[0].product_id);
});

after(async () => {
  await cleanup();
  await pool.end();
});

// ---------- กลุ่ม 1: ไม่ต้องใช้โมเดล (รันบน CI ด้วย) ----------

test('productText: ต่อ ชื่อ. ซีรีส์. หมวด. คำอธิบาย ตามลำดับ', () => {
  const text = productText({
    title: 'ν Gundam', series_name: 'Gundam', category_name: 'ฟิกเกอร์', description: 'ประกอบแล้ว',
  });
  assert.equal(text, 'ν Gundam. Gundam. ฟิกเกอร์. ประกอบแล้ว');
});

test('productText: ไม่มีซีรีส์ / ไม่มีคำอธิบาย → ตัดทิ้ง ไม่มีคำว่า null หลุดเข้าไป', () => {
  const text = productText({ title: 'Ferrari 348', series_name: null, category_name: 'โมเดลพลาสติก', description: null });
  assert.equal(text, 'Ferrari 348. โมเดลพลาสติก');
  assert.ok(!text.includes('null'));
});

test('embedProduct: ไม่มีสินค้านี้ → false (ไม่โหลดโมเดล ไม่แก้ฐานข้อมูล)', async () => {
  assert.equal(await embedProduct(999999999), false);
});

// ---------- กลุ่ม 2: ต้องโหลดโมเดล (ข้ามบน CI) ----------

test('embedText: ได้ตัวเลข 384 ค่า ความยาวเวกเตอร์ = 1 (normalize แล้ว)', { skip: SKIP_MODEL }, async () => {
  const vector = await embedText('ฟิกเกอร์ Gundam');
  assert.equal(vector.length, 384);
  assert.ok(vector.every((x) => typeof x === 'number' && Number.isFinite(x)));
  const length = Math.sqrt(similarity(vector, vector));
  assert.ok(Math.abs(length - 1) < 1e-3, `ความยาว ${length}`);
});

test('embedText: ข้อความเดิม → เวกเตอร์เดิม (ผลคงที่)', { skip: SKIP_MODEL }, async () => {
  const a = await embedText('การ์ดโปเกมอน');
  const b = await embedText('การ์ดโปเกมอน');
  assert.ok(similarity(a, b) > 0.9999);
});

test('embedText: เข้าใจความหมายข้ามภาษา (การ์ดโปเกมอน ใกล้ Pokémon card มากกว่า ฟิกเกอร์นารูโตะ)', { skip: SKIP_MODEL }, async () => {
  const base = await embedText('การ์ดโปเกมอน');
  const near = similarity(base, await embedText('Pokémon trading card'));
  const far = similarity(base, await embedText('ฟิกเกอร์นารูโตะ'));
  assert.ok(near > far, `ใกล้ ${near.toFixed(3)} ต้องมากกว่า ไกล ${far.toFixed(3)}`);
});

test('embedProduct: บันทึกเวกเตอร์ 384 มิติลง product.embedding', { skip: SKIP_MODEL }, async () => {
  assert.equal(await embedProduct(ids.product), true);
  const { rows } = await query('SELECT vector_dims(embedding) AS dims FROM product WHERE product_id = $1', [ids.product]);
  assert.equal(rows[0].dims, 384);
});
