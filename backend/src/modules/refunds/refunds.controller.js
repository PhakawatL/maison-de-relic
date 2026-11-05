// controller ของคำขอคืนเงิน (R1 · S9): ตรวจข้อมูลที่ส่งมา → เรียก service → ตอบ { data }
const AppError = require('../../utils/AppError');
const { Checker, parseId, parseListQuery } = require('../../utils/validate');
const service = require('./refunds.service');

const notFound = () => AppError.notFound('REFUND_NOT_FOUND', 'ไม่พบคำขอคืนเงินนี้');
const refundId = (raw) => parseId(raw, 'รหัสคำขอไม่ถูกต้อง');
const ACTIONS = ['approve', 'reject', 'refund'];

// =====================================================================
// ฝั่งลูกค้า: /api/refund-requests
// =====================================================================

// GET /api/refund-requests/refundable  สินค้าที่ยังขอคืนเงินได้
async function refundable(req, res) {
  res.json({ data: await service.listRefundable(req.user.user_id) });
}

// POST /api/refund-requests  { order_item_id, refund_qty, reason, evidence_url? }
async function create(req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const check = new Checker();
  const data = {
    order_item_id: check.positiveInt(body.order_item_id, 'order_item_id', { required: true }),
    refund_qty: check.positiveInt(body.refund_qty, 'refund_qty', { required: true, max: 1000 }),
    reason: check.text(body.reason, 'reason', { required: true, min: 5, max: 1000 }),
    evidence_url: check.url(body.evidence_url, 'evidence_url') ?? null,
  };
  check.done();
  const refund = await service.create(req.user.user_id, data);
  res.status(201).json({ data: refund });
}

// GET /api/refund-requests?status=&page=&pageSize=
async function listMine(req, res) {
  const { page, pageSize, filters } = parseListQuery(req.query, {
    filters: { status: ['all', ...service.STATUSES] },
  });
  const { items, total } = await service.listForUser(req.user.user_id, { status: filters.status, page, pageSize });
  res.json({ data: items, meta: { page, pageSize, total } });
}

// GET /api/refund-requests/:id
async function getMine(req, res) {
  const refund = await service.getForUser(req.user.user_id, refundId(req.params.id));
  if (!refund) throw notFound();
  res.json({ data: refund });
}

// =====================================================================
// ฝั่งผู้ดูแล: /api/admin/refund-requests
// =====================================================================

// GET /api/admin/refund-requests?q=&status=&page=&pageSize=
async function list(req, res) {
  const { q, page, pageSize, filters } = parseListQuery(req.query, {
    search: true,
    filters: { status: ['all', ...service.STATUSES] },
  });
  const { items, total, counts } = await service.list({ q, status: filters.status, page, pageSize });
  res.json({ data: items, meta: { page, pageSize, total, counts } });
}

// GET /api/admin/refund-requests/:id
async function getById(req, res) {
  const refund = await service.getById(refundId(req.params.id));
  if (!refund) throw notFound();
  res.json({ data: refund });
}

// PATCH /api/admin/refund-requests/:id  { action: approve | reject | refund, restock_decision?, note? }
async function update(req, res) {
  const id = refundId(req.params.id);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const check = new Checker();
  const action = check.oneOf(body.action, 'action', ACTIONS, { required: true });
  const change = {
    action,
    // ไม่อนุมัติต้องบอกเหตุผล (เก็บใน admin_action_log ไว้ตอบลูกค้าที่ถามเข้ามาทีหลัง)
    note: check.text(body.note, 'note', { required: action === 'reject', max: 300 }) ?? null,
  };
  if (change.action === 'approve') {
    change.restock_decision = check.oneOf(body.restock_decision, 'restock_decision', service.RESTOCK_DECISIONS, {
      required: true,
    });
  }
  check.done();
  const refund = await service.update(req.user.user_id, id, change);
  if (!refund) throw notFound();
  res.json({ data: refund });
}

module.exports = { refundable, create, listMine, getMine, list, getById, update };
