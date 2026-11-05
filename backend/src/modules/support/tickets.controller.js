// controller ของระบบแจ้งปัญหา (R1 · S12): ตรวจข้อมูลที่ส่งมา → เรียก service → ตอบ { data }
const AppError = require('../../utils/AppError');
const { Checker, parseId, parseListQuery } = require('../../utils/validate');
const service = require('./tickets.service');

const BODY_MAX = 2000;
const notFound = () => AppError.notFound('TICKET_NOT_FOUND', 'ไม่พบเคสนี้');
const ticketId = (raw) => parseId(raw, 'รหัสเคสไม่ถูกต้อง');

// =====================================================================
// ฝั่งลูกค้า: /api/support-tickets
// =====================================================================

/**
 * ตรวจข้อมูลเปิดเคส
 *   เคสทั่วไป:    { subject, category, body, order_id? }          ต้องมี subject และ body
 *   รายงานสินค้า: { product_id, category, body? }                  หัวข้อระบบตั้งให้ · body ไม่บังคับ
 */
function parseCreate(input) {
  const body = input && typeof input === 'object' ? input : {};
  const check = new Checker();
  const productId = check.positiveInt(body.product_id, 'product_id');
  const isReport = productId !== undefined;

  const data = {
    category: check.oneOf(
      body.category,
      'category',
      isReport ? [...service.PRODUCT_REPORT_CATEGORIES, 'other'] : service.CATEGORIES,
      { required: true }
    ),
    body: check.text(body.body, 'body', { required: !isReport, max: BODY_MAX }) ?? '',
    order_id: check.positiveInt(body.order_id, 'order_id'),
  };
  if (isReport) {
    data.product_id = productId;
  } else {
    data.subject = check.text(body.subject, 'subject', { required: true, min: 3, max: service.SUBJECT_MAX });
  }
  check.done();
  return data;
}

// POST /api/support-tickets
async function create(req, res) {
  const ticket = await service.create(req.user.user_id, parseCreate(req.body));
  res.status(201).json({ data: ticket });
}

// GET /api/support-tickets?status=&page=&pageSize=
async function listMine(req, res) {
  const { page, pageSize, filters } = parseListQuery(req.query, {
    filters: { status: ['all', ...service.STATUSES] },
  });
  const { items, total } = await service.listForUser(req.user.user_id, { status: filters.status, page, pageSize });
  res.json({ data: items, meta: { page, pageSize, total } });
}

// GET /api/support-tickets/:id
async function getMine(req, res) {
  const ticket = await service.getForUser(req.user.user_id, ticketId(req.params.id));
  if (!ticket) throw notFound();
  res.json({ data: ticket });
}

// =====================================================================
// ฝั่งผู้ดูแล: /api/admin/support-tickets
// =====================================================================

// GET /api/admin/support-tickets?q=&category=&status=&assigned=&page=&pageSize=
async function list(req, res) {
  const { q, page, pageSize, filters } = parseListQuery(req.query, {
    search: true,
    filters: {
      category: ['all', ...service.CATEGORIES],
      status: ['all', ...service.STATUSES],
      assigned: ['all', 'me', 'unassigned'],
    },
  });
  const { items, total, counts } = await service.list(req.user.user_id, { q, ...filters, page, pageSize });
  res.json({ data: items, meta: { page, pageSize, total, counts } });
}

// GET /api/admin/support-tickets/assignees  ผู้ดูแลที่เลือกเป็นผู้รับผิดชอบได้
async function assignees(req, res) {
  res.json({ data: await service.listAssignees() });
}

// GET /api/admin/support-tickets/:id
async function getById(req, res) {
  const ticket = await service.getById(ticketId(req.params.id));
  if (!ticket) throw notFound();
  res.json({ data: ticket });
}

/** PATCH: ส่งเฉพาะช่องที่จะแก้ { admin_reply, status, assigned_to } อย่างน้อย 1 ช่อง */
function parseUpdate(input) {
  const body = input && typeof input === 'object' ? input : {};
  const check = new Checker();
  const changes = {};
  if (body.admin_reply !== undefined) {
    changes.admin_reply = check.text(body.admin_reply, 'admin_reply', { max: BODY_MAX }); // ว่าง / null = ลบคำตอบ
  }
  if (body.status !== undefined) {
    changes.status = check.oneOf(body.status, 'status', service.STATUSES, { required: true });
  }
  if (body.assigned_to !== undefined) {
    changes.assigned_to = body.assigned_to === null ? null : check.positiveInt(body.assigned_to, 'assigned_to');
  }
  check.done();
  if (Object.keys(changes).length === 0) {
    throw AppError.badRequest('VALIDATION_ERROR', 'ไม่มีข้อมูลที่จะแก้ไข');
  }
  return changes;
}

// PATCH /api/admin/support-tickets/:id
async function update(req, res) {
  const id = ticketId(req.params.id);
  const ticket = await service.update(req.user.user_id, id, parseUpdate(req.body));
  if (!ticket) throw notFound();
  res.json({ data: ticket });
}

// DELETE /api/admin/support-tickets/:id  (owner)
async function remove(req, res) {
  const deleted = await service.remove(req.user.user_id, ticketId(req.params.id));
  if (!deleted) throw notFound();
  res.status(204).end();
}

module.exports = { create, listMine, getMine, list, assignees, getById, update, remove };
