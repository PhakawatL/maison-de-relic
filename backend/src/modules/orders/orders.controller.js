const AppError = require('../../utils/AppError');
const service = require('./orders.service');
const {parseSessionId}=require('./r5-event-contract');
function positive(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) throw AppError.badRequest('VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง', [{ field, issue: 'ต้องเป็นจำนวนเต็มบวก' }]);
  return value;
}
function parse(body, create = false, { offline = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw AppError.badRequest('VALIDATION_ERROR', 'กรุณาระบุข้อมูลสั่งซื้อ');
  if (!Array.isArray(body.product_ids) || !body.product_ids.length || body.product_ids.length > 100)
    throw AppError.badRequest('VALIDATION_ERROR', 'เลือกสินค้า 1–100 รายการต่อคำสั่งซื้อ');
  const product_ids = [...new Set(body.product_ids.map(id => positive(id, 'product_ids')))].sort((a,b) => a-b);
  if (!['standard','express'].includes(body.shipping_method) || !['promptpay','truemoney'].includes(body.payment_method))
    throw AppError.badRequest('VALIDATION_ERROR', 'วิธีส่งหรือวิธีชำระเงินไม่ถูกต้อง');
  const result = { product_ids, address_id: positive(body.address_id, 'address_id'), shipping_method: body.shipping_method, payment_method: body.payment_method };
  if (body.session_id !== undefined) result.session_id=parseSessionId(body.session_id);
  if (create && !offline && body.payment_method === 'truemoney') {
    if (typeof body.phone_number !== 'string' || !/^0[0-9]{9}$/.test(body.phone_number))
      throw AppError.badRequest('VALIDATION_ERROR', 'กรุณาระบุเบอร์ TrueMoney Wallet 10 หลักขึ้นต้นด้วย 0');
    result.phone_number = body.phone_number;
  }
  if (create) {
    if (typeof body.checkout_key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.checkout_key) || typeof body.quote_hash !== 'string' || !/^[0-9a-f]{64}$/.test(body.quote_hash))
      throw AppError.badRequest('VALIDATION_ERROR', 'กรุณาตรวจยอดและระบุรหัสคำขอสั่งซื้อที่ถูกต้อง');
    if (!['succeeded','failed'].includes(body.simulation_result)) throw AppError.badRequest('VALIDATION_ERROR', 'ผลการชำระเงินจำลองไม่ถูกต้อง');
    Object.assign(result, { checkout_key: body.checkout_key.toLowerCase(), quote_hash: body.quote_hash, simulation_result: body.simulation_result });
  }
  return result;
}
async function quote(req, res) { res.json({ data: await service.quote(req.user.user_id, parse(req.body)) }); }
function parseListQuery(query) {
  const allowed = ['paid', 'packing', 'shipped', 'delivered', 'shipping', 'completed', 'cancelled', 'refunded'];
  const status = query.status;
  if (status !== undefined && (typeof status !== 'string' || !allowed.includes(status)))
    throw AppError.badRequest('VALIDATION_ERROR', 'สถานะคำสั่งซื้อไม่ถูกต้อง');
  function integer(key, fallback, max) {
    const raw = query[key];
    if (raw === undefined) return fallback;
    if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw) || Number(raw) > max)
      throw AppError.badRequest('VALIDATION_ERROR', 'ข้อมูลแบ่งหน้าไม่ถูกต้อง', [{ field: key, issue: `ต้องเป็นจำนวนเต็ม 1–${max}` }]);
    return Number(raw);
  }
  return { status, page: integer('page', 1, 1000000), pageSize: integer('pageSize', 20, 50) };
}
async function list(req, res) {
  const filters = parseListQuery(req.query);
  const result = await service.list(req.user.user_id, filters);
  res.json({ data: result.items, meta: { page: filters.page, pageSize: filters.pageSize, total: result.total } });
}
function createDemoController({ orders = service, mode = require('./payment-mode').paymentMode } = {}) {
  return {
    paymentConfig: async (req,res) => res.json({data:{mode:mode(),test_mode:true}}),
    create: async (req,res) => {
      if (mode() !== 'simulated') throw AppError.conflict('PAYMENT_PROVIDER_REQUIRED', 'กรุณาชำระผ่าน Omise Test ที่หน้า Checkout');
      // Offline TrueMoney needs no wallet phone: no provider/wallet is contacted.
      const result = await orders.place(req.user.user_id,parse(req.body,true,{offline:true}));
      res.status(result.replayed?200:201).json({data:result.order,replayed:result.replayed});
    },
  };
}
async function getById(req, res) {
  if (!/^\d+$/.test(req.params.id)) throw AppError.badRequest('INVALID_ID', 'รหัสคำสั่งซื้อไม่ถูกต้อง');
  res.json({ data: await service.getById(req.user.user_id, positive(Number(req.params.id), 'id')) });
}
module.exports = { quote, getById, parse, list, parseListQuery, ...createDemoController(), createDemoController };
