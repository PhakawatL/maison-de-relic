// controller ของรีวิวสินค้า (R1 · S11): ตรวจข้อมูลที่ส่งมา → เรียก service → ตอบ { data }
const AppError = require('../../utils/AppError');
const { Checker, parseId, parseListQuery } = require('../../utils/validate');
const service = require('./reviews.service');

const COMMENT_MAX = 1000;

// POST /api/reviews  { order_item_id, rating, comment? }
async function create(req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const check = new Checker();
  const data = {
    order_item_id: check.positiveInt(body.order_item_id, 'order_item_id', { required: true }),
    rating: check.positiveInt(body.rating, 'rating', { required: true, max: 5 }),
    comment: check.text(body.comment, 'comment', { max: COMMENT_MAX }) ?? null,
  };
  check.done();
  const review = await service.create(req.user.user_id, data);
  res.status(201).json({ data: review });
}

// GET /api/reviews/reviewable  สินค้าที่รอรีวิว
async function reviewable(req, res) {
  res.json({ data: await service.listReviewable(req.user.user_id) });
}

// GET /api/reviews/mine  รีวิวที่เขียนไว้
async function mine(req, res) {
  res.json({ data: await service.listMine(req.user.user_id) });
}

// GET /api/products/:productId/reviews?rating=&page=&pageSize=
async function listForProduct(req, res) {
  const productId = parseId(req.params.productId, 'รหัสสินค้าไม่ถูกต้อง');
  const { page, pageSize, filters } = parseListQuery(req.query, {
    filters: { rating: ['all', '5', '4', '3', '2', '1'] },
    defaultPageSize: 10,
  });
  const rating = filters.rating === 'all' ? undefined : Number(filters.rating);
  const result = await service.listForProduct(productId, { rating, page, pageSize });
  if (!result) throw AppError.notFound('PRODUCT_NOT_FOUND', 'ไม่พบสินค้านี้ หรือสินค้ายังไม่ได้วางขาย');
  res.json({ data: result.items, meta: { page, pageSize, total: result.total, summary: result.summary } });
}

module.exports = { create, reviewable, mine, listForProduct };
