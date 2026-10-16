// controller ของสินค้า (R3): อ่าน query/params → ตรวจค่า → เรียก service → ตอบ { data, meta }
const AppError = require('../../utils/AppError');
const service = require('./products.service');

const CONDITIONS = ['new', 'like_new', 'excellent', 'good', 'fair', 'poor'];
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw AppError.badRequest('INVALID_ID', 'รหัสสินค้าไม่ถูกต้อง');
  }
  return id;
}

/** ตรวจ query string ทั้งหมดก่อนส่งให้ service ถ้าผิดตอบ 400 พร้อมบอกว่าช่องไหนผิด */
function parseListQuery(qs) {
  const errors = [];
  const filters = {};

  // ?a=1&a=2 จะได้ array มา → ใช้ค่าแรกพอ
  const get = (key) => {
    const v = Array.isArray(qs[key]) ? qs[key][0] : qs[key];
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
  };

  const intParam = (key, { min = 1, max = Infinity } = {}) => {
    const raw = get(key);
    if (raw === undefined) return undefined;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      errors.push({ field: key, issue: `ต้องเป็นจำนวนเต็ม ${min}–${max === Infinity ? '∞' : max}` });
      return undefined;
    }
    return n;
  };

  const priceParam = (key) => {
    const raw = get(key);
    if (raw === undefined) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      errors.push({ field: key, issue: 'ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป' });
      return undefined;
    }
    return n;
  };

  // category / series: ตัวเลข = id, ข้อความ = slug
  const idOrSlug = (key) => {
    const raw = get(key);
    if (raw === undefined) return undefined;
    if (/^\d+$/.test(raw)) return Number(raw);
    if (/^[a-z0-9-]+$/.test(raw)) return raw;
    errors.push({ field: key, issue: 'ต้องเป็นรหัส (ตัวเลข) หรือ slug เช่น figures' });
    return undefined;
  };

  filters.q = get('q');
  if (filters.q && filters.q.length > 100) {
    errors.push({ field: 'q', issue: 'ยาวได้ไม่เกิน 100 ตัวอักษร' });
  }
  filters.category = idOrSlug('category');
  filters.series = idOrSlug('series');

  filters.condition = get('condition');
  if (filters.condition && !CONDITIONS.includes(filters.condition)) {
    errors.push({ field: 'condition', issue: `ต้องเป็นหนึ่งใน ${CONDITIONS.join(', ')}` });
  }

  filters.minPrice = priceParam('minPrice');
  filters.maxPrice = priceParam('maxPrice');
  if (
    filters.minPrice !== undefined &&
    filters.maxPrice !== undefined &&
    filters.minPrice > filters.maxPrice
  ) {
    errors.push({ field: 'minPrice', issue: 'ต้องไม่มากกว่า maxPrice' });
  }

  filters.inStock = get('inStock') === 'true';

  filters.sort = get('sort') || 'newest';
  if (!service.SORTS[filters.sort]) {
    errors.push({ field: 'sort', issue: `ต้องเป็นหนึ่งใน ${Object.keys(service.SORTS).join(', ')}` });
  }

  filters.page = intParam('page') ?? 1;
  filters.pageSize = intParam('pageSize', { max: MAX_PAGE_SIZE }) ?? DEFAULT_PAGE_SIZE;

  if (errors.length) {
    throw AppError.badRequest('VALIDATION_ERROR', 'เงื่อนไขการค้นหาไม่ถูกต้อง', errors);
  }
  return filters;
}

// GET /api/products
async function list(req, res) {
  const filters = parseListQuery(req.query);
  const { items, total } = await service.list(filters);
  res.json({
    data: items,
    meta: { page: filters.page, pageSize: filters.pageSize, total },
  });
}

// GET /api/products/:id
async function getById(req, res) {
  const product = await service.getById(parseId(req.params.id));
  if (!product) throw AppError.notFound('PRODUCT_NOT_FOUND', 'ไม่พบสินค้านี้');
  res.json({ data: product });
}

module.exports = { list, getById };
