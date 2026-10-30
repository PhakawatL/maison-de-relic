// routes ของรีวิวสินค้า (R1 · S11 · issue #7)
//
//   /api/reviews                      (router)                ต้องล็อกอิน · เขียนรีวิวต้องยืนยันอีเมลแล้ว
//   /api/products/:productId/reviews  (productReviewsRouter)  ใครก็ดูได้ ไม่ต้องล็อกอิน
const { Router } = require('express');
const controller = require('./reviews.controller');
const { requireAuth, requireVerified } = require('../../middleware/auth');

const router = Router();
router.use(requireAuth);
router.get('/reviewable', controller.reviewable);          // GET  /api/reviews/reviewable  สินค้าที่รอรีวิว
router.get('/mine', controller.mine);                      // GET  /api/reviews/mine        รีวิวที่เขียนไว้
router.post('/', requireVerified, controller.create);      // POST /api/reviews             { order_item_id, rating, comment? }

// mergeParams = ให้ router นี้อ่าน :productId ที่อยู่ใน path ตอน app.use ได้
const productReviewsRouter = Router({ mergeParams: true });
productReviewsRouter.get('/', controller.listForProduct); // GET  /api/products/:productId/reviews?rating=&page=&pageSize=

module.exports = { router, productReviewsRouter };
