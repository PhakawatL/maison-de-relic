// routes ของ wishlist (R1 · S6 · issue #6)
// ทุก route ต้องล็อกอิน และทำกับ wishlist ของ "ตัวเอง" เท่านั้น
// ดูได้แค่ล็อกอิน ส่วนเพิ่ม / เอาออก ต้องยืนยันอีเมลแล้ว (กติกาเดียวกับที่อยู่ของ R2)
const { Router } = require('express');
const controller = require('./wishlist.controller');
const { requireAuth, requireVerified } = require('../../middleware/auth');

const router = Router();

router.use(requireAuth);

router.get('/', controller.list);                                 // GET    /api/wishlist             สินค้าที่ถูกใจ (ล่าสุดขึ้นก่อน)
router.get('/ids', controller.ids);                               // GET    /api/wishlist/ids         รหัสสินค้าที่ถูกใจ (ไว้ระบายสีปุ่มหัวใจ)
router.post('/', requireVerified, controller.add);                // POST   /api/wishlist             { product_id }
router.delete('/:productId', requireVerified, controller.remove); // DELETE /api/wishlist/:productId

module.exports = router;
