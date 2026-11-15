// controller ของ semantic search (R4)
const { Checker, firstValue } = require('../../utils/validate');
const service = require('./search.service');

const MAX_LIMIT = 50; // เพดานกันพลาด (จำนวนจริงขึ้นกับเกณฑ์ตัดใน service) · เท่ากับ pageSize สูงสุดของ GET /products
// สภาพสินค้า — ชุดเดียวกับ CHECK ในตาราง product และ API สินค้าของ R3
const CONDITIONS = ['new', 'like_new', 'excellent', 'good', 'fair', 'poor'];

// GET /api/search/semantic?q=กันดั้ม&category=figures&condition=good&minPrice=500&maxPrice=3000&limit=50
// ตัวกรองชื่อเดียวกับ GET /products หน้า Search จึงส่งเงื่อนไขชุดเดิมมาได้เลย
// (inStock / sort / page ไม่ใช้: semantic แสดงเฉพาะของที่มีอยู่แล้ว · เรียงตามความใกล้เสมอ · ไม่แบ่งหน้า)
async function semantic(req, res) {
  const check = new Checker('เงื่อนไขไม่ถูกต้อง');
  const get = (key) => {
    const v = firstValue(req.query[key]);
    return v === undefined || v === '' ? undefined : v;
  };

  // q บังคับ ยาวไม่เกิน 100 ตัวอักษร (กันข้อความยาวมาก ๆ ไปให้โมเดลคิดนาน)
  // text() ตัดเว้นวรรคหัวท้ายให้ · ว่างหรือมีแต่เว้นวรรค → 400 required
  const q = check.text(get('q'), 'q', { required: true, max: 100 });
  const limit = check.positiveInt(get('limit'), 'limit', { max: MAX_LIMIT }) ?? MAX_LIMIT;

  // category: ตัวเลข = id · ข้อความ = slug (เหมือน GET /products)
  let category = get('category');
  if (category !== undefined) {
    if (/^\d+$/.test(category)) category = Number(category);
    else if (!/^[a-z0-9-]+$/.test(category)) check.fail('category', 'ต้องเป็นรหัส (ตัวเลข) หรือ slug เช่น figures');
  }
  const condition = check.oneOf(get('condition'), 'condition', CONDITIONS);

  // ราคา: ตัวเลขตั้งแต่ 0 ขึ้นไป · ต่ำสุดห้ามมากกว่าสูงสุด
  const price = (key) => {
    const raw = get(key);
    if (raw === undefined) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      check.fail(key, 'ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
      return undefined;
    }
    return n;
  };
  const minPrice = price('minPrice');
  const maxPrice = price('maxPrice');
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    check.fail('minPrice', 'ต้องไม่มากกว่า maxPrice');
  }

  check.done(); // ผิดช่องไหนบ้าง ตอบ 400 ทีเดียวพร้อมบอกทุกช่อง (ก่อนเรียกโมเดล)
  const { items, mode } = await service.semantic({ q, category, condition, minPrice, maxPrice, limit });
  // meta.mode บอกว่าได้ผลแบบไหน: 'semantic' = ผสมชื่อ + ความหมาย · 'name' = ทางสำรอง (โมเดลยังไม่พร้อม/พัง)
  res.json({ data: items, meta: { mode } });
}

module.exports = { semantic };
