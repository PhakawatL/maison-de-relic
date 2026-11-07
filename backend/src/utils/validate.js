// ตัวช่วยตรวจข้อมูลที่ส่งมาจากหน้าเว็บ (R1) — ใช้ใน module ของ R1 (support, reviews, refunds)
//
// แนวคิด: ตรวจทุกช่องให้ครบก่อน แล้วค่อยตอบ 400 ครั้งเดียวพร้อมบอกทุกช่องที่ผิด
// หน้าเว็บจะได้แสดง error ใต้ทุกช่องพร้อมกัน ไม่ต้องกดส่งแล้วเจอทีละช่อง
//
//   const check = new Checker();
//   const subject = check.text(body.subject, 'subject', { required: true, max: 150 });
//   const category = check.oneOf(body.category, 'category', CATEGORIES, { required: true });
//   const orderId = check.positiveInt(body.order_id, 'order_id');
//   check.done();   // มีช่องผิด → throw 400 VALIDATION_ERROR { details: [{ field, issue }, ...] }
const AppError = require('./AppError');

/** ?a=1&a=2 จะได้ array มา → ใช้ค่าแรก */
function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

/** รหัสใน URL (เช่น /tickets/:id) ต้องเป็นจำนวนเต็มบวก ไม่งั้น 400 INVALID_ID */
function parseId(raw, message = 'รหัสไม่ถูกต้อง') {
  const ok = typeof raw === 'string' && /^[1-9]\d{0,15}$/.test(raw);
  if (!ok) throw AppError.badRequest('INVALID_ID', message);
  return Number(raw);
}

class Checker {
  constructor(message = 'ข้อมูลไม่ถูกต้อง') {
    this.message = message;
    this.errors = [];
  }

  fail(field, issue) {
    this.errors.push({ field, issue });
    return undefined;
  }

  /** มีช่องที่ผิด → 400 VALIDATION_ERROR พร้อมรายการช่องที่ผิดทั้งหมด */
  done() {
    if (this.errors.length) throw AppError.badRequest('VALIDATION_ERROR', this.message, this.errors);
  }

  /**
   * ข้อความ: ตัดช่องว่างหัวท้าย · ไม่ส่งมา (undefined) → undefined
   * ส่ง null หรือข้อความว่าง → null (ถ้า required → error)
   */
  text(value, field, { required = false, min = 0, max = 1000 } = {}) {
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
      if (required) return this.fail(field, 'required');
      return value === undefined ? undefined : null;
    }
    if (typeof value !== 'string') return this.fail(field, 'ต้องเป็นข้อความ');
    const trimmed = value.trim();
    if (trimmed.length < min) return this.fail(field, `ต้องยาวอย่างน้อย ${min} ตัวอักษร`);
    if (trimmed.length > max) return this.fail(field, `ยาวได้ไม่เกิน ${max} ตัวอักษร`);
    return trimmed;
  }

  /** ค่าที่ต้องเป็นหนึ่งในรายการที่กำหนด */
  oneOf(value, field, allowed, { required = false } = {}) {
    if (value === undefined || value === null || value === '') {
      return required ? this.fail(field, 'required') : undefined;
    }
    if (!allowed.includes(value)) return this.fail(field, `ต้องเป็นหนึ่งใน ${allowed.join(', ')}`);
    return value;
  }

  /** จำนวนเต็มบวก — รับได้ทั้งตัวเลข (body JSON) และข้อความตัวเลข (query string) */
  positiveInt(value, field, { required = false, max = Number.MAX_SAFE_INTEGER } = {}) {
    if (value === undefined || value === null || value === '') {
      return required ? this.fail(field, 'required') : undefined;
    }
    const ok =
      (typeof value === 'number' && Number.isInteger(value)) || (typeof value === 'string' && /^\d{1,16}$/.test(value));
    const n = Number(value);
    if (!ok || n < 1 || n > max) {
      return this.fail(field, max === Number.MAX_SAFE_INTEGER ? 'ต้องเป็นจำนวนเต็มบวก' : `ต้องเป็นจำนวนเต็ม 1–${max}`);
    }
    return n;
  }

  /** ลิงก์ http:// หรือ https:// */
  url(value, field, { max = 500 } = {}) {
    const text = this.text(value, field, { max });
    if (text === undefined || text === null) return text;
    if (!/^https?:\/\/\S+$/i.test(text)) return this.fail(field, 'ต้องเป็นลิงก์ที่ขึ้นต้นด้วย http:// หรือ https://');
    return text;
  }
}

/**
 * อ่าน ?page=&pageSize= และตัวกรองแบบ "เลือกจากรายการ" จาก query string
 *   const { page, pageSize, filters } = parseListQuery(req.query, {
 *     filters: { status: ['all', 'open', 'pending', 'closed'] },   // ค่าแรก = ค่าเริ่มต้น
 *     search: true,                                              // รับ ?q= (ไม่เกิน 100 ตัวอักษร)
 *   });
 */
function parseListQuery(qs, { filters = {}, search = false, defaultPageSize = 20, maxPageSize = 50 } = {}) {
  const check = new Checker('เงื่อนไขการค้นหาไม่ถูกต้อง');
  const get = (key) => {
    const v = firstValue(qs[key]);
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
  };

  const result = { filters: {} };
  if (search) {
    const q = get('q');
    if (q && q.length > 100) check.fail('q', 'ยาวได้ไม่เกิน 100 ตัวอักษร');
    else result.q = q;
  }
  for (const [key, allowed] of Object.entries(filters)) {
    result.filters[key] = check.oneOf(get(key) ?? allowed[0], key, allowed) ?? allowed[0];
  }
  result.page = check.positiveInt(get('page'), 'page') ?? 1;
  result.pageSize = check.positiveInt(get('pageSize'), 'pageSize', { max: maxPageSize }) ?? defaultPageSize;
  check.done();
  return result;
}

module.exports = { Checker, parseId, parseListQuery, firstValue };
