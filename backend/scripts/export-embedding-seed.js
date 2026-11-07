// export-embedding-seed.js — ส่งออกเวกเตอร์ของสินค้าตัวอย่างเป็นไฟล์ seed (R4)
//
//   docker compose exec api node scripts/export-embedding-seed.js
//   → เขียนทับ db/seeds/006_product_embeddings.sql
//
// ทำไมต้องมี: ฐานข้อมูลของแต่ละเครื่องแยกกัน เวกเตอร์ที่คำนวณบนเครื่องหนึ่งไม่ได้ไปกับ git
// ถ้าไม่มีไฟล์ seed นี้ ทุกคน (รวมอาจารย์ตอนตรวจ) ต้องรัน backfill-embeddings.js เองก่อน ฟีเจอร์แนะนำถึงจะมีผล
// มีไฟล์นี้แล้ว docker compose up ใส่เวกเตอร์ให้เอง ไม่ต้องรอดาวน์โหลดโมเดล
//
// ใช้เมื่อไหร่: หลังเปลี่ยนข้อความสินค้าใน seed หรือเปลี่ยนวิธีต่อข้อความ / เปลี่ยนโมเดล
//   1. node scripts/backfill-embeddings.js --all   (คำนวณใหม่ในฐานข้อมูลบนเครื่อง)
//   2. node scripts/export-embedding-seed.js       (ส่งออกเป็นไฟล์)
//   3. ไฟล์ seed ที่ merge แล้วห้ามแก้ → ตั้งชื่อไฟล์ใหม่เลขถัดไปแทน (แก้ OUTPUT ด้านล่าง)
const fs = require('fs');
const path = require('path');
const { pool, query } = require('../src/db/pool');

const OUTPUT = path.join(__dirname, '..', 'db', 'seeds', '006_product_embeddings.sql');
const DECIMALS = 6; // ทศนิยม 6 ตำแหน่งพอ (ต่างจากค่าจริงไม่เกิน 0.0000005) ไฟล์เล็กลงเกือบครึ่ง

async function main() {
  // เอาเฉพาะสินค้าตัวอย่างที่รูปปกอยู่ใน seed/ (สินค้าที่แอดมินลงเองบนเครื่องไม่เกี่ยว)
  // ชื่อไฟล์รูปปกไม่ซ้ำกัน จึงใช้แทน product_id ได้ (id แต่ละเครื่องอาจไม่ตรงกัน แบบเดียวกับ seed 005)
  const { rows } = await query(
    `SELECT product_id, title,
            substring(cover_image_url FROM '/Product_image/seed/([^/]+)$') AS cover_file,
            embedding::text AS embedding
       FROM product
      WHERE embedding IS NOT NULL AND cover_image_url LIKE '%/Product_image/seed/%'
      ORDER BY product_id`
  );
  if (!rows.length) throw new Error('ยังไม่มีเวกเตอร์ในฐานข้อมูล — รัน scripts/backfill-embeddings.js ก่อน');

  const values = rows.map((r) => {
    // pgvector คืนเป็นข้อความ '[0.0123,-0.0456,...]' → แปลงเป็นตัวเลข แล้วปัดทศนิยม
    const numbers = JSON.parse(r.embedding).map((x) => Number(x.toFixed(DECIMALS)));
    if (numbers.length !== 384) throw new Error(`#${r.product_id} ได้ ${numbers.length} มิติ (ต้อง 384)`);
    const title = r.title.replace(/\s+/g, ' ').replace(/'/g, "''"); // ใส่ในคอมเมนต์ SQL เท่านั้น
    return `  -- ${title}\n  ('${r.cover_file}', '[${numbers.join(',')}]')`;
  });

  const sql = `-- =====================================================================
-- 006_product_embeddings.sql — เวกเตอร์สำเร็จรูปของสินค้าตัวอย่าง (R4 · ${rows.length} ชิ้น)
-- =====================================================================
-- สร้างอัตโนมัติด้วย backend/scripts/export-embedding-seed.js — อย่าแก้มือ
--
-- เวกเตอร์ = ข้อความ "ชื่อ. ซีรีส์. หมวด. คำอธิบาย" ของสินค้า แปลงด้วยโมเดล
-- Xenova/paraphrase-multilingual-MiniLM-L12-v2 (q8) ได้ตัวเลข 384 ค่า (ดู src/modules/search/embedding.js)
-- ใส่ไว้ให้เลย เพื่อให้ทุกเครื่องที่ docker compose up ใช้ "สินค้าที่เกี่ยวข้อง / แนะนำ" ได้ทันที
-- ไม่ต้องรัน backfill และไม่ต้องรอดาวน์โหลดโมเดล 118 MB
--
-- * หาสินค้าจากชื่อไฟล์รูปปก (เหมือน seed 005) ไม่ใช้ product_id เพราะแต่ละเครื่องอาจได้เลขไม่ตรงกัน
-- * ใส่เฉพาะชิ้นที่ embedding ยังว่าง (ไม่ทับเวกเตอร์ที่คำนวณไว้แล้ว)
-- * สินค้าที่แอดมินลงใหม่ภายหลัง ได้เวกเตอร์จาก embedProduct() ตอนบันทึก ไม่เกี่ยวกับไฟล์นี้
UPDATE product p
   SET embedding = v.embedding::vector
  FROM (VALUES
${values.join(',\n')}
  ) AS v(cover_file, embedding)
 WHERE p.cover_image_url LIKE '%/Product_image/seed/' || v.cover_file
   AND p.embedding IS NULL;
`;

  fs.writeFileSync(OUTPUT, sql);
  const kb = (Buffer.byteLength(sql) / 1024).toFixed(0);
  console.log(`เขียน ${path.relative(process.cwd(), OUTPUT)} แล้ว: ${rows.length} ชิ้น · ${kb} KB`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
