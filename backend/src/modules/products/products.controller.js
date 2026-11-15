// controller ของสินค้า (R3): อ่าน query/params → ตรวจค่า → เรียก service → ตอบ { data, meta }
const AppError = require('../../utils/AppError');
const service = require('./products.service');

const CONDITIONS = ['new', 'like_new', 'excellent', 'good', 'fair', 'poor'];
const STATUSES = ['available', 'hidden', 'draft'];
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw AppError.badRequest('INVALID_ID', 'รหัสสินค้าไม่ถูกต้อง');
  }
  return id;
}

/** ตรวจ query string ทั้งหมดก่อนส่งให้ service ถ้าผิดตอบ 400 พร้อมบอกว่าช่องไหนผิด
 *  admin = true → รับ ?status= เพิ่ม (หน้าร้านไม่รับ เพราะเห็นแค่ available อยู่แล้ว) */
function parseListQuery(qs, { admin = false } = {}) {
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

  if (admin) {
    filters.status = get('status');
    if (filters.status && !STATUSES.includes(filters.status)) {
      errors.push({ field: 'status', issue: `ต้องเป็นหนึ่งใน ${STATUSES.join(', ')}` });
    }
  }

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

// ---------- ตรวจข้อมูลสินค้าที่แอดมินส่งมา (POST / PUT) ----------

const MAX_PRICE = 9999999999.99; // NUMERIC(12,2)
// ช่องเสริมที่เก็บใน product.attributes (JSON) — ตรงกับฟอร์มในหน้า /admin/products
const ATTRIBUTES = {
  year: null,
  size: null,
  material: null,
  original_box: ['with_cert', 'yes', 'no'],
  grading_company: ['none', 'PSA', 'BGS', 'CGC', 'other'],
  grade: null,
};

/**
 * ตรวจ body ทั้งก้อน (PUT = ส่งครบทุกช่องเหมือน POST) ผิดตอบ 400 พร้อม details: [{ field, issue }]
 * หน้าเว็บอ่าน details ไปแสดงใต้ช่องที่ผิดได้เลย
 */
function parseProductBody(body, { forUpdate = false } = {}) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const errors = [];
  const err = (field, issue) => errors.push({ field, issue });
  const text = (v) => (typeof v === 'string' ? v.trim() : v);

  const title = text(b.title);
  if (typeof title !== 'string' || title === '') err('title', 'กรอกชื่อสินค้า');
  else if (title.length > 200) err('title', 'ยาวได้ไม่เกิน 200 ตัวอักษร');

  let description = text(b.description);
  if (description === undefined || description === '') description = null;
  if (description !== null && typeof description !== 'string') err('description', 'ต้องเป็นข้อความ');
  else if (description && description.length > 5000) err('description', 'ยาวได้ไม่เกิน 5000 ตัวอักษร');

  const positiveId = (v) => Number.isInteger(v) && v > 0;
  if (!positiveId(b.category_id)) err('category_id', 'เลือกหมวดหมู่');
  const seriesId = b.series_id === undefined || b.series_id === null || b.series_id === '' ? null : b.series_id;
  if (seriesId !== null && !positiveId(seriesId)) err('series_id', 'รหัสซีรีส์ไม่ถูกต้อง');

  if (!STATUSES.includes(b.status)) err('status', `ต้องเป็นหนึ่งใน ${STATUSES.join(', ')}`);
  if (!CONDITIONS.includes(b.condition)) err('condition', `ต้องเป็นหนึ่งใน ${CONDITIONS.join(', ')}`);

  if (typeof b.price !== 'number' || !Number.isFinite(b.price) || b.price < 0) {
    err('price', 'ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
  } else if (b.price > MAX_PRICE) {
    err('price', 'ราคาสูงเกินไป');
  } else if (Math.round(b.price * 100) / 100 !== b.price) {
    err('price', 'ทศนิยมได้ไม่เกิน 2 ตำแหน่ง');
  }

  // สต็อกตั้งต้นใส่ได้ตอนเพิ่มสินค้าเท่านั้น · PUT ไม่รับ (ส่งมาก็ไม่สนใจ) — เปลี่ยนสต็อกที่ POST /products/:id/stock
  if (!forUpdate) {
    if (!Number.isInteger(b.stock_quantity) || b.stock_quantity < 0) {
      err('stock_quantity', 'จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');
    } else if (b.stock_quantity > 100000) {
      err('stock_quantity', 'จำนวนมากเกินไป');
    }
  }

  const attributes = {};
  const rawAttrs = b.attributes ?? {};
  if (typeof rawAttrs !== 'object' || Array.isArray(rawAttrs)) {
    err('attributes', 'ต้องเป็น object');
  } else {
    for (const [key, raw] of Object.entries(rawAttrs)) {
      if (!(key in ATTRIBUTES)) {
        err(key, 'ไม่รู้จักช่องนี้');
        continue;
      }
      if (raw === null || raw === '') continue; // ช่องว่าง = ไม่เก็บ
      const value = typeof raw === 'number' ? String(raw) : text(raw);
      if (typeof value !== 'string' || value.length > 100) {
        err(key, 'ต้องเป็นข้อความไม่เกิน 100 ตัวอักษร');
      } else if (ATTRIBUTES[key] && !ATTRIBUTES[key].includes(value)) {
        err(key, `ต้องเป็นหนึ่งใน ${ATTRIBUTES[key].join(', ')}`);
      } else if (value !== '') {
        attributes[key] = value;
      }
    }
  }

  if (errors.length) throw AppError.badRequest('VALIDATION_ERROR', 'ข้อมูลสินค้าไม่ถูกต้อง', errors);
  return {
    title,
    description,
    category_id: b.category_id,
    series_id: seriesId,
    status: b.status,
    condition: b.condition,
    price: b.price,
    ...(forUpdate ? {} : { stock_quantity: b.stock_quantity }),
    attributes,
  };
}

const notFound = () => AppError.notFound('PRODUCT_NOT_FOUND', 'ไม่พบสินค้านี้');

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
  if (!product) throw notFound();
  res.json({ data: product });
}

// GET /api/admin/products (แอดมิน · ทุกสถานะ)
async function adminList(req, res) {
  const filters = parseListQuery(req.query, { admin: true });
  const { items, total } = await service.list(filters, { admin: true });
  res.json({
    data: items,
    meta: { page: filters.page, pageSize: filters.pageSize, total },
  });
}

// GET /api/admin/products/:id (แอดมิน · ทุกสถานะ + has_orders)
async function adminGetById(req, res) {
  const product = await service.getById(parseId(req.params.id), { admin: true });
  if (!product) throw notFound();
  res.json({ data: product });
}

// POST /api/products (แอดมิน)
async function create(req, res) {
  const product = await service.create(parseProductBody(req.body), req.user.user_id);
  res.status(201).json({ data: product });
}

// PUT /api/products/:id (แอดมิน) — ไม่เปลี่ยนสต็อก
async function update(req, res) {
  const id = parseId(req.params.id);
  const product = await service.update(id, parseProductBody(req.body, { forUpdate: true }), req.user.user_id);
  if (!product) throw notFound();
  res.json({ data: product });
}

// DELETE /api/products/:id (แอดมิน) — เคยขายแล้วจะซ่อนแทนการลบ ดู result ในคำตอบ
async function remove(req, res) {
  const result = await service.remove(parseId(req.params.id), req.user.user_id);
  if (!result) throw notFound();
  res.json({ data: result });
}

module.exports = { list, getById, adminList, adminGetById, create, update, remove };
