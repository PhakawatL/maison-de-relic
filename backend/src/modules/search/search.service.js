// service ของ semantic search (R4) — ค้นแบบผสม (hybrid)
// ทำไมผสม: ทดลอง 18 คำแล้ว ความหมายล้วนเก่งกับคำบรรยาย ("เหรียญเงิน" "รถเหล็ก")
// แต่พลาดกับชื่อเฉพาะ ("Charizard" ได้อันดับ 3 · "กันดั้ม" ไม่เจอ Gundam เลย)
// จึงให้ชิ้นที่ "ชื่อตรงคำค้น" ขึ้นก่อน แล้วเติมด้วยชิ้นที่ "ความหมายใกล้" จนครบ
const { query } = require('../../db/pool');
const { SUMMARY_COLUMNS, FROM_JOINS, toSummary } = require('../products/products.service');
const { embedText } = require('./embedding');
const { expandQuery } = require('./synonyms');

// คำค้นจากผู้ใช้ไปอยู่ใน LIKE → ต้องหนี % _ \ ไม่งั้นพิมพ์ "%" แล้วจะตรงกับทุกชิ้น
const escapeLike = (text) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

async function semantic({ q, limit }) {
  const original = q.trim();
  const expanded = expandQuery(original); // "ฟิกเกอร์กันดั้ม" → "ฟิกเกอร์ Gundam"
  const vector = await embedText(expanded); // แปลงคำค้น (ที่แปลงคำทับศัพท์แล้ว) เป็นเวกเตอร์

  const { rows } = await query(
    `SELECT ${SUMMARY_COLUMNS},
            (p.title ILIKE $2 OR p.title ILIKE $3) AS name_match,
            p.embedding <=> $1::vector             AS distance
       ${FROM_JOINS}
      WHERE p.status = 'available' AND p.stock_quantity > 0
        -- ไม่มีเวกเตอร์ก็ยังเจอได้ ถ้าชื่อตรง (เช่นสินค้าเพิ่งลง embedProduct ยังไม่เสร็จ)
        AND (p.embedding IS NOT NULL OR p.title ILIKE $2 OR p.title ILIKE $3)
      -- ชื่อตรงก่อน (TRUE มาก่อน FALSE เมื่อเรียง DESC) → แล้วตามความใกล้ · ไม่มีเวกเตอร์ไปท้าย
      ORDER BY name_match DESC, distance ASC NULLS LAST, p.product_id
      LIMIT $4`,
    [`[${vector.join(',')}]`, `%${escapeLike(original)}%`, `%${escapeLike(expanded)}%`, limit]
  );

  return rows.map((row) => ({
    ...toSummary(row), // รูปการ์ดเดียวกับทุกที่ในร้าน
    match: row.name_match ? 'name' : 'meaning', // บอกหน้าเว็บว่าขึ้นมาเพราะอะไร
    similarity: row.distance === null ? null : Number((1 - Number(row.distance)).toFixed(3)),
  }));
}

module.exports = { semantic, escapeLike }; // escapeLike ส่งออกไว้ให้ test ตรวจได้โดยไม่ต้องโหลดโมเดล