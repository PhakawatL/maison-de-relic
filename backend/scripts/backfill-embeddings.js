// backfill-embeddings.js — เติมเวกเตอร์ให้สินค้าที่มีอยู่แล้ว (R4)
//   docker compose exec api node scripts/backfill-embeddings.js         ← เฉพาะชิ้นที่ embedding ยังว่าง
//   docker compose exec api node scripts/backfill-embeddings.js --all   ← คำนวณใหม่ทุกชิ้น (เช่นหลังเปลี่ยนวิธีต่อข้อความ)
// รันซ้ำได้: แบบปกติจะข้ามชิ้นที่มีเวกเตอร์แล้ว
const { pool, query } = require('../src/db/pool');
const { embedProduct } = require('../src/modules/search/embedding');

// SQL สองแบบเขียนแยกไว้ทั้งก้อน ไม่เอาข้อความมาต่อกัน (ตามกติกาทีม)
const SQL_MISSING = 'SELECT product_id, title FROM product WHERE embedding IS NULL ORDER BY product_id';
const SQL_ALL = 'SELECT product_id, title FROM product ORDER BY product_id';

async function main() {
  const all = process.argv.includes('--all');
  const { rows } = await query(all ? SQL_ALL : SQL_MISSING);
  console.log(`ต้องทำ ${rows.length} ชิ้น${all ? ' (ทำใหม่ทั้งหมด)' : ''}`);

  const started = Date.now();
  let done = 0;
  let failed = 0;
  // ทำทีละชิ้น (ไม่ใช้ Promise.all) เพราะโมเดลรันบน CPU ตัวเดียว ทำพร้อมกันไม่เร็วขึ้น แต่กินแรมมากขึ้น
  for (const p of rows) {
    try {
      await embedProduct(p.product_id);
      done += 1;
      console.log(`  ✓ ${done + failed}/${rows.length}  #${p.product_id} ${p.title}`);
    } catch (err) {
      failed += 1; // ชิ้นเดียวพัง ไม่ทำให้ทั้งสคริปต์หยุด
      console.error(`  ✗ #${p.product_id} ${p.title}: ${err.message}`);
    }
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`เสร็จ ${done} ชิ้น · พัง ${failed} ชิ้น · ใช้เวลา ${seconds} วินาที`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end()); // ปิดการเชื่อมต่อ ไม่งั้นสคริปต์ค้างไม่จบ