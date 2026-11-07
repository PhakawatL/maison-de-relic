// controller ของ event (R4): อ่าน body → ตรวจข้อมูล → หาผู้ใช้จาก token (ถ้ามี) → ส่งให้ service
const { requireAuth } = require('../../middleware/auth');
const { Checker } = require('../../utils/validate');
const service = require('./events.service');

/**
 * หาผู้ใช้จาก token แบบ "ไม่บังคับ"
 * - ไม่มี header Authorization → null (ผู้ใช้ทั่วไปที่ยังไม่ล็อกอิน)
 * - มี token และใช้ได้ → ข้อมูลผู้ใช้
 * - token หมดอายุ / ผิด / บัญชีถูกปิด → null (ไม่ตอบ 401 เพราะ event ไม่ใช่เรื่องที่ต้องห้ามผู้ใช้)
 * เรียก requireAuth ของ R2 ซ้ำ แทนการเขียนตรวจ token เอง จะได้ใช้กติกาเดียวกันทั้งระบบ
 */
async function optionalUser(req) {
  if (!req.get('Authorization')) return null;
  try {
    await requireAuth(req, null, () => {}); // ผ่าน → requireAuth ใส่ผู้ใช้ไว้ที่ req.user
    return req.user;
  } catch {
    return null;
  }
}

// POST /api/events  body: { product_id, event_type, session_id }
async function create(req, res) {
  const body = req.body || {};
  // ตรวจทุกช่องก่อน แล้วตอบ 400 ครั้งเดียวพร้อมบอกทุกช่องที่ผิด (ตัวช่วย Checker จาก utils/validate.js)
  const check = new Checker();
  const productId = check.positiveInt(body.product_id, 'product_id', { required: true });
  const eventType = check.oneOf(body.event_type, 'event_type', service.EVENT_TYPES, { required: true });
  // session_id = รหัสสุ่มจากหน้าเว็บ (UUID ยาว 36 ตัว) จำกัดความยาวกันส่งข้อความยาว ๆ มาเต็มฐานข้อมูล
  const sessionId = check.text(body.session_id, 'session_id', { required: true, max: 100 });
  check.done();

  // ไม่รับ user_id จาก body เด็ดขาด — ใครก็ส่งเลขของคนอื่นมาได้ ต้องอ่านจาก token เท่านั้น
  const user = await optionalUser(req);
  const event = await service.record({ productId, eventType, sessionId, userId: user ? user.user_id : null });
  res.status(201).json({ data: event });
}

module.exports = { create };
