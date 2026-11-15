// embedding.js — แปลงข้อความเป็นเวกเตอร์ 384 ค่า (R4)
// ใช้โมเดล pretrained ที่รองรับภาษาไทย ไม่ได้เทรนเอง แค่เอามาใช้แปลงข้อความ (inference)
const path = require('path');

const { query } = require('../../db/pool'); // ใช้คุยกับฐานข้อมูล (ของ Peem ใช้กันทั้งโปรเจกต์)

const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

// เก็บ "งานโหลดโมเดล" ไว้ตัวเดียวทั้งเซิร์ฟเวอร์ (lazy singleton)
// lazy = ยังไม่โหลดจนกว่าจะมีคนเรียกใช้ครั้งแรก · singleton = โหลดครั้งเดียวแล้วใช้ซ้ำ
let embedderPromise = null;
let ready = false; // true = โหลดโมเดลเสร็จแล้ว ใช้ได้ทันทีไม่ต้องรอ
let lastFailedAt = 0; // เวลาที่โหลดพังครั้งล่าสุด (ไว้เว้นช่วงก่อนลองใหม่)

const RETRY_AFTER_MS = 60_000; // โหลดพังแล้ว เว้น 1 นาทีค่อยลองใหม่ (ไม่ยิงไป huggingface ทุกครั้งที่มีคนค้น)

function getEmbedder() {
  if (!embedderPromise) {
    embedderPromise = (async () => {
      // ไลบรารีเป็น ES Module แต่โปรเจกต์เราเป็น CommonJS จึงใช้ import() แทน require()
      const { pipeline, env } = await import('@huggingface/transformers');
      // ค่าเริ่มต้นเก็บโมเดลใน node_modules ซึ่งในกล่อง Docker เขียนไม่ได้ → ย้ายมาไว้ที่ backend/.model-cache
      env.cacheDir = path.join(__dirname, '..', '..', '..', '.model-cache');
      // dtype 'q8' = รุ่นย่อขนาด (ราว 120 MB แทน 470 MB) · ผลภาษาไทยแทบเท่ารุ่นเต็ม
      const embed = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
      ready = true;
      return embed;
    })().catch((err) => {
      embedderPromise = null; // โหลดพัง (เช่นเน็ตหลุด / เข้า huggingface ไม่ได้) → ล้างทิ้ง ครั้งหน้าจะได้ลองโหลดใหม่
      lastFailedAt = Date.now();
      throw err;
    });
  }
  return embedderPromise;
}

// โหลดเสร็จแล้วหรือยัง · semantic search ใช้เช็กก่อน: ยังไม่พร้อม → ค้นจากชื่อแทน ไม่ให้ผู้ใช้รอ 1–3 นาที
function isModelReady() {
  return ready;
}

// เริ่มโหลดโมเดลไว้เบื้องหลัง (ไม่รอ) — เรียกตอน server เปิด และตอนมีคนค้นแต่โมเดลยังไม่พร้อม
// โหลดพังแค่ log ไว้ ไม่ทำให้ server ล้ม · เพิ่งพังไม่ถึง 1 นาที → ยังไม่ลองใหม่
function warmUpModel() {
  if (ready || embedderPromise || Date.now() - lastFailedAt < RETRY_AFTER_MS) return;
  getEmbedder()
    .then(() => console.log('[embedding] โหลดโมเดลเสร็จ semantic search พร้อมใช้'))
    .catch((err) => console.warn(`[embedding] โหลดโมเดลไม่ได้ (ค้นจากชื่อแทนไปก่อน): ${err.message}`));
}

// แปลงข้อความ 1 ชิ้น → array ตัวเลข 384 ตัว
async function embedText(text) {
  const embed = await getEmbedder();
  // pooling 'mean' = เฉลี่ยเวกเตอร์ของทุกคำ ให้เหลือเวกเตอร์เดียวต่อประโยค
  // normalize = ทำให้ความยาวเวกเตอร์เป็น 1 → เทียบกันด้วย cosine ได้ตรง ๆ
  const output = await embed(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data); // output.data เป็น Float32Array → แปลงเป็น array ปกติ
}

// ต่อข้อความของสินค้าเป็นประโยคเดียว สำหรับส่งเข้าโมเดล
// เรียง: ชื่อ → ซีรีส์ → หมวด → คำอธิบาย (สิ่งที่บอกว่า "เป็นของอะไร" มาก่อน)
// filter(Boolean) = ตัดช่องที่ว่างทิ้ง เช่นสินค้าที่ไม่มีซีรีส์ (series เป็น NULL ได้)
function productText(p) {
  return [p.title, p.series_name, p.category_name, p.description].filter(Boolean).join('. ');
}

// pgvector รับเวกเตอร์เป็นข้อความรูป '[0.1,0.2,...]' แล้วค่อยแปลงชนิดด้วย ::vector ใน SQL
function toVectorLiteral(vector) {
  return `[${vector.join(',')}]`;
}

// สร้างเวกเตอร์ของสินค้า 1 ชิ้นแล้วบันทึกลง product.embedding
// คืน true ถ้าทำสำเร็จ · false ถ้าไม่มีสินค้านี้
async function embedProduct(productId) {
  const { rows } = await query(
    `SELECT p.title, p.description, c.name AS category_name, s.name AS series_name
       FROM product p
       JOIN category c    ON c.category_id = p.category_id
       LEFT JOIN series s ON s.series_id   = p.series_id   -- LEFT JOIN เพราะบางชิ้นไม่มีซีรีส์
      WHERE p.product_id = $1`,
    [productId]
  );
  if (!rows[0]) return false;

  const vector = await embedText(productText(rows[0]));
  await query('UPDATE product SET embedding = $1::vector WHERE product_id = $2', [
    toVectorLiteral(vector),
    productId,
  ]);
  return true;
}

module.exports = { embedText, embedProduct, productText, isModelReady, warmUpModel };