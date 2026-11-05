const AppError = require('../../utils/AppError');
const service = require('./orders.service');
const { parseListQuery } = require('./orders.controller');
const statuses = ['paid','packing','shipped','delivered'];
function id(value) {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value)<1)
    throw AppError.badRequest('INVALID_ID','รหัสคำสั่งซื้อไม่ถูกต้อง');
  return Number(value);
}
function parseFulfillment(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      !statuses.includes(body.expected_status) || !statuses.includes(body.status) ||
      !Number.isSafeInteger(body.expected_version) || body.expected_version < 0)
    throw AppError.badRequest('VALIDATION_ERROR','ข้อมูลสถานะออเดอร์ไม่ถูกต้อง');
  if (Object.keys(body).some(k=>!['expected_status','expected_version','status','carrier','tracking_no'].includes(k)))
    throw AppError.badRequest('VALIDATION_ERROR','ระบุได้เฉพาะสถานะและข้อมูลจัดส่ง');
  const output = { expected_status:body.expected_status,expected_version:body.expected_version,status:body.status };
  for (const [key,max] of [['carrier',100],['tracking_no',100]]) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'string' || body[key].trim().length>max || /[\x00-\x1f\x7f]/.test(body[key]))
      throw AppError.badRequest('VALIDATION_ERROR','ข้อมูลจัดส่งไม่ถูกต้อง',[{field:key,issue:`ข้อความยาวไม่เกิน ${max} ตัวอักษร`}]);
    output[key] = body[key].trim() || null;
  }
  return output;
}
async function requireAdmin(req,res,next) { await service.assertAdmin(req.user.user_id); next(); }
function parseSearch(query) {
  const output = {};
  for (const field of ['q','recipient','tracking_no','order_id']) {
    const value = query[field];
    if (value !== undefined && (typeof value !== 'string' || value.length > 100 || /[\x00-\x1f\x7f]/.test(value)))
      throw AppError.badRequest('VALIDATION_ERROR','คำค้นหาต้องเป็นข้อความไม่เกิน 100 ตัวอักษร',[{field,issue:'invalid search'}]);
    output[field] = (value || '').trim();
  }
  if (output.order_id) {
    const raw = output.order_id.replace(/^ORD-/i,'');
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw)<1)
      throw AppError.badRequest('VALIDATION_ERROR','รหัสออเดอร์ไม่ถูกต้อง',[{field:'order_id',issue:'positive integer or ORD-number required'}]);
    output.order_id = Number(raw);
  } else output.order_id = null;
  return output;
}
async function list(req,res) {
  const filters = parseListQuery(req.query);
  if (req.query.q !== undefined && (typeof req.query.q !== 'string' || req.query.q.length>100 || /[\x00-\x1f\x7f]/.test(req.query.q)))
    throw AppError.badRequest('VALIDATION_ERROR','คำค้นหาต้องเป็นข้อความไม่เกิน 100 ตัวอักษร');
  const result = await service.adminList(req.user.user_id,{...filters,...parseSearch(req.query)});
  res.json({data:result.items,meta:{page:filters.page,pageSize:filters.pageSize,total:result.total}});
}
async function getById(req,res) { res.json({data:await service.adminGetById(req.user.user_id,id(req.params.id))}); }
async function fulfill(req,res) { res.json({data:await service.fulfill(req.user.user_id,id(req.params.id),parseFulfillment(req.body))}); }
async function receive(req,res) { res.json({data:await service.receive(req.user.user_id,id(req.params.id))}); }
module.exports = { requireAdmin,list,getById,fulfill,receive,parseFulfillment,parseSearch };
