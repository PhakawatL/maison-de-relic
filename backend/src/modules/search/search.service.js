// service ของ semantic search (R4) — ค้นแบบผสม (hybrid) + ตัวกรอง + เกณฑ์ตัดแบบปรับตามคำค้น
//
// ทำไมผสม: ทดลอง 18 คำแล้ว ความหมายล้วนเก่งกับคำบรรยาย ("เหรียญเงิน" "รถเหล็ก")
// แต่พลาดกับชื่อเฉพาะ ("Charizard" ได้อันดับ 3 · "กันดั้ม" ไม่เจอ Gundam เลย)
// จึงให้ชิ้นที่ "ชื่อตรงคำค้น" ขึ้นก่อน แล้วตามด้วยชิ้นที่ "ความหมายใกล้"
//
// ทำไมต้องมีเกณฑ์ตัด: ค้นตามความหมาย "ทุกชิ้นมีคะแนนความใกล้" ไม่มีคำว่าไม่ตรง
// ถ้าไม่ตัด ค้นอะไรก็ได้ทั้งร้าน (ค้น "นาฬิกา" ทั้งที่ร้านไม่มีนาฬิกา ก็ได้เหรียญมาเต็มหน้า)
const { query } = require('../../db/pool');
const { SUMMARY_COLUMNS, FROM_JOINS, toSummary } = require('../products/products.service');
const { embedText } = require('./embedding');
const { expandQuery } = require('./synonyms');

// ---------- เกณฑ์ตัด (ได้จากทดลองคำค้นจริง 12 คำ) ----------
// เก็บชิ้นที่ similarity ≥ max(MIN_SIMILARITY, คะแนนของอันดับ 1 − MAX_GAP)
//   MIN_SIMILARITY = เกณฑ์ขั้นต่ำตายตัว (absolute) → ไม่มีของเกี่ยวเลย ก็ตอบ "ไม่พบ" (นาฬิกา: ที่ 1 ได้แค่ 0.27)
//   MAX_GAP        = ห่างจากที่ 1 ได้ไม่เกิน (relative) → มีของตรงชัด ไม่เอาของที่แย่กว่ามากมาปน
//                    (ตุ๊กตาน่ารัก: Bunny 0.76 → ตัดที่ 0.56 · Luffy 0.40 ไม่ติดมา)
// ใช้ max = เลือกเส้นที่เข้มกว่า → เส้นตัดขยับตามคำค้น (dynamic threshold)
// ชิ้นที่ชื่อตรงคำค้น เก็บเสมอ ไม่ต้องผ่านเกณฑ์นี้
const MIN_SIMILARITY = 0.35;
const MAX_GAP = 0.2;

// คำค้นจากผู้ใช้ไปอยู่ใน LIKE → ต้องหนี % _ \ ไม่งั้นพิมพ์ "%" แล้วจะตรงกับทุกชิ้น
const escapeLike = (text) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/**
 * filters: { q, category, condition, minPrice, maxPrice, limit }
 *   category รับได้ทั้ง id (ตัวเลข) และ slug เหมือน GET /products
 */
async function semantic({ q, category, condition, minPrice, maxPrice, limit }) {
  const original = q.trim();
  const expanded = expandQuery(original); // "ฟิกเกอร์กันดั้ม" → "ฟิกเกอร์ Gundam"
  const vector = await embedText(expanded); // แปลงคำค้น (ที่แปลงคำทับศัพท์แล้ว) เป็นเวกเตอร์

  // ---------- ตัวกรอง → อยู่ใน WHERE (กรองก่อนเรียงตามความหมาย = pre-filtering) ----------
  // ผลที่ได้ทุกชิ้นตรงตัวกรอง และเกณฑ์ตัดคิดจาก "อันดับ 1 ในกลุ่มที่กรองแล้ว"
  const params = [`[${vector.join(',')}]`, `%${escapeLike(original)}%`, `%${escapeLike(expanded)}%`];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  const where = [`p.status = 'available'`, 'p.stock_quantity > 0'];
  if (category !== undefined) {
    where.push(typeof category === 'number' ? `p.category_id = ${add(category)}` : `c.slug = ${add(category)}`);
  }
  if (condition) where.push(`p.condition = ${add(condition)}`);
  if (minPrice !== undefined) where.push(`p.price >= ${add(minPrice)}`);
  if (maxPrice !== undefined) where.push(`p.price <= ${add(maxPrice)}`);
  // ไม่มีเวกเตอร์ก็ยังเจอได้ ถ้าชื่อตรง (เช่นสินค้าเพิ่งลง embedProduct ยังไม่เสร็จ)
  where.push('(p.embedding IS NOT NULL OR p.title ILIKE $2 OR p.title ILIKE $3)');

  const { rows } = await query(
    `SELECT ${SUMMARY_COLUMNS},
            (p.title ILIKE $2 OR p.title ILIKE $3) AS name_match,
            1 - (p.embedding <=> $1::vector)       AS similarity
       ${FROM_JOINS}
      WHERE ${where.join(' AND ')}
      -- ชื่อตรงก่อน (TRUE มาก่อน FALSE เมื่อเรียง DESC) → แล้วตามความใกล้ · ไม่มีเวกเตอร์ไปท้าย
      ORDER BY name_match DESC, similarity DESC NULLS LAST, p.product_id`,
    params
  );

  // ---------- เกณฑ์ตัด ----------
  // คะแนนสูงสุดของชิ้นที่มีเวกเตอร์ (ไม่มีเลย → ใช้แค่ขั้นต่ำ)
  const top = Math.max(0, ...rows.filter((r) => r.similarity !== null).map((r) => Number(r.similarity)));
  const cut = Math.max(MIN_SIMILARITY, top - MAX_GAP);
  const kept = rows.filter((r) => r.name_match || (r.similarity !== null && Number(r.similarity) >= cut));

  return kept.slice(0, limit).map((row) => ({
    ...toSummary(row), // รูปการ์ดเดียวกับทุกที่ในร้าน
    match: row.name_match ? 'name' : 'meaning', // บอกหน้าเว็บว่าขึ้นมาเพราะอะไร
    similarity: row.similarity === null ? null : Number(Number(row.similarity).toFixed(3)),
  }));
}

module.exports = { semantic, escapeLike, MIN_SIMILARITY, MAX_GAP }; // escapeLike ส่งออกไว้ให้ test ตรวจได้โดยไม่ต้องโหลดโมเดล
